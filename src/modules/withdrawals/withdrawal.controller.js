import { asyncHandler } from '#src/common/utils/async-handler.util.js';
import { withdrawalService } from '#src/modules/withdrawals/withdrawal.service.js';

export const withdrawalController = {
  requestWithdrawal: asyncHandler(async (req, res) => {
    const result = await withdrawalService.requestWithdrawal({
      user: req.user,
      ...req.body,
    });
    res.status(201).json({ success: true, data: result });
  }),

  getMyWithdrawals: asyncHandler(async (req, res) => {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const result = await withdrawalService.getMyWithdrawals({
      userId: req.user.id,
      page,
      limit,
    });
    res.json({ success: true, data: result });
  }),

  getEarningsStatus: asyncHandler(async (req, res) => {
    const result = await withdrawalService.getEarningsStatus({ user: req.user });
    res.json({ success: true, data: result });
  }),

  listAdminWithdrawals: asyncHandler(async (req, res) => {
    const { status, search } = req.query;
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;

    const result = await withdrawalService.listAdminWithdrawals({
      status,
      search,
      page,
      limit,
    });
    res.json({ success: true, data: result });
  }),

  approveWithdrawal: asyncHandler(async (req, res) => {
    const result = await withdrawalService.approveWithdrawal({
      withdrawalId: req.params.id,
      adminUser: req.user,
      ...req.body,
    });
    res.json({ success: true, data: result, message: 'Withdrawal approved successfully' });
  }),

  rejectWithdrawal: asyncHandler(async (req, res) => {
    const result = await withdrawalService.rejectWithdrawal({
      withdrawalId: req.params.id,
      adminUser: req.user,
      ...req.body,
    });
    res.json({ success: true, data: result, message: 'Withdrawal rejected and coins refunded' });
  }),
};
