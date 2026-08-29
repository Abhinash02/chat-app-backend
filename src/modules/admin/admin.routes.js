import { Router } from 'express';

import { authenticate, authRateLimiter, requireAdmin, validate } from '#src/common/middleware/index.js';
import { adminController } from '#src/modules/admin/admin.controller.js';
import {
  adjustCoinsSchema,
  adminLoginSchema,
  adminUserIdParamSchema,
  listAuditSchema,
  listTransactionsSchema,
  listUsersSchema,
  suspendUserSchema,
} from '#src/modules/admin/admin.schema.js';

const router = Router();

/** The only unauthenticated admin route. */
router.post('/login', authRateLimiter, validate({ body: adminLoginSchema }), adminController.login);

router.use(authenticate, requireAdmin);

router.get('/dashboard', adminController.getDashboard);
router.get('/users', validate({ query: listUsersSchema }), adminController.listUsers);
router.get('/users/:userId', validate({ params: adminUserIdParamSchema }), adminController.getUserDetail);
router.post(
  '/users/:userId/suspend',
  validate({ params: adminUserIdParamSchema, body: suspendUserSchema }),
  adminController.suspendUser,
);
router.post(
  '/users/:userId/reactivate',
  validate({ params: adminUserIdParamSchema }),
  adminController.reactivateUser,
);
router.delete('/users/:userId', validate({ params: adminUserIdParamSchema }), adminController.deleteUser);
router.post(
  '/users/:userId/force-logout',
  validate({ params: adminUserIdParamSchema }),
  adminController.forceLogout,
);
router.post(
  '/users/:userId/coins',
  validate({ params: adminUserIdParamSchema, body: adjustCoinsSchema }),
  adminController.adjustCoins,
);
router.post(
  '/users/:userId/free-talk/reset',
  validate({ params: adminUserIdParamSchema }),
  adminController.resetFreeTalk,
);

router.get('/transactions', validate({ query: listTransactionsSchema }), adminController.listTransactions);
router.get('/audit-log', validate({ query: listAuditSchema }), adminController.listAuditLog);

export const adminRoutes = router;
