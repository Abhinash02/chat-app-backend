import { asyncHandler } from '#src/common/utils/async-handler.util.js';
import { sendSuccess } from '#src/common/utils/response.util.js';
import { adminService } from '#src/modules/admin/admin.service.js';

function actorContext(req) {
  return { adminId: req.user.id, ipAddress: req.ip ?? '' };
}

export const adminController = {
  login: asyncHandler(async (req, res) => {
    const result = await adminService.adminLogin({
      ...req.body,
      userAgent: req.headers['user-agent'] ?? '',
      ipAddress: req.ip ?? '',
    });
    return sendSuccess(res, result);
  }),

  getDashboard: asyncHandler(async (_req, res) => {
    const dashboard = await adminService.getDashboard();
    return sendSuccess(res, dashboard);
  }),

  listUsers: asyncHandler(async (req, res) => {
    const { items, meta } = await adminService.listUsers(req.query);
    return sendSuccess(res, items, { meta });
  }),

  getUserDetail: asyncHandler(async (req, res) => {
    const detail = await adminService.getUserDetail(req.params.userId);
    return sendSuccess(res, detail);
  }),

  suspendUser: asyncHandler(async (req, res) => {
    const result = await adminService.suspendUser({
      ...actorContext(req),
      userId: req.params.userId,
      ...req.body,
    });
    return sendSuccess(res, result);
  }),

  reactivateUser: asyncHandler(async (req, res) => {
    const result = await adminService.reactivateUser({
      ...actorContext(req),
      userId: req.params.userId,
    });
    return sendSuccess(res, result);
  }),

  deleteUser: asyncHandler(async (req, res) => {
    const result = await adminService.deleteUser({
      ...actorContext(req),
      userId: req.params.userId,
    });
    return sendSuccess(res, result);
  }),

  forceLogout: asyncHandler(async (req, res) => {
    const result = await adminService.forceLogout({
      ...actorContext(req),
      userId: req.params.userId,
    });
    return sendSuccess(res, result);
  }),

  adjustCoins: asyncHandler(async (req, res) => {
    const snapshot = await adminService.adjustUserCoins({
      ...actorContext(req),
      userId: req.params.userId,
      ...req.body,
    });
    return sendSuccess(res, snapshot);
  }),

  resetFreeTalk: asyncHandler(async (req, res) => {
    const snapshot = await adminService.resetUserFreeTalk({
      ...actorContext(req),
      userId: req.params.userId,
    });
    return sendSuccess(res, snapshot);
  }),

  listTransactions: asyncHandler(async (req, res) => {
    const { items, meta } = await adminService.listCoinTransactions(req.query);
    return sendSuccess(res, items, { meta });
  }),

  listAuditLog: asyncHandler(async (req, res) => {
    const { items, meta } = await adminService.listAuditLog(req.query);
    return sendSuccess(res, items, { meta });
  }),
};
