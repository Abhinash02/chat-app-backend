import { BadRequestError, NotFoundError } from '#src/common/errors/index.js';
import { logger } from '#src/config/logger.js';
import { getPushProvider, PUSH_CHANNEL } from '#src/integrations/push/index.js';
import { getStorageProvider } from '#src/integrations/storage/index.js';
import { bannerRepository } from '#src/modules/banners/banner.repository.js';
import { notificationRepository } from '#src/modules/notifications/notification.repository.js';
import { UserModel } from '#src/modules/users/user.model.js';
import {
  BANNER_ACTION,
  BANNER_PLACEMENT,
  BANNER_SCREENS,
} from '#src/modules/banners/banner.constants.js';

function toPublicBanner(banner) {
  return {
    id: String(banner._id),
    title: banner.title,
    imageUrl: banner.imageUrl,
    mediaType: banner.mediaType || (banner.imageUrl?.match(/\.(mp4|webm|mov|3gp)$/i) ? 'video' : 'image'),
    animation: banner.animation,
    action: banner.action,
    actionTarget: banner.actionTarget,
  };
}

function toAdminBanner(banner) {
  return {
    id: String(banner._id),
    title: banner.title,
    note: banner.note,
    imageUrl: banner.imageUrl,
    mediaType: banner.mediaType || (banner.imageUrl?.match(/\.(mp4|webm|mov|3gp)$/i) ? 'video' : 'image'),
    placement: banner.placement,
    animation: banner.animation,
    action: banner.action,
    actionTarget: banner.actionTarget,
    isActive: banner.isActive,
    sortOrder: banner.sortOrder,
    startsAt: banner.startsAt,
    endsAt: banner.endsAt,
    impressions: banner.impressions,
    taps: banner.taps,
    /** Ratio is what tells an admin whether a banner is working. */
    tapRate: banner.impressions > 0 ? Number(((banner.taps / banner.impressions) * 100).toFixed(1)) : 0,
    isLive: isLiveNow(banner),
    createdAt: banner.createdAt,
  };
}

function isLiveNow(banner, now = new Date()) {
  if (!banner.isActive) return false;
  if (banner.startsAt && new Date(banner.startsAt) > now) return false;
  if (banner.endsAt && new Date(banner.endsAt) < now) return false;
  return true;
}

function assertValidAction({ action, actionTarget }) {
  if (action === BANNER_ACTION.SCREEN && !BANNER_SCREENS.includes(actionTarget)) {
    throw new BadRequestError(
      `A screen banner must point at one of: ${BANNER_SCREENS.join(', ')}`,
      'INVALID_BANNER_SCREEN',
    );
  }

  if (action === BANNER_ACTION.URL) {
    // Only http(s). A `javascript:` or app-scheme target handed to the phone's
    // browser is a way to make the app open something it should not.
    if (!/^https?:\/\/\S+$/i.test(actionTarget ?? '')) {
      throw new BadRequestError('A link banner needs a valid http or https URL', 'INVALID_BANNER_URL');
    }
  }
}

export async function listLiveBanners(placement = BANNER_PLACEMENT.HOME_TOP) {
  const banners = await bannerRepository.findLive({ placement });
  return banners.map(toPublicBanner);
}

export async function listAllBanners() {
  const banners = await bannerRepository.listAll();
  return banners.map(toAdminBanner);
}

export async function createBanner({ admin, file, ...data }) {
  if (!file) throw new BadRequestError('Choose a banner image or video', 'MEDIA_REQUIRED');
  assertValidAction(data);

  const isVideo = file.mimetype.startsWith('video/');
  const mediaType = isVideo ? 'video' : 'image';

  const storage = getStorageProvider();
  const uploaded = await storage.upload({
    buffer: file.buffer,
    mimeType: file.mimetype,
    folder: 'banners',
    fileName: isVideo ? 'banner-video' : 'banner',
  });

  const banner = await bannerRepository.create({
    ...data,
    imageUrl: uploaded.url,
    mediaType,
    imageStorageKey: uploaded.key,
    createdByAdminId: admin.id,
  });

  logger.info({ bannerId: String(banner._id), adminId: admin.id, mediaType }, 'Banner created');
  return toAdminBanner(banner);
}

export async function updateBanner({ bannerId, file, ...patch }) {
  const existing = await bannerRepository.findById(bannerId, { includeStorageKey: true });
  if (!existing) throw new NotFoundError('Banner not found', 'BANNER_NOT_FOUND');

  assertValidAction({
    action: patch.action ?? existing.action,
    actionTarget: patch.actionTarget ?? existing.actionTarget,
  });

  const update = { ...patch };

  if (file) {
    const isVideo = file.mimetype.startsWith('video/');
    update.mediaType = isVideo ? 'video' : 'image';

    const storage = getStorageProvider();
    const uploaded = await storage.upload({
      buffer: file.buffer,
      mimeType: file.mimetype,
      folder: 'banners',
      fileName: isVideo ? 'banner-video' : 'banner',
    });

    update.imageUrl = uploaded.url;
    update.imageStorageKey = uploaded.key;

    // Only remove the old file once the new one is safely stored.
    if (existing.imageStorageKey) {
      storage
        .remove(existing.imageStorageKey)
        .catch((error) => logger.warn({ err: error }, 'Failed to remove replaced banner image'));
    }
  }

  const updated = await bannerRepository.updateById(bannerId, { $set: update });
  return toAdminBanner(updated);
}

