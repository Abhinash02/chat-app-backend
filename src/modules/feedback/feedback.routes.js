import { Router } from 'express';
import { authenticate } from '#src/common/middleware/index.js';
import { feedbackController } from './feedback.controller.js';

const router = Router();

router.use(authenticate);

// User feedback endpoints
router.post('/', feedbackController.submitFeedback);
router.get('/my', feedbackController.listMyFeedback);

// Admin feedback endpoints
router.get('/', feedbackController.listFeedback);
router.patch('/:feedbackId/status', feedbackController.updateStatus);

export const feedbackRoutes = router;
