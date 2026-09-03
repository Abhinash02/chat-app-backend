import { Router } from 'express';

import { authenticate, requireAdmin, uploadMedia, validate } from '#src/common/middleware/index.js';
import { bannerController } from '#src/modules/banners/banner.controller.js';
import {
  bannerIdParamSchema,
  createBannerSchema,
  impressionSchema,
  updateBannerSchema,
} from '#src/modules/banners/banner.schema.js';

const router = Router();

router.use(authenticate);

/** What the app shows. Deliberately available to unverified accounts too. */
router.get('/', bannerController.listLive);
router.post('/impressions', validate({ body: impressionSchema }), bannerController.recordImpressions);
router.post('/:bannerId/tap', validate({ params: bannerIdParamSchema }), bannerController.recordTap);

// ----- Admin --------------------------------------------------------------

router.use(requireAdmin);

router.get('/admin/all', bannerController.listAll);

/**
 * The media (image or video) and fields arrive together as multipart.
 */
router.post(
  '/admin',
  uploadMedia.single('image'),
  validate({ body: createBannerSchema }),
  bannerController.create,
);
router.patch(
  '/admin/:bannerId',
  uploadMedia.single('image'),
  validate({ params: bannerIdParamSchema, body: updateBannerSchema }),
  bannerController.update,
);
router.get(
  '/admin/:bannerId/clicks',
  validate({ params: bannerIdParamSchema }),
  bannerController.getClicks,
);

router.post(
  '/admin/:bannerId/push',
  validate({ params: bannerIdParamSchema }),
  bannerController.sendPush,
);

router.delete(
  '/admin/:bannerId',
  validate({ params: bannerIdParamSchema }),
  bannerController.remove,
);

export const bannerRoutes = router;
