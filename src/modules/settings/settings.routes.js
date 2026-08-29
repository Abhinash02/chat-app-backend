import { Router } from 'express';

import { authenticate, requireAdmin, validate } from '#src/common/middleware/index.js';
import { settingsController } from '#src/modules/settings/settings.controller.js';
import { updateSettingsSchema } from '#src/modules/settings/settings.schema.js';

const router = Router();

/** Read by the mobile app before login, so it stays public. */
router.get('/public', settingsController.getPublicSettings);

router.get('/', authenticate, requireAdmin, settingsController.getAllSettings);
router.patch(
  '/',
  authenticate,
  requireAdmin,
  validate({ body: updateSettingsSchema }),
  settingsController.updateSettings,
);

export const settingsRoutes = router;
