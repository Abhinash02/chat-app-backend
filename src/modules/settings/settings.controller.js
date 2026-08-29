import { asyncHandler } from '#src/common/utils/async-handler.util.js';
import { sendSuccess } from '#src/common/utils/response.util.js';
import { settingsService } from '#src/modules/settings/settings.service.js';

export const settingsController = {
  getPublicSettings: asyncHandler(async (_req, res) => {
    const settings = await settingsService.getPublicSettings();
    return sendSuccess(res, settings);
  }),

  getAllSettings: asyncHandler(async (_req, res) => {
    const settings = await settingsService.getSettings({ forceRefresh: true });
    return sendSuccess(res, settings);
  }),

  updateSettings: asyncHandler(async (req, res) => {
    const settings = await settingsService.updateSettings(req.body, req.user.id);
    return sendSuccess(res, settings);
  }),
};
