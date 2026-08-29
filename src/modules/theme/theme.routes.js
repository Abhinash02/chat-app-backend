import { Router } from 'express';

import { authenticate, requireAdmin, validate } from '#src/common/middleware/index.js';
import { idParamSchema } from '#src/common/validators/common.schema.js';
import { themeController } from '#src/modules/theme/theme.controller.js';
import { createThemeSchema, updateThemeSchema } from '#src/modules/theme/theme.schema.js';

const router = Router();

/** The app fetches this before the login screen renders, so it stays public. */
router.get('/active', themeController.getActiveTheme);

router.use(authenticate, requireAdmin);

router.get('/', themeController.listThemes);
router.post('/', validate({ body: createThemeSchema }), themeController.createTheme);
router.patch(
  '/:id',
  validate({ params: idParamSchema, body: updateThemeSchema }),
  themeController.updateTheme,
);
router.post('/:id/activate', validate({ params: idParamSchema }), themeController.activateTheme);
router.delete('/:id', validate({ params: idParamSchema }), themeController.deleteTheme);

export const themeRoutes = router;
