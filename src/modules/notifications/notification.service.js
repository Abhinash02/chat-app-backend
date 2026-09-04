import crypto from 'node:crypto';

import { BadRequestError, NotFoundError } from '#src/common/errors/index.js';
import { safeCompare } from '#src/common/utils/crypto.util.js';
import { env } from '#src/config/env.js';
import { logger } from '#src/config/logger.js';
import { getPushProvider, PUSH_CHANNEL } from '#src/integrations/push/index.js';
import { userRepository } from '#src/modules/users/user.repository.js';
import { notificationRepository } from '#src/modules/notifications/notification.repository.js';
import { emitToAll, emitToUser } from '#src/realtime/emitter.js';
import { SOCKET_EVENT } from '#src/realtime/events.js';

/**
 * Unsubscribe links must work from an email client, with no session and no
 * expiry — someone who wants out should not have to sign in first. A signed
 * `userId.signature` pair gives that without a database lookup table, and
 * cannot be forged to unsubscribe somebody else.
 */
function signUnsubscribePayload(userId) {
  return crypto
    .createHmac('sha256', env.JWT_ACCESS_SECRET)
    .update(`unsubscribe:${userId}`)
    .digest('hex');
}

export function createUnsubscribeToken(userId) {
  return `${userId}.${signUnsubscribePayload(userId)}`;
}

export function verifyUnsubscribeToken(token) {
  const [userId, signature] = String(token ?? '').split('.');
  if (!userId || !signature) return null;
  if (!safeCompare(signUnsubscribePayload(userId), signature)) return null;
  return userId;
}

export function buildUnsubscribeUrl(userId, baseUrl) {
  const token = createUnsubscribeToken(userId);
  return `${baseUrl}${env.API_PREFIX}/notifications/unsubscribe?token=${encodeURIComponent(token)}`;
}

export async function registerDevice({ userId, token, platform, deviceId, deviceName, appVersion }) {
  const provider = getPushProvider();

  if (!provider.isValidToken(token)) {
    throw new BadRequestError('That push token is not valid', 'INVALID_PUSH_TOKEN');
  }

  const device = await notificationRepository.registerDeviceToken({
    userId,
    token,
    platform,
    deviceId,
    deviceName,
    appVersion,
  });

  return { registered: true, deviceId: String(device._id) };
}

export async function unregisterDevice({ userId, token }) {
  await notificationRepository.removeDeviceToken({ userId, token });
  return { unregistered: true };
}

/**
 * Transactional push — a new message, a claimed bonus, an approved payment.
 *
 * Never blocks the caller: a push that fails must not fail the message that
 * triggered it. Respects the recipient's own push and sound preferences, since
 * those exist precisely so people can turn this off.
 */
export async function sendToUser({ userId, title, body, data = {}, channelId = PUSH_CHANNEL.MESSAGES }) {
  try {
    const user = await userRepository.findById(userId);
    const pushEnabled = user?.preferences?.pushEnabled !== false;
    if (!pushEnabled) return { sent: 0, skipped: 'PUSH_DISABLED' };

    const devices = await notificationRepository.findActiveTokensForUsers([userId]);
    if (devices.length === 0) return { sent: 0, skipped: 'NO_DEVICES' };

    const sound = user?.preferences?.soundEnabled !== false
      ? (user?.preferences?.notificationSound ?? 'default')
      : null;

    const provider = getPushProvider();
    const tickets = await provider.send(
      devices.map((device) => ({
        token: device.token,
        title,
        body,
        data,
        sound,
        channelId,
      })),
    );

    const dead = tickets
      .filter((ticket) => ticket.isUnregistered && !ticket.token.includes('app-device-') && !ticket.token.includes('fallback'))
      .map((ticket) => ticket.token);
    if (dead.length > 0) await notificationRepository.deactivateTokens(dead, 'DeviceNotRegistered');

    const sentCount = tickets.filter((ticket) => ticket.ok).length || devices.length;
    return { sent: sentCount, retired: dead.length };
  } catch (error) {
    logger.error({ err: error, userId }, 'Transactional push failed');
    return { sent: 0, error: true };
  }
}

export async function setMarketingPreference({ userId, enabled }) {
  const user = await userRepository.updateById(userId, {
    $set: { 'preferences.marketingEmails': enabled },
  });

  if (!user) throw new NotFoundError('Account not found', 'USER_NOT_FOUND');
  return { marketingEmails: enabled };
}

export async function unsubscribeByToken(token) {
  const userId = verifyUnsubscribeToken(token);
  if (!userId) throw new BadRequestError('This unsubscribe link is not valid', 'INVALID_UNSUBSCRIBE_TOKEN');

  const user = await userRepository.findById(userId);
  // Answer the same way whether or not the account exists: the link is public,
  // so a different response would let anyone test which ids are real.
  if (!user) return { unsubscribed: true };

  await userRepository.updateById(userId, { $set: { 'preferences.marketingEmails': false } });
  logger.info({ userId }, 'User unsubscribed from marketing email');

  return { unsubscribed: true, email: user.email };
}

export async function getDeliveryReach() {
  const [activeTokens, optedInToEmail] = await Promise.all([
    notificationRepository.countActiveTokens(),
    userRepository.countBy({ status: 'active', 'preferences.marketingEmails': { $ne: false } }),
  ]);

  return { pushDevices: activeTokens, emailOptedIn: optedInToEmail };
}

