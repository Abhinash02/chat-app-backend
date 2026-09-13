import { BadRequestError, ConflictError, NotFoundError } from '#src/common/errors/index.js';
import { USER_STATUS } from '#src/common/constants/index.js';
import { logger } from '#src/config/logger.js';
import { emitToAll } from '#src/realtime/emitter.js';
import { SOCKET_EVENT } from '#src/realtime/events.js';
import { authRepository } from '#src/modules/auth/auth.repository.js';
import { userRepository } from '#src/modules/users/user.repository.js';
import { adminRepository } from '#src/modules/admin/admin.repository.js';
import { ADMIN_ACTION } from '#src/modules/admin/admin.constants.js';
import { notificationService } from '#src/modules/notifications/notification.service.js';
import {
  DELETION_REQUEST_STATUS,
  REVIEW_WINDOW_HOURS,
} from '#src/modules/account-deletion/deletion.constants.js';
import { deletionRepository } from '#src/modules/account-deletion/deletion.repository.js';

/** Populated or not, the stored `userId` has to come back as a plain id. */
function toUserId(userId) {
  return String(userId?._id ?? userId);
}

function toDto(request) {
  if (!request) return null;

  return {
    id: String(request._id),
    status: request.status,
    reason: request.reason,
    reasonDetail: request.reasonDetail ?? '',
    rejectionReason: request.rejectionReason ?? null,
    reviewedAt: request.reviewedAt ?? null,
    createdAt: request.createdAt,
    reviewWindowHours: REVIEW_WINDOW_HOURS,
  };
}

/**
 * Opens a deletion request. Nothing about the account changes here.
 *
 * The account stays fully usable while it waits — someone who changes their
 * mind mid-review should find everything where they left it, and locking an
 * account we may yet decline to delete would punish them for asking.
 */
export async function requestDeletion({ userId, reason, reasonDetail }) {
  const user = await userRepository.findById(userId);
  if (!user) throw new NotFoundError('Account not found', 'USER_NOT_FOUND');

  if (user.status === USER_STATUS.DELETED) {
    throw new BadRequestError('This account is already closed', 'ACCOUNT_ALREADY_DELETED');
  }

  const existing = await deletionRepository.findPendingByUserId(userId);
  if (existing) {
    throw new ConflictError(
      'You already have a deletion request under review',
      'DELETION_ALREADY_PENDING',
    );
  }

  try {
    const created = await deletionRepository.create({
      userId,
      reason,
      reasonDetail: reasonDetail?.trim() ?? '',
    });

    return toDto(created);
  } catch (error) {
    // The partial unique index is the real guard against a double submit; the
    // read above only catches the unhurried case.
    if (error?.code === 11000) {
      throw new ConflictError(
        'You already have a deletion request under review',
        'DELETION_ALREADY_PENDING',
      );
    }
    throw error;
  }
}

/** What the app shows: the latest request, whatever became of it. */
export async function getMyDeletionRequest({ userId }) {
  const request = await deletionRepository.findLatestByUserId(userId);
  return toDto(request);
}

export async function cancelMyDeletionRequest({ userId }) {
  const pending = await deletionRepository.findPendingByUserId(userId);
  if (!pending) {
    throw new NotFoundError('You have no deletion request to cancel', 'DELETION_NOT_FOUND');
  }

  const updated = await deletionRepository.updateById(pending._id, {
    $set: { status: DELETION_REQUEST_STATUS.CANCELLED },
  });

  return toDto(updated);
}

export async function listAdminRequests({ status, page = 1, limit = 20 } = {}) {
  const { items, total } = await deletionRepository.listAdmin({ status, page, limit });
  const pendingCount = await deletionRepository.countPending();

  return { items, total, page, limit, pendingCount };
}

/**
 * Approving is the only thing that actually closes an account.
 *
 * Setting the status to `deleted` is enough to lock the person out everywhere:
 * `authenticate` rejects that status as `ACCOUNT_NOT_FOUND` and login refuses
 * it too, so the next request from their phone fails and the app drops them
 * back on the welcome screen by itself. Bumping `tokensValidFrom` and revoking
 * the stored sessions closes the window before that next request.
 *
 * Deliberately a status change rather than removing the document: reports filed
 * against an account have to outlive it, which is what the privacy policy
 * already promises.
 */