export async function deleteBanner(bannerId) {
  const deleted = await bannerRepository.deleteById(bannerId);
  if (!deleted) throw new NotFoundError('Banner not found', 'BANNER_NOT_FOUND');

  if (deleted.imageStorageKey) {
    getStorageProvider()
      .remove(deleted.imageStorageKey)
      .catch((error) => logger.warn({ err: error }, 'Failed to remove banner image'));
  }

  return { deleted: true };
}

/**
 * Counters the app reports back. Deliberately unauthenticated-friendly and
 * best effort — a lost impression is not worth an error, and a caller that
 * inflates the number only misleads its own admin.
 */
export async function recordImpressions(bannerIds) {
  await bannerRepository.incrementImpressions(bannerIds).catch(() => undefined);
  return { recorded: true };
}

export async function recordTap({ bannerId, userId, action, actionTarget, ip, userAgent }) {
  await bannerRepository
    .recordTap({
      bannerId,
      userId,
      action,
      actionTarget,
      ip,
      userAgent,
    })
    .catch(() => undefined);
  return { recorded: true };
}

export async function getBannerClicks(bannerId) {
  const banner = await bannerRepository.findById(bannerId);
  if (!banner) throw new NotFoundError('Banner not found', 'BANNER_NOT_FOUND');
  const insights = await bannerRepository.getBannerClicks(bannerId);
  return {
    banner: {
      id: String(banner._id),
      title: banner.title,
      note: banner.note,
      imageUrl: banner.imageUrl,
      placement: banner.placement,
      action: banner.action,
      actionTarget: banner.actionTarget,
      impressions: banner.impressions,
      taps: banner.taps,
      isLive: isLiveNow(banner),
    },
    ...insights,
  };
}

export async function sendBannerPushNotification({
  admin,
  bannerId,
  title,
  body,
  targetAudience = 'all',
}) {
  const banner = await bannerRepository.findById(bannerId);
  if (!banner) throw new NotFoundError('Banner not found', 'BANNER_NOT_FOUND');

  let targetUserIds = [];

  if (targetAudience === 'clickers') {
    targetUserIds = await bannerRepository.getClickerUserIds(bannerId);
  } else {
    const users = await UserModel.find({ status: 'active' }).select('_id').lean();
    targetUserIds = users.map((u) => u._id);
  }

  if (targetUserIds.length === 0) {
    return {
      sent: 0,
      targetedUsers: 0,
      activeDevices: 0,
      message: 'No users found for the selected audience.',
    };
  }

  const devices = await notificationRepository.findActiveTokensForUsers(targetUserIds);

  const notifTitle = title?.trim() || `📢 ${banner.title}`;
  const notifBody =
    body?.trim() || (banner.note || `Special offer! Tap to check out ${banner.title}.`);

  const pushData = {
    type: 'banner_promo',
    bannerId: String(banner._id),
    action: banner.action,
    actionTarget: banner.actionTarget,
  };

  let sentCount = 0;
  let failedCount = 0;
  if (devices.length > 0) {
    const provider = getPushProvider();
    const tickets = await provider.send(
      devices.map((device) => ({
        token: device.token,
        title: notifTitle,
        body: notifBody,
        data: pushData,
        sound: 'default',
        channelId: PUSH_CHANNEL.MARKETING || 'marketing',
      })),
    );
    sentCount = tickets.filter((t) => t.ok).length;
    failedCount = tickets.filter((t) => !t.ok).length;
  }

  const unregisteredDevices = Math.max(0, targetUserIds.length - devices.length);
  const totalFailedOrUnreached = failedCount + unregisteredDevices;

  logger.info(
    {
      bannerId,
      adminId: admin.id,
      targetAudience,
      targetedUsers: targetUserIds.length,
      activeDevices: devices.length,
      sentCount,
      failedCount,
      unregisteredDevices,
    },
    'Ad push notification broadcast completed',
  );

  return {
    sent: sentCount,
    failed: failedCount,
    unregisteredDevices,
    totalFailedOrUnreached,
    targetedUsers: targetUserIds.length,
    activeDevices: devices.length,
    title: notifTitle,
    body: notifBody,
  };
}

export const bannerService = {
  listLiveBanners,
  listAllBanners,
  createBanner,
  updateBanner,
  deleteBanner,
  recordImpressions,
  recordTap,
  getBannerClicks,
  sendBannerPushNotification,
};
