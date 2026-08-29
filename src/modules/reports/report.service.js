import { ConflictError, ForbiddenError, NotFoundError } from '#src/common/errors/index.js';
import { buildPaginationMeta, resolvePagination } from '#src/common/utils/pagination.util.js';
import { logger } from '#src/config/logger.js';
import { chatRepository } from '#src/modules/chat/chat.repository.js';
import { userService } from '#src/modules/users/user.service.js';
import { userRepository } from '#src/modules/users/user.repository.js';
import { reportRepository } from '#src/modules/reports/report.repository.js';
import { REPORT_STATUS } from '#src/modules/reports/report.constants.js';

const SNAPSHOT_MESSAGE_COUNT = 20;

function toReportDto(report) {
  const reporter = report.reporterId;
  const reported = report.reportedUserId;

  return {
    id: String(report._id),
    reason: report.reason,
    details: report.details,
    status: report.status,
    reporter: reporter?.nickname
      ? { id: String(reporter._id), nickname: reporter.nickname, gender: reporter.gender }
      : { id: String(reporter) },
    reportedUser: reported?.nickname
      ? {
          id: String(reported._id),
          nickname: reported.nickname,
          gender: reported.gender,
          status: reported.status,
        }
      : { id: String(reported) },
    messageSnapshots: report.messageSnapshots ?? [],
    reviewNote: report.reviewNote,
    reviewedAt: report.reviewedAt,
    createdAt: report.createdAt,
  };
}

/**
 * Files a report and, by default, blocks the reported account. Someone who
 * feels unsafe should not have to perform two separate actions.
 */
export async function createReport({ user, reportedUserId, reason, details, conversationId, alsoBlock = true }) {
  if (String(user.id) === String(reportedUserId)) {
    throw new ConflictError('You cannot report yourself', 'CANNOT_REPORT_SELF');
  }

  const reported = await userRepository.findById(reportedUserId);
  if (!reported) throw new NotFoundError('This profile is not available', 'USER_NOT_FOUND');

  const existing = await reportRepository.findOpenBetween({
    reporterId: user.id,
    reportedUserId,
  });

  if (existing) {
    throw new ConflictError('You already have an open report for this user', 'REPORT_ALREADY_OPEN');
  }

  // Snapshot the conversation now: the sender can delete their messages later.
  let messageSnapshots = [];
  if (conversationId) {
    const conversation = await chatRepository.findConversationById(conversationId);
    const isParticipant = conversation?.participantIds.some((id) => String(id) === String(user.id));

    if (isParticipant) {
      const { items } = await chatRepository.listMessages({
        conversationId,
        limit: SNAPSHOT_MESSAGE_COUNT,
      });

      messageSnapshots = items
        .filter((message) => String(message.senderId) === String(reportedUserId))
        .map((message) => ({ messageId: message._id, text: message.text, sentAt: message.createdAt }));
    }
  }

  const report = await reportRepository.create({
    reporterId: user.id,
    reportedUserId,
    conversationId: conversationId ?? null,
    reason,
    details: details ?? '',
    messageSnapshots,
  });

  if (alsoBlock) {
    await userService.blockUser({ userId: user.id, targetUserId: reportedUserId });
  }

  const distinctReporters = await reportRepository.countDistinctReportersFor(reportedUserId);
  logger.info(
    { reportId: String(report._id), reportedUserId: String(reportedUserId), distinctReporters },
    'User report filed',
  );

  return {
    report: toReportDto(report),
    blocked: alsoBlock,
    // Surfaced so the admin dashboard can prioritise repeat offenders.
    distinctReporters,
  };
}

export async function listReports({ status, page, limit }) {
  const { skip, page: safePage, limit: safeLimit } = resolvePagination({ page, limit });
  const filter = status ? { status } : {};

  const { items, total } = await reportRepository.list({ filter, skip, limit: safeLimit });

  return {
    items: items.map(toReportDto),
    meta: buildPaginationMeta({ page: safePage, limit: safeLimit, total }),
  };
}

export async function getReport(reportId) {
  const report = await reportRepository.findById(reportId);
  if (!report) throw new NotFoundError('Report not found', 'REPORT_NOT_FOUND');
  return toReportDto(report);
}

export async function reviewReport({ reportId, adminId, status, reviewNote }) {
  if (status === REPORT_STATUS.OPEN) {
    throw new ForbiddenError('A report cannot be moved back to open', 'INVALID_REPORT_STATUS');
  }

  const updated = await reportRepository.updateStatus({ reportId, status, adminId, reviewNote });
  if (!updated) throw new NotFoundError('Report not found', 'REPORT_NOT_FOUND');

  return toReportDto(updated);
}

export async function countOpenReports() {
  return reportRepository.countOpen();
}

export const reportService = {
  createReport,
  listReports,
  getReport,
  reviewReport,
  countOpenReports,
};
