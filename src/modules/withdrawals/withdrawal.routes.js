import { Router } from 'express';

import { authenticate, requireAdmin, validate } from '#src/common/middleware/index.js';
import {
  approveWithdrawalSchema,
  rejectWithdrawalSchema,
  requestWithdrawalSchema,
} from '#src/modules/withdrawals/withdrawal.schema.js';
import { withdrawalController } from '#src/modules/withdrawals/withdrawal.controller.js';

const router = Router();

router.use(authenticate);

// User endpoints (For girls)
router.get('/my', withdrawalController.getMyWithdrawals);
router.get('/earnings-status', withdrawalController.getEarningsStatus);
router.post('/request', validate({ body: requestWithdrawalSchema }), withdrawalController.requestWithdrawal);

// Admin endpoints
router.get(
  '/admin',
  requireAdmin,
  withdrawalController.listAdminWithdrawals,
);

router.post(
  '/admin/:id/approve',
  requireAdmin,
  validate({ body: approveWithdrawalSchema }),
  withdrawalController.approveWithdrawal,
);

router.post(
  '/admin/:id/reject',
  requireAdmin,
  validate({ body: rejectWithdrawalSchema }),
  withdrawalController.rejectWithdrawal,
);

export const withdrawalRoutes = router;
