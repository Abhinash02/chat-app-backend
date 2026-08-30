import { asyncHandler } from '#src/common/utils/async-handler.util.js';
import { sendCreated, sendSuccess } from '#src/common/utils/response.util.js';
import { statusService } from '#src/modules/status/status.service.js';

export const statusController = {
  listFeed: asyncHandler(async (req, res) => {
    const feed = await statusService.listFeed({ user: req.user });
    return sendSuccess(res, feed);
  }),

  postText: asyncHandler(async (req, res) => {
    const status = await statusService.postTextStatus({ user: req.user, ...req.body });
    return sendCreated(res, status);
  }),

  postMedia: asyncHandler(async (req, res) => {
    const status = await statusService.postMediaStatus({
      user: req.user,
      file: req.file,
      caption: req.body?.caption ?? '',
      background: req.body?.background,
    });
    return sendCreated(res, status);
  }),

  listByUser: asyncHandler(async (req, res) => {
    const items = await statusService.listByUser({ user: req.user, authorId: req.params.userId });
    return sendSuccess(res, items);
  }),

  markViewed: asyncHandler(async (req, res) => {
    const result = await statusService.markViewed({ user: req.user, statusId: req.params.statusId });
    return sendSuccess(res, result);
  }),

  listViewers: asyncHandler(async (req, res) => {
    const result = await statusService.listViewers({ user: req.user, statusId: req.params.statusId });
    return sendSuccess(res, result);
  }),

  remove: asyncHandler(async (req, res) => {
    const result = await statusService.deleteStatus({ user: req.user, statusId: req.params.statusId });
    return sendSuccess(res, result);
  }),
};
