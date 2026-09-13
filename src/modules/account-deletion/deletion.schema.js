import { z } from 'zod';

import {
  DELETION_REASON,
  DELETION_REQUEST_STATUS,
} from '#src/modules/account-deletion/deletion.constants.js';

export const requestDeletionSchema = z
  .object({
    reason: z.nativeEnum(DELETION_REASON),
    reasonDetail: z.string().trim().max(500).optional(),
  })
  /*
   * "Other" without a note tells us nothing, which defeats the point of asking
   * at all. Every other reason stands on its own, so the note stays optional
   * there rather than adding a step to the common path.
   */
  .refine((data) => data.reason !== DELETION_REASON.OTHER || Boolean(data.reasonDetail?.trim()), {
    message: 'Please tell us a little more about why you are leaving',
    path: ['reasonDetail'],
  });

export const approveDeletionSchema = z.object({
  adminNotes: z.string().trim().max(300).optional(),
});

export const rejectDeletionSchema = z.object({
  reason: z.string().trim().min(2, 'Please give a reason this was declined').max(300),
  adminNotes: z.string().trim().max(300).optional(),
});

export const listDeletionRequestsSchema = z.object({
  status: z.union([z.nativeEnum(DELETION_REQUEST_STATUS), z.literal('all')]).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});
