import { BadRequestError, NotFoundError } from '#src/common/errors/index.js';
import { logger } from '#src/config/logger.js';
import { getStorageProvider } from '#src/integrations/storage/index.js';
import { bannerRepository } from '#src/modules/banners/banner.repository.js';
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
  if (!file) throw new BadRequestError('Choose a banner image', 'IMAGE_REQUIRED');
  assertValidAction(data);

  const storage = getStorageProvider();
  const uploaded = await storage.upload({
    buffer: file.buffer,
    mimeType: file.mimetype,
    folder: 'banners',
    fileName: 'banner',
  });

  const banner = await bannerRepository.create({
    ...data,
    imageUrl: uploaded.url,
    imageStorageKey: uploaded.key,
    createdByAdminId: admin.id,
  });

  logger.info({ bannerId: String(banner._id), adminId: admin.id }, 'Banner created');
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
    const storage = getStorageProvider();
    const uploaded = await storage.upload({
      buffer: file.buffer,
      mimeType: file.mimetype,
      folder: 'banners',
      fileName: 'banner',
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

export async function recordTap(bannerId) {
  await bannerRepository.incrementTaps(bannerId).catch(() => undefined);
  return { recorded: true };
}

export const bannerService = {
  listLiveBanners,
  listAllBanners,
  createBanner,
  updateBanner,
  deleteBanner,
  recordImpressions,
  recordTap,
};
