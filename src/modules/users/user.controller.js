import { BadRequestError } from '#src/common/errors/index.js';
import { asyncHandler } from '#src/common/utils/async-handler.util.js';
import { sendSuccess } from '#src/common/utils/response.util.js';
import { userService } from '#src/modules/users/user.service.js';

export const userController = {
  getMyProfile: asyncHandler(async (req, res) => {
    const profile = await userService.getMyProfile(req.user.id);
    return sendSuccess(res, profile);
  }),

  updateMyProfile: asyncHandler(async (req, res) => {
    const profile = await userService.updateMyProfile(req.user.id, req.body);
    return sendSuccess(res, profile);
  }),

  uploadAvatar: asyncHandler(async (req, res) => {
    if (!req.file) throw new BadRequestError('Choose an image to upload', 'FILE_REQUIRED');
    const result = await userService.updateAvatar({ userId: req.user.id, file: req.file });
    return sendSuccess(res, result);
  }),

  removeAvatar: asyncHandler(async (req, res) => {
    const result = await userService.removeAvatar(req.user.id);
    return sendSuccess(res, result);
  }),

  updateLocation: asyncHandler(async (req, res) => {
    const result = await userService.updateLocation({ userId: req.user.id, ...req.body });
    return sendSuccess(res, result);
  }),

  discover: asyncHandler(async (req, res) => {
    const { items, meta } = await userService.discoverUsers({ viewer: req.user, ...req.query });
    return sendSuccess(res, items, { meta });
  }),

  getPublicProfile: asyncHandler(async (req, res) => {
    const profile = await userService.getPublicProfile({
      viewerId: req.user.id,
      targetUserId: req.params.userId,
    });
    return sendSuccess(res, profile);
  }),

  blockUser: asyncHandler(async (req, res) => {
    const result = await userService.blockUser({
      userId: req.user.id,
      targetUserId: req.params.userId,
    });
    return sendSuccess(res, result);
  }),

  unblockUser: asyncHandler(async (req, res) => {
    const result = await userService.unblockUser({
      userId: req.user.id,
      targetUserId: req.params.userId,
    });
    return sendSuccess(res, result);
  }),

  listBlockedUsers: asyncHandler(async (req, res) => {
    const blocked = await userService.listBlockedUsers(req.user.id);
    return sendSuccess(res, blocked);
  }),

  getOnlineCounts: asyncHandler(async (_req, res) => {
    const counts = await userService.getActiveUserCounts();
    return sendSuccess(res, counts);
  }),
};