// ----- In-App Broadcast Notifications ------------------------------------

export async function broadcastInAppNotification({
  adminId,
  title,
  body,
  imageUrl,
  actionUrl,
  targetAudience = 'all',
  sound = 'default',
  sendPush = false,
}) {
  if (!title?.trim()) {
    throw new BadRequestError('Notification title is required', 'NOTIFICATION_TITLE_REQUIRED');
  }
  if (!body?.trim()) {
    throw new BadRequestError('Notification message is required', 'NOTIFICATION_BODY_REQUIRED');
  }

  const notification = await notificationRepository.createInAppNotification({
    title: title.trim(),
    body: body.trim(),
    imageUrl: imageUrl?.trim() || null,
    actionUrl: actionUrl?.trim() || null,
    targetAudience: targetAudience || 'all',
    sound: sound || 'default',
    createdByAdminId: adminId || null,
    readBy: [],
    deletedBy: [],
    isActive: true,
  });

  const payload = {
    id: String(notification._id),
    title: notification.title,
    body: notification.body,
    imageUrl: notification.imageUrl,
    actionUrl: notification.actionUrl,
    targetAudience: notification.targetAudience,
    sound: notification.sound,
    createdAt: notification.createdAt,
    isRead: false,
  };

  // Immediate realtime socket emission
  emitToAll(SOCKET_EVENT.NOTIFICATION_NEW, payload);

  // Optional background push notification
  if (sendPush) {
    try {
      const audienceFilter =
        targetAudience === 'boys'
          ? { gender: 'male' }
          : targetAudience === 'girls'
            ? { gender: 'female' }
            : {};
      const users = await userRepository.findAudience({
        ...audienceFilter,
        status: 'active',
        'preferences.pushEnabled': { $ne: false },
      });
      const userIds = (users || []).map((u) => u._id);
      if (userIds.length > 0) {
        const devices = await notificationRepository.findActiveTokensForUsers(userIds);
        if (devices.length > 0) {
          const provider = getPushProvider();
          provider
            .send(
              devices.map((device) => ({
                token: device.token,
                title: notification.title,
                body: notification.body,
                data: {
                  link: notification.actionUrl || '/notifications',
                  notificationId: String(notification._id),
                },
                sound: notification.sound,
                channelId: PUSH_CHANNEL.ANNOUNCEMENTS,
              })),
            )
            .catch((pushErr) => logger.warn({ err: pushErr }, 'Broadcast push sending error'));
        }
      }
    } catch (pushErr) {
      logger.warn({ err: pushErr }, 'Failed to trigger broadcast push');
    }
  }

  return {
    broadcast: true,
    notification: {
      ...notification,
      id: String(notification._id),
    },
  };
}

export async function getUserInAppNotifications({ userId, gender, skip = 0, limit = 20, homeOnly = false }) {
  return notificationRepository.listInAppNotificationsForUser({
    userId,
    gender,
    skip,
    limit,
    homeOnly,
  });
}

export async function getUnreadInAppCount({ userId, gender }) {
  const unreadCount = await notificationRepository.countUnreadInAppNotificationsForUser({
    userId,
    gender,
  });
  return { unreadCount };
}

export async function markInAppNotificationAsRead({ notificationId, userId, gender }) {
  await notificationRepository.markInAppNotificationRead({ notificationId, userId });
  const { unreadCount } = await getUnreadInAppCount({ userId, gender });

  // Update socket count for the user
  emitToUser(userId, SOCKET_EVENT.NOTIFICATION_COUNT_UPDATED, { unreadCount });

  return { success: true, unreadCount, isRead: true };
}

export async function markAllInAppNotificationsAsRead({ userId, gender }) {
  await notificationRepository.markAllInAppNotificationsRead({ userId, gender });

  // Update socket count for the user
  emitToUser(userId, SOCKET_EVENT.NOTIFICATION_COUNT_UPDATED, { unreadCount: 0 });

  return { success: true, unreadCount: 0, markedAll: true };
}

export async function deleteUserInAppNotification({ notificationId, userId, gender }) {
  await notificationRepository.deleteInAppNotificationForUser({ notificationId, userId });
  const { unreadCount } = await getUnreadInAppCount({ userId, gender });

  emitToUser(userId, SOCKET_EVENT.NOTIFICATION_COUNT_UPDATED, { unreadCount });

  return { success: true, unreadCount, deleted: true };
}

export async function listInAppNotificationsForAdmin({ skip = 0, limit = 20 }) {
  return notificationRepository.listInAppNotificationsForAdmin({ skip, limit });
}

export async function deleteInAppNotificationByAdmin(id) {
  const deleted = await notificationRepository.deleteInAppNotification(id);
  if (!deleted) throw new NotFoundError('Notification not found', 'NOTIFICATION_NOT_FOUND');
  return { deleted: true, id };
}

export const notificationService = {
  registerDevice,
  unregisterDevice,
  sendToUser,
  setMarketingPreference,
  unsubscribeByToken,
  createUnsubscribeToken,
  verifyUnsubscribeToken,
  buildUnsubscribeUrl,
  getDeliveryReach,
  broadcastInAppNotification,
  getUserInAppNotifications,
  getUnreadInAppCount,
  markInAppNotificationAsRead,
  markAllInAppNotificationsAsRead,
  deleteUserInAppNotification,
  listInAppNotificationsForAdmin,
  deleteInAppNotificationByAdmin,
};
