import { Router } from 'express';
import { authenticate, requireAdmin } from '#src/common/middleware/index.js';
import { feedbackController } from './feedback.controller.js';

const router = Router();

router.use(authenticate);

// User feedback endpoints
router.post('/', feedbackController.submitFeedback);
router.get('/my', feedbackController.listMyFeedback);

/*
 * Admin feedback endpoints.
 *
 * `requireAdmin` was missing here, so `authenticate` alone was the only gate:
 * any signed-up account could list everybody's feedback and change its status.
 * Every other module already does this — see admin, support and system-logs.
 */
router.get('/', requireAdmin, feedbackController.listFeedback);
router.patch('/:feedbackId/status', requireAdmin, feedbackController.updateStatus);

export const feedbackRoutes = router;
