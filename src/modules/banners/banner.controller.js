import { asyncHandler } from '#src/common/utils/async-handler.util.js';
import { sendCreated, sendSuccess } from '#src/common/utils/response.util.js';
import { bannerService } from '#src/modules/banners/banner.service.js';

export const bannerController = {
  listLive: asyncHandler(async (req, res) => {
    const banners = await bannerService.listLiveBanners(req.query.placement);
    return sendSuccess(res, banners);
  }),

  recordImpressions: asyncHandler(async (req, res) => {
    const result = await bannerService.recordImpressions(req.body.bannerIds);
    return sendSuccess(res, result);
  }),

  recordTap: asyncHandler(async (req, res) => {
    const result = await bannerService.recordTap({
      bannerId: req.params.bannerId,
      userId: req.user?.id,
      action: req.body?.action,
      actionTarget: req.body?.actionTarget,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
    return sendSuccess(res, result);
  }),

  // ----- Admin -----------------------------------------------------------

  listAll: asyncHandler(async (_req, res) => {
    const banners = await bannerService.listAllBanners();
    return sendSuccess(res, banners);
  }),

  getClicks: asyncHandler(async (req, res) => {
    const insights = await bannerService.getBannerClicks(req.params.bannerId);
    return sendSuccess(res, insights);
  }),

  sendPush: asyncHandler(async (req, res) => {
    const result = await bannerService.sendBannerPushNotification({
      admin: req.user,
      bannerId: req.params.bannerId,
      title: req.body?.title,
      body: req.body?.body,
      targetAudience: req.body?.targetAudience || 'all',
    });
    return sendSuccess(res, result);
  }),

  create: asyncHandler(async (req, res) => {
    const banner = await bannerService.createBanner({
      admin: req.user,
      file: req.file,
      ...req.body,
    });
    return sendCreated(res, banner);
  }),

  update: asyncHandler(async (req, res) => {
    const banner = await bannerService.updateBanner({
      bannerId: req.params.bannerId,
      file: req.file,
      ...req.body,
    });
    return sendSuccess(res, banner);
  }),

  remove: asyncHandler(async (req, res) => {
    const result = await bannerService.deleteBanner(req.params.bannerId);
    return sendSuccess(res, result);
  }),
};
