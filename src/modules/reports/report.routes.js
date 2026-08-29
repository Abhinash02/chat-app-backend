import { Router } from 'express';

import { authenticate, requireAdmin, requireVerifiedAccount, validate } from '#src/common/middleware/index.js';
import { reportController } from '#src/modules/reports/report.controller.js';
import {
  createReportSchema,
  listReportsSchema,
  reportIdParamSchema,
  reviewReportSchema,
} from '#src/modules/reports/report.schema.js';

const router = Router();

router.use(authenticate);

router.post(
  '/',
  requireVerifiedAccount,
  validate({ body: createReportSchema }),
  reportController.createReport,
);

router.get('/', requireAdmin, validate({ query: listReportsSchema }), reportController.listReports);
router.get('/:reportId', requireAdmin, validate({ params: reportIdParamSchema }), reportController.getReport);
router.patch(
  '/:reportId',
  requireAdmin,
  validate({ params: reportIdParamSchema, body: reviewReportSchema }),
  reportController.reviewReport,
);

export const reportRoutes = router;
