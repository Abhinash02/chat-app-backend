import { asyncHandler } from '#src/common/utils/async-handler.util.js';
import { sendCreated, sendSuccess } from '#src/common/utils/response.util.js';
import { feedbackService } from './feedback.service.js';

export const feedbackController = {
  submitFeedback: asyncHandler(async (req, res) => {
    const result = await feedbackService.submitFeedback({
      userId: req.user?.id ?? null,
      category: req.body.category,
      rating: req.body.rating,
      message: req.body.message,
      deviceInfo: req.body.deviceInfo,
    });
    return sendCreated(res, result);
  }),

  listMyFeedback: asyncHandler(async (req, res) => {
    const items = await feedbackService.listMyFeedback(req.user.id);
    return sendSuccess(res, items);
  }),

  listFeedback: asyncHandler(async (req, res) => {
    const result = await feedbackService.listFeedback(req.query);
    return sendSuccess(res, result.items, {
      meta: { total: result.total, page: result.page, limit: result.limit },
    });
  }),

  updateStatus: asyncHandler(async (req, res) => {
    const result = await feedbackService.updateFeedbackStatus({
      feedbackId: req.params.feedbackId,
      adminId: req.user?.id ?? null,
      status: req.body.status,
      adminNote: req.body.adminNote,
    });
    return sendSuccess(res, result);
  }),
};
