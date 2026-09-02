import { Router } from 'express';
import { authenticate, requireAdmin } from '#src/common/middleware/index.js';
import { systemLogController } from './system-log.controller.js';

const router = Router();

router.use(authenticate, requireAdmin);

router.get('/', systemLogController.listLogs);
router.get('/stats', systemLogController.getStats);
router.delete('/', systemLogController.clearLogs);

export { router as systemLogRoutes };
