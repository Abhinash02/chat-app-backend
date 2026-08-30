import { z } from 'zod';

import { objectIdSchema } from '#src/common/validators/common.schema.js';
import { TEXT_BACKGROUND_IDS } from '#src/modules/status/status.constants.js';

export const postTextStatusSchema = z
  .object({
    text: z.string().trim().min(1, 'Write something first').max(280),
    background: z.enum(TEXT_BACKGROUND_IDS).optional(),
  })
  .strict();

/**
 * The body beside an uploaded file.
 *
 * Multipart sends everything as strings and omits empty fields entirely, so
 * the caption is optional and coerced rather than required — a photo posted
 * with no caption is the common case, not an error.
 */
export const postMediaStatusSchema = z
  .object({
    caption: z.string().trim().max(280).optional().default(''),
    background: z.enum(TEXT_BACKGROUND_IDS).optional(),
  })
  .strict();

export const statusIdParamSchema = z.object({ statusId: objectIdSchema });

export const statusAuthorParamSchema = z.object({ userId: objectIdSchema });
