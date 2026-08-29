import { z } from 'zod';

import { objectIdSchema, paginationSchema } from '#src/common/validators/common.schema.js';
import { REPORT_REASON, REPORT_STATUS } from '#src/modules/reports/report.constants.js';

export const createReportSchema = z
  .object({
    reportedUserId: objectIdSchema,
    reason: z.nativeEnum(REPORT_REASON),
    details: z.string().trim().max(500).optional(),
    conversationId: objectIdSchema.optional(),
    alsoBlock: z.boolean().optional().default(true),
  })
  .strict();

export const reportIdParamSchema = z.object({ reportId: objectIdSchema });

export const listReportsSchema = paginationSchema.extend({
  status: z.nativeEnum(REPORT_STATUS).optional(),
});

export const reviewReportSchema = z
  .object({
    status: z.enum([REPORT_STATUS.REVIEWING, REPORT_STATUS.ACTIONED, REPORT_STATUS.DISMISSED]),
    reviewNote: z.string().trim().max(500).optional(),
  })
  .strict();
