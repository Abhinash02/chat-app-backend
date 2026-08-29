import { asyncHandler } from '#src/common/utils/async-handler.util.js';
import { sendCreated, sendSuccess } from '#src/common/utils/response.util.js';
import { authService } from '#src/modules/auth/auth.service.js';

/** Device metadata is read from the request here, never trusted from the body. */
function requestContextOf(req) {
  return { userAgent: req.headers['user-agent'] ?? '', ipAddress: req.ip ?? '' };
}

export const authController = {
  register: asyncHandler(async (req, res) => {
    const result = await authService.register({ ...req.body, ...requestContextOf(req) });
    return sendCreated(res, result);
  }),

  verifyEmail: asyncHandler(async (req, res) => {
    const result = await authService.verifyEmail({ ...req.body, ...requestContextOf(req) });
    return sendSuccess(res, result);
  }),

  resendVerificationCode: asyncHandler(async (req, res) => {
    const result = await authService.resendVerificationCode(req.body);
    return sendSuccess(res, result);
  }),

  login: asyncHandler(async (req, res) => {
    const result = await authService.login({ ...req.body, ...requestContextOf(req) });
    return sendSuccess(res, result);
  }),

  refresh: asyncHandler(async (req, res) => {
    const result = await authService.refreshSession({ ...req.body, ...requestContextOf(req) });
    return sendSuccess(res, result);
  }),

  logout: asyncHandler(async (req, res) => {
    const result = await authService.logout(req.body);
    return sendSuccess(res, result);
  }),

  logoutAllDevices: asyncHandler(async (req, res) => {
    const result = await authService.logoutAllDevices({ userId: req.user.id });
    return sendSuccess(res, result);
  }),

  listSessions: asyncHandler(async (req, res) => {
    const sessions = await authService.listSessions({ userId: req.user.id });
    return sendSuccess(res, sessions);
  }),

  forgotPassword: asyncHandler(async (req, res) => {
    const result = await authService.requestPasswordReset(req.body);
    return sendSuccess(res, result);
  }),

  resetPassword: asyncHandler(async (req, res) => {
    const result = await authService.resetPassword(req.body);
    return sendSuccess(res, result);
  }),

  changePassword: asyncHandler(async (req, res) => {
    const result = await authService.changePassword({ userId: req.user.id, ...req.body });
    return sendSuccess(res, result);
  }),

  me: asyncHandler(async (req, res) => {
    const user = await authService.getCurrentUser({ userId: req.user.id });
    return sendSuccess(res, user);
  }),
};
