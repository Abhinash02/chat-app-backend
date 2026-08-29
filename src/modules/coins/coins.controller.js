import { asyncHandler } from '#src/common/utils/async-handler.util.js';
import { sendCreated, sendSuccess } from '#src/common/utils/response.util.js';
import { coinsService } from '#src/modules/coins/coins.service.js';

export const coinsController = {
  getWallet: asyncHandler(async (req, res) => {
    const snapshot = await coinsService.getWalletSnapshot({
      userId: req.user.id,
      gender: req.user.gender,
    });
    return sendSuccess(res, snapshot);
  }),

  listTransactions: asyncHandler(async (req, res) => {
    const { items, meta } = await coinsService.listTransactions({
      userId: req.user.id,
      ...req.query,
    });
    return sendSuccess(res, items, { meta });
  }),

  listPackages: asyncHandler(async (_req, res) => {
    const packages = await coinsService.listPackages();
    return sendSuccess(res, packages);
  }),

  getDailyBonusStatus: asyncHandler(async (req, res) => {
    const status = await coinsService.getDailyBonusState({
      userId: req.user.id,
      gender: req.user.gender,
    });
    return sendSuccess(res, status);
  }),

  claimDailyBonus: asyncHandler(async (req, res) => {
    const result = await coinsService.claimDailyBonus({
      userId: req.user.id,
      gender: req.user.gender,
    });
    return sendSuccess(res, result);
  }),

  // ----- Admin -----------------------------------------------------------

  listAllPackages: asyncHandler(async (_req, res) => {
    const packages = await coinsService.listPackages({ includeInactive: true });
    return sendSuccess(res, packages);
  }),

  createPackage: asyncHandler(async (req, res) => {
    const created = await coinsService.createPackage(req.body);
    return sendCreated(res, created);
  }),

  updatePackage: asyncHandler(async (req, res) => {
    const updated = await coinsService.updatePackage(req.params.id, req.body);
    return sendSuccess(res, updated);
  }),

  deletePackage: asyncHandler(async (req, res) => {
    const result = await coinsService.deletePackage(req.params.id);
    return sendSuccess(res, result);
  }),
};
