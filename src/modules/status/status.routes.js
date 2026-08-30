import { Router } from 'express';

import { authenticate, requireVerifiedAccount, uploadMedia, validate } from '#src/common/middleware/index.js';
import { statusController } from '#src/modules/status/status.controller.js';
import {
  postMediaStatusSchema,
  postTextStatusSchema,
  statusAuthorParamSchema,
  statusIdParamSchema,
} from '#src/modules/status/status.schema.js';

const router = Router();

router.use(authenticate, requireVerifiedAccount);

router.get('/', statusController.listFeed);
router.post('/text', validate({ body: postTextStatusSchema }), statusController.postText);

/** Multipart: multer has to parse the form before `req.body` exists to validate. */
router.post(
  '/media',
  uploadMedia.single('file'),
  validate({ body: postMediaStatusSchema }),
  statusController.postMedia,
);

router.get('/user/:userId', validate({ params: statusAuthorParamSchema }), statusController.listByUser);
router.post('/:statusId/view', validate({ params: statusIdParamSchema }), statusController.markViewed);
router.get('/:statusId/viewers', validate({ params: statusIdParamSchema }), statusController.listViewers);
router.delete('/:statusId', validate({ params: statusIdParamSchema }), statusController.remove);

export const statusRoutes = router;
