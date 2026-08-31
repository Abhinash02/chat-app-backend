import { EventModel } from './event.model.js';
import { UserModel } from '#src/modules/users/user.model.js';
import { NotFoundError, BadRequestError } from '#src/common/errors/index.js';
import { getPushProvider, PUSH_CHANNEL } from '#src/integrations/push/index.js';
import { notificationRepository } from '#src/modules/notifications/notification.repository.js';
import { emailService } from '#src/integrations/email/email.service.js';
import { emitToAll } from '#src/realtime/emitter.js';
import { logger } from '#src/config/logger.js';
import { env } from '#src/config/env.js';

function toEventDto(event) {
  if (!event) return null;
  return {
    id: String(event._id),
    title: event.title,
    description: event.description,
    type: event.type,
    badgeText: event.badgeText,
    bannerUrl: event.bannerUrl,
    targetGender: event.targetGender,
    rewardCoins: event.rewardCoins || 0,
    rewardFreeMinutes: event.rewardFreeMinutes || 0,
    discountPercent: event.discountPercent || 0,
    actionUrl: event.actionUrl || 'coins',
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    isActive: event.isActive,
    createdAt: event.createdAt,
  };
}

/** Broadcast push notification and email to targeted audience */
export async function broadcastEvent({ event, sendPush = true, sendEmail = true }) {
  try {
    const userQuery = { status: 'active' };
    if (event.targetGender === 'male') userQuery.gender = 'male';
    if (event.targetGender === 'female') userQuery.gender = 'female';

    const users = await UserModel.find(userQuery).select('_id email name preferences');
    const userIds = users.map((u) => u._id);

    let pushSent = 0;
    let emailsSent = 0;

    // 1. Send Push Notifications
    if (sendPush && userIds.length > 0) {
      const activeDevices = await notificationRepository.findActiveTokensForUsers(userIds);
      if (activeDevices.length > 0) {
        const pushProvider = getPushProvider();
        const tickets = await pushProvider.send(
          activeDevices.map((d) => ({
            token: d.token,
            title: `🎉 ${event.title}`,
            body: event.description.length > 120 ? `${event.description.slice(0, 117)}...` : event.description,
            data: { type: 'event', eventId: String(event._id), actionUrl: event.actionUrl },
            channelId: PUSH_CHANNEL.PROMOTIONS,
          })),
        );
        pushSent = tickets.filter((t) => t.ok).length;
      }
    }

    // 2. Send Emails (Non-blocking background)
    if (sendEmail && users.length > 0) {
      const emailUsers = users.filter((u) => u.email && u.preferences?.marketingEmails !== false);
      for (const u of emailUsers) {
        emailService
          .sendRaw({
            to: u.email,
            subject: `🎉 Special Event: ${event.title} on Vibe Chat`,
            html: `
              <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #1E1B4B;">
                <h1 style="color: #FF4E88; font-size: 24px;">🎉 ${event.title}</h1>
                <p style="font-size: 16px; line-height: 1.6;">${event.description}</p>
                ${
                  event.rewardCoins > 0
                    ? `<div style="background: #FFFBEB; border-left: 4px solid #F59E0B; padding: 12px 16px; margin: 16px 0; border-radius: 8px;">
                        <strong>🪙 Perk:</strong> +${event.rewardCoins} Free Bonus Coins available!
                      </div>`
                    : ''
                }
                ${
                  event.discountPercent > 0
                    ? `<div style="background: #ECFDF5; border-left: 4px solid #10B981; padding: 12px 16px; margin: 16px 0; border-radius: 8px;">
                        <strong>🏷️ Special Discount:</strong> Enjoy ${event.discountPercent}% OFF on Coin Packs!
                      </div>`
                    : ''
                }
                <div style="margin-top: 24px;">
                  <a href="${env.publicApiUrl}" style="background: #FF4E88; color: #FFFFFF; padding: 12px 24px; border-radius: 9999px; text-decoration: none; font-weight: bold; display: inline-block;">
                    Open Vibe Chat Now →
                  </a>
                </div>
                <hr style="border: 0; border-top: 1px solid #E2E8F0; margin: 32px 0 16px;" />
                <p style="font-size: 12px; color: #64748B;">You received this because you are a registered user of Vibe Chat.</p>
              </div>
            `,
          })
          .catch((err) => logger.warn({ err, email: u.email }, 'Event email broadcast failed'));
      }
      emailsSent = emailUsers.length;
    }

    return { pushSent, emailsSent };
  } catch (error) {
    logger.error({ err: error, eventId: event._id }, 'Error broadcasting event');
    return { pushSent: 0, emailsSent: 0, error: true };
  }
}

export async function createEvent({
  title,
  description,
  type,
  badgeText,
  bannerUrl,
  targetGender,
  rewardCoins,
  rewardFreeMinutes,
  discountPercent,
  actionUrl,
  startsAt,
  endsAt,
  isActive = true,
  adminId,
  sendPush = true,
  sendEmail = true,
}) {
  if (!title || !description) {
    throw new BadRequestError('Title and description are required', 'MISSING_FIELDS');
  }

  const event = await EventModel.create({
    title: title.trim(),
    description: description.trim(),
    type: type || 'offer',
    badgeText: badgeText || 'HOT',
    bannerUrl: bannerUrl || null,
    targetGender: targetGender || 'all',
    rewardCoins: Number(rewardCoins) || 0,
    rewardFreeMinutes: Number(rewardFreeMinutes) || 0,
    discountPercent: Number(discountPercent) || 0,
    actionUrl: actionUrl || 'coins',
    startsAt: startsAt ? new Date(startsAt) : new Date(),
    endsAt: endsAt ? new Date(endsAt) : null,
    isActive: Boolean(isActive),
    createdBy: adminId || null,
  });

  const dto = toEventDto(event);

  // Broadcast live event socket
  emitToAll('event:new', dto);

  // Send push notification & email if requested
  if (sendPush || sendEmail) {
    broadcastEvent({ event, sendPush, sendEmail }).catch(() => undefined);
  }

  return dto;
}

export async function listPublicEvents({ userGender }) {
  const now = new Date();
  const query = {
    isActive: true,
    startsAt: { $lte: now },
    $or: [{ endsAt: null }, { endsAt: { $gte: now } }],
  };

  if (userGender) {
    query.targetGender = { $in: ['all', userGender] };
  }

  const events = await EventModel.find(query).sort({ startsAt: -1 }).limit(20);
  return events.map(toEventDto);
}

export async function listAdminEvents({ page = 1, limit = 20, search }) {
  const query = {};
  if (search) {
    query.$or = [
      { title: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } },
    ];
  }

  const skip = (Math.max(1, page) - 1) * limit;
  const [items, total] = await Promise.all([
    EventModel.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
    EventModel.countDocuments(query),
  ]);

  return {
    items: items.map(toEventDto),
    meta: {
      page: Number(page),
      limit: Number(limit),
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
}

export async function updateEvent(id, patch) {
  const updated = await EventModel.findByIdAndUpdate(id, { $set: patch }, { new: true });
  if (!updated) throw new NotFoundError('Event not found', 'EVENT_NOT_FOUND');
  return toEventDto(updated);
}

export async function deleteEvent(id) {
  const deleted = await EventModel.findByIdAndDelete(id);
  if (!deleted) throw new NotFoundError('Event not found', 'EVENT_NOT_FOUND');
  return { deleted: true };
}

export const eventService = {
  createEvent,
  listPublicEvents,
  listAdminEvents,
  updateEvent,
  deleteEvent,
  broadcastEvent,
};
