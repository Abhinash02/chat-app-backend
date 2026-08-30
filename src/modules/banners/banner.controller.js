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
    const result = await bannerService.recordTap(req.params.bannerId);
    return sendSuccess(res, result);
  }),

  // ----- Admin -----------------------------------------------------------

  listAll: asyncHandler(async (_req, res) => {
    const banners = await bannerService.listAllBanners();
    return sendSuccess(res, banners);
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
