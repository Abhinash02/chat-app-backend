import { asyncHandler } from '#src/common/utils/async-handler.util.js';
import { sendCreated, sendSuccess } from '#src/common/utils/response.util.js';
import { themeService } from '#src/modules/theme/theme.service.js';

export const themeController = {
  getActiveTheme: asyncHandler(async (_req, res) => {
    const theme = await themeService.getActiveTheme();
    return sendSuccess(res, theme);
  }),

  listThemes: asyncHandler(async (_req, res) => {
    const themes = await themeService.listThemes();
    return sendSuccess(res, themes);
  }),

  createTheme: asyncHandler(async (req, res) => {
    const theme = await themeService.createTheme(req.body, req.user.id);
    return sendCreated(res, theme);
  }),

  updateTheme: asyncHandler(async (req, res) => {
    const theme = await themeService.updateTheme(req.params.id, req.body, req.user.id);
    return sendSuccess(res, theme);
  }),

  activateTheme: asyncHandler(async (req, res) => {
    const theme = await themeService.activateTheme(req.params.id, req.user.id);
    return sendSuccess(res, theme);
  }),

  scheduleTheme: asyncHandler(async (req, res) => {
    const theme = await themeService.scheduleTheme({ themeId: req.params.id, ...req.body });
    return sendSuccess(res, theme);
  }),

  deleteTheme: asyncHandler(async (req, res) => {
    const result = await themeService.deleteTheme(req.params.id);
    return sendSuccess(res, result);
  }),
};
