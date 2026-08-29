import { Router } from 'express';

import { authenticate, requireVerifiedAccount, uploadImage, validate } from '#src/common/middleware/index.js';
import { userController } from '#src/modules/users/user.controller.js';
import {
  discoverQuerySchema,
  updateLocationSchema,
  updateProfileSchema,
  userIdParamSchema,
} from '#src/modules/users/user.schema.js';

const router = Router();

router.use(authenticate);

router.get('/me', userController.getMyProfile);
router.patch('/me', validate({ body: updateProfileSchema }), userController.updateMyProfile);
router.post('/me/avatar', uploadImage.single('avatar'), userController.uploadAvatar);
router.delete('/me/avatar', userController.removeAvatar);
router.put('/me/location', validate({ body: updateLocationSchema }), userController.updateLocation);

router.use(requireVerifiedAccount);

router.get('/discover', validate({ query: discoverQuerySchema }), userController.discover);
router.get('/online-count', userController.getOnlineCounts);
router.get('/blocked', userController.listBlockedUsers);
router.get('/:userId', validate({ params: userIdParamSchema }), userController.getPublicProfile);
router.post('/:userId/block', validate({ params: userIdParamSchema }), userController.blockUser);
router.delete('/:userId/block', validate({ params: userIdParamSchema }), userController.unblockUser);

export const userRoutes = router;
