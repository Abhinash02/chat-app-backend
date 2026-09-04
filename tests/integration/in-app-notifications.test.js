import { beforeEach, describe, expect, it } from 'vitest';
import { InAppNotificationModel } from '#src/modules/notifications/in-app-notification.model.js';
import { notificationService } from '#src/modules/notifications/notification.service.js';
import { notificationRepository } from '#src/modules/notifications/notification.repository.js';
import { createUser, resetDatabase, toRequestUser } from '../helpers/factories.js';

describe('In-App Broadcast Notifications and User Inbox', () => {
  let admin;
  let boyUser;
  let girlUser;

  beforeEach(async () => {
    await resetDatabase();

    admin = await createUser({ role: 'admin', gender: 'male', nickname: 'AdminBoss' });
    boyUser = await createUser({ role: 'user', gender: 'male', nickname: 'CoolGuy' });
    girlUser = await createUser({ role: 'user', gender: 'female', nickname: 'SweetGirl' });
  });

  it('admin can broadcast a notification with title, body, and image', async () => {
    const result = await notificationService.broadcastInAppNotification({
      adminId: admin._id,
      title: 'Special Festival Offer 🎁',
      body: 'Get 50% extra coins on every top-up today!',
      imageUrl: 'https://example.com/banner.png',
      actionUrl: '/coins',
      targetAudience: 'all',
    });

    expect(result.broadcast).toBe(true);
    expect(result.notification.title).toBe('Special Festival Offer 🎁');
    expect(result.notification.imageUrl).toBe('https://example.com/banner.png');
  });

  it('users receive the notification in their inbox with unread count', async () => {
    // 1. Admin sends global notification
    await notificationService.broadcastInAppNotification({
      adminId: admin._id,
      title: 'Welcome Bonus 🚀',
      body: 'Check out the new voice rooms feature!',
      imageUrl: 'https://example.com/image.png',
      targetAudience: 'all',
    });

    // 2. Boy checks unread count
    const unread = await notificationService.getUnreadInAppCount({
      userId: boyUser._id,
      gender: boyUser.gender,
    });
    expect(unread.unreadCount).toBe(1);

    // 3. Boy fetches inbox
    const inbox = await notificationService.getUserInAppNotifications({
      userId: boyUser._id,
      gender: boyUser.gender,
    });

    expect(inbox.items).toHaveLength(1);
    expect(inbox.items[0].title).toBe('Welcome Bonus 🚀');
    expect(inbox.items[0].isRead).toBe(false);

    // 4. Boy marks notification as read -> count decrements to 0
    const notifId = inbox.items[0].id;
    const readResult = await notificationService.markInAppNotificationAsRead({
      notificationId: notifId,
      userId: boyUser._id,
      gender: boyUser.gender,
    });

    expect(readResult.unreadCount).toBe(0);

    // 5. Boy verifies inbox status
    const verifiedInbox = await notificationService.getUserInAppNotifications({
      userId: boyUser._id,
      gender: boyUser.gender,
    });

    expect(verifiedInbox.items[0].isRead).toBe(true);
    expect(verifiedInbox.unreadCount).toBe(0);
  });

  it('honours gender targeting (boys only vs girls only)', async () => {
    // Broadcast boys only
    await notificationService.broadcastInAppNotification({
      adminId: admin._id,
      title: 'Boys Special Event',
      body: 'Special reward for boys',
      targetAudience: 'boys',
    });

    // Boy should see it
    const boyInbox = await notificationService.getUserInAppNotifications({
      userId: boyUser._id,
      gender: boyUser.gender,
    });
    expect(boyInbox.items).toHaveLength(1);

    // Girl should NOT see it
    const girlInbox = await notificationService.getUserInAppNotifications({
      userId: girlUser._id,
      gender: girlUser.gender,
    });
    expect(girlInbox.items).toHaveLength(0);
    expect(girlInbox.unreadCount).toBe(0);
  });

  it('homeOnly filter only returns notifications created in the last 24 hours', async () => {
    // Create an old notification from 2 days ago
    const oldDate = new Date(Date.now() - 48 * 60 * 60 * 1000);
    await InAppNotificationModel.create({
      title: 'Old Notification',
      body: 'From 2 days ago',
      targetAudience: 'all',
      createdAt: oldDate,
      updatedAt: oldDate,
    });

    // Create a fresh notification
    await InAppNotificationModel.create({
      title: 'Fresh Notification',
      body: 'Today notification',
      targetAudience: 'all',
    });

    // Full inbox has both (2)
    const fullInbox = await notificationService.getUserInAppNotifications({
      userId: boyUser._id,
      gender: boyUser.gender,
    });
    expect(fullInbox.items).toHaveLength(2);

    // Home section only has fresh (<24h)
    const homeInbox = await notificationService.getUserInAppNotifications({
      userId: boyUser._id,
      gender: boyUser.gender,
      homeOnly: true,
    });
    expect(homeInbox.items).toHaveLength(1);
    expect(homeInbox.items[0].title).toBe('Fresh Notification');
  });

  it('user can delete a notification from their inbox', async () => {
    const notif = await InAppNotificationModel.create({
      title: 'To be deleted',
      body: 'Dismiss me',
      targetAudience: 'all',
    });

    await notificationService.deleteUserInAppNotification({
      notificationId: notif._id,
      userId: boyUser._id,
      gender: boyUser.gender,
    });

    const inbox = await notificationService.getUserInAppNotifications({
      userId: boyUser._id,
      gender: boyUser.gender,
    });
    expect(inbox.items).toHaveLength(0);
  });
});