export async function approveDeletion({ requestId, adminUser, adminNotes, ipAddress }) {
  const request = await deletionRepository.findById(requestId);
  if (!request) throw new NotFoundError('Deletion request not found', 'DELETION_NOT_FOUND');

  if (request.status !== DELETION_REQUEST_STATUS.PENDING) {
    throw new BadRequestError(
      `Cannot approve a request with status "${request.status}"`,
      'INVALID_STATUS',
    );
  }

  const userId = toUserId(request.userId);

  const updatedUser = await userRepository.updateById(userId, {
    $set: {
      status: USER_STATUS.DELETED,
      isOnline: false,
      activeConnections: 0,
      tokensValidFrom: new Date(),
    },
  });
  if (!updatedUser) throw new NotFoundError('Account not found', 'USER_NOT_FOUND');

  await authRepository.revokeAllSessionsForUser(userId).catch((error) => {
    // The status change has already locked them out; a failure here only means
    // a refresh token outlives the account, so it must not fail the approval.
    logger.error({ err: error, userId }, 'Failed to revoke sessions after account deletion');
  });

  emitToAll(SOCKET_EVENT.PRESENCE_UPDATED, {
    userId: String(userId),
    isOnline: false,
    lastSeenAt: new Date(),
  });

  const updated = await deletionRepository.updateById(requestId, {
    $set: {
      status: DELETION_REQUEST_STATUS.APPROVED,
      reviewedByAdminId: adminUser?.id ?? adminUser?._id ?? null,
      reviewedAt: new Date(),
      adminNotes: adminNotes ?? null,
    },
  });

  await adminRepository.recordAction({
    adminId: adminUser?.id ?? adminUser?._id,
    action: ADMIN_ACTION.DELETION_REQUEST_APPROVED,
    targetType: 'user',
    targetId: userId,
    metadata: { requestId: String(requestId), reason: request.reason },
    ipAddress,
  });

  return toDto(updated);
}

/**
 * Declining leaves the account exactly as it was.
 *
 * The person is told, because they are sitting on a "we will get back to you
 * within 24 hours" message and silence would read as the request having been
 * lost. Push is best-effort: they will also see the outcome in Settings.
 */
export async function rejectDeletion({ requestId, adminUser, reason, adminNotes, ipAddress }) {
  const request = await deletionRepository.findById(requestId);
  if (!request) throw new NotFoundError('Deletion request not found', 'DELETION_NOT_FOUND');

  if (request.status !== DELETION_REQUEST_STATUS.PENDING) {
    throw new BadRequestError(
      `Cannot decline a request with status "${request.status}"`,
      'INVALID_STATUS',
    );
  }

  const userId = toUserId(request.userId);

  const updated = await deletionRepository.updateById(requestId, {
    $set: {
      status: DELETION_REQUEST_STATUS.REJECTED,
      rejectionReason: reason,
      reviewedByAdminId: adminUser?.id ?? adminUser?._id ?? null,
      reviewedAt: new Date(),
      adminNotes: adminNotes ?? null,
    },
  });

  notificationService
    .sendToUser({
      userId,
      title: 'About your account deletion request',
      body: reason,
      data: { type: 'account_deletion_rejected' },
    })
    .catch((error) => {
      logger.error({ err: error, userId }, 'Failed to notify user of declined deletion request');
    });

  await adminRepository.recordAction({
    adminId: adminUser?.id ?? adminUser?._id,
    action: ADMIN_ACTION.DELETION_REQUEST_REJECTED,
    targetType: 'user',
    targetId: userId,
    metadata: { requestId: String(requestId), reason },
    ipAddress,
  });

  return toDto(updated);
}

export const accountDeletionService = {
  requestDeletion,
  getMyDeletionRequest,
  cancelMyDeletionRequest,
  listAdminRequests,
  approveDeletion,
  rejectDeletion,
};
