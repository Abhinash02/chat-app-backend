import { asyncHandler } from '#src/common/utils/async-handler.util.js';
import { accountDeletionService } from '#src/modules/account-deletion/deletion.service.js';

export const deletionController = {
  requestDeletion: asyncHandler(async (req, res) => {
    const result = await accountDeletionService.requestDeletion({
      userId: req.user.id,
      ...req.body,
    });
    res.status(201).json({ success: true, data: result });
  }),

  getMyRequest: asyncHandler(async (req, res) => {
    const result = await accountDeletionService.getMyDeletionRequest({ userId: req.user.id });
    res.json({ success: true, data: result });
  }),

  cancelMyRequest: asyncHandler(async (req, res) => {
    const result = await accountDeletionService.cancelMyDeletionRequest({ userId: req.user.id });
    res.json({ success: true, data: result, message: 'Deletion request cancelled' });
  }),

  listAdminRequests: asyncHandler(async (req, res) => {
    const result = await accountDeletionService.listAdminRequests({
      status: req.query.status,
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 20,
    });
    res.json({ success: true, data: result });
  }),

  approveRequest: asyncHandler(async (req, res) => {
    const result = await accountDeletionService.approveDeletion({
      requestId: req.params.id,
      adminUser: req.user,
      ipAddress: req.ip,
      ...req.body,
    });
    res.json({ success: true, data: result, message: 'Account deleted' });
  }),

  rejectRequest: asyncHandler(async (req, res) => {
    const result = await accountDeletionService.rejectDeletion({
      requestId: req.params.id,
      adminUser: req.user,
      ipAddress: req.ip,
      ...req.body,
    });
    res.json({ success: true, data: result, message: 'Deletion request declined' });
  }),
};
