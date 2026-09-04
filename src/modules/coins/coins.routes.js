import { Router } from 'express';

import {
  authenticate,
  requireAdmin,
  requireVerifiedAccount,
  validate,
} from '#src/common/middleware/index.js';
import { idParamSchema } from '#src/common/validators/common.schema.js';
import { coinsController } from '#src/modules/coins/coins.controller.js';
import {
  createPackageSchema,
  listTransactionsSchema,
  updatePackageSchema,
} from '#src/modules/coins/coins.schema.js';

const router = Router();

router.use(authenticate);

router.get('/wallet', requireVerifiedAccount, coinsController.getWallet);
router.get(
  '/transactions',
  requireVerifiedAccount,
  validate({ query: listTransactionsSchema }),
  coinsController.listTransactions,
);
router.get('/packages', coinsController.listPackages);
router.post('/consume-free-talk', requireVerifiedAccount, coinsController.consumeFreeTalk);
router.get('/daily-bonus', requireVerifiedAccount, coinsController.getDailyBonusStatus);
router.post('/daily-bonus/claim', requireVerifiedAccount, coinsController.claimDailyBonus);

// ----- Admin package management -----------------------------------------

router.get('/admin/packages', requireAdmin, coinsController.listAllPackages);
router.post(
  '/admin/packages',
  requireAdmin,
  validate({ body: createPackageSchema }),
  coinsController.createPackage,
);
router.patch(
  '/admin/packages/:id',
  requireAdmin,
  validate({ params: idParamSchema, body: updatePackageSchema }),
  coinsController.updatePackage,
);
router.delete(
  '/admin/packages/:id',
  requireAdmin,
  validate({ params: idParamSchema }),
  coinsController.deletePackage,
);

export const coinsRoutes = router;
