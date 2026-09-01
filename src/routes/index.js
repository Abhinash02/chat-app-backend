import { Router } from 'express';

import { isDatabaseHealthy } from '#src/config/database.js';
import { sendSuccess } from '#src/common/utils/response.util.js';
import { adminRoutes } from '#src/modules/admin/index.js';
import { authRoutes } from '#src/modules/auth/index.js';
import { bannerRoutes } from '#src/modules/banners/index.js';
import { chatRoutes } from '#src/modules/chat/index.js';
import { coinsRoutes } from '#src/modules/coins/index.js';
import { eventRoutes } from '#src/modules/events/index.js';
import { feedbackRoutes } from '#src/modules/feedback/index.js';
import { gameRoutes } from '#src/modules/games/index.js';
import { notificationRoutes } from '#src/modules/notifications/index.js';
import { paymentRoutes } from '#src/modules/payments/index.js';
import { reportRoutes } from '#src/modules/reports/index.js';
import { roomRoutes } from '#src/modules/rooms/index.js';
import { settingsRoutes } from '#src/modules/settings/index.js';
import { statusRoutes } from '#src/modules/status/index.js';
import { themeRoutes } from '#src/modules/theme/index.js';
import { userRoutes } from '#src/modules/users/index.js';
import { supportRoutes } from '#src/modules/support/index.js';

const router = Router();

/**
 * Liveness: the process is up. Deliberately says nothing about dependencies, so
 * an orchestrator does not restart a healthy process during a database blip.
 */
router.get('/health', (_req, res) =>
  sendSuccess(res, { status: 'ok', uptimeSeconds: Math.floor(process.uptime()) }),
);

/** Readiness: safe to send traffic. Reports no version or connection details. */
router.get('/ready', (_req, res) => {
  const databaseReady = isDatabaseHealthy();
  return res
    .status(databaseReady ? 200 : 503)
    .json({ success: databaseReady, data: { database: databaseReady ? 'up' : 'down' } });
});

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/banners', bannerRoutes);
router.use('/events', eventRoutes);
router.use('/chat', chatRoutes);
router.use('/coins', coinsRoutes);
router.use('/payments', paymentRoutes);
router.use('/rooms', roomRoutes);
router.use('/status', statusRoutes);
router.use('/games', gameRoutes);
router.use('/notifications', notificationRoutes);
router.use('/reports', reportRoutes);
router.use('/feedback', feedbackRoutes);
router.use('/theme', themeRoutes);
router.use('/settings', settingsRoutes);
router.use('/support', supportRoutes);
router.use('/admin', adminRoutes);

export const apiRoutes = router;
