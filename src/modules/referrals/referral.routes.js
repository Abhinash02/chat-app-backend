import { Router } from 'express';

import { authenticate, requireAdmin } from '#src/common/middleware/index.js';
import * as referralController from '#src/modules/referrals/referral.controller.js';

const router = Router();

// All referral routes require authentication
router.use(authenticate);

/** User's own referral code + shareable link */
router.get('/my-code', referralController.getMyCode);

/** User's referral stats (total invited, total coins earned) */
router.get('/stats', referralController.getMyStats);

/** User's referral history (paginated) */
router.get('/history', referralController.getMyHistory);

// ── Admin ──────────────────────────────────────────────────────────────────

/** All platform referrals */
router.get('/admin/list', requireAdmin, referralController.adminListAll);

/** Platform-wide totals */
router.get('/admin/stats', requireAdmin, referralController.adminGlobalStats);

export const referralRoutes = router;
