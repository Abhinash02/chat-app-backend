import { z } from 'zod';

import { objectIdSchema } from '#src/common/validators/common.schema.js';
import {
  BANNER_ACTION,
  BANNER_ANIMATION,
  BANNER_PLACEMENT,
} from '#src/modules/banners/banner.constants.js';

/**
 * Banners arrive as multipart form data alongside the image, so every field is
 * a string on the wire. These coercions are what turn "true" and "3" back into
 * a boolean and a number before they reach the service.
 */
const booleanFromForm = z
  .union([z.boolean(), z.enum(['true', 'false'])])
  .transform((value) => value === true || value === 'true');

const optionalDate = z
  .union([z.coerce.date(), z.literal(''), z.null()])
  .optional()
  .transform((value) => (value === '' || value === undefined ? null : value));

export const createBannerSchema = z
  .object({
    title: z.string().trim().min(2, 'Give the banner a title').max(80),
    note: z.string().trim().max(200).optional(),
    placement: z.nativeEnum(BANNER_PLACEMENT).default(BANNER_PLACEMENT.HOME_TOP),
    animation: z.nativeEnum(BANNER_ANIMATION).default(BANNER_ANIMATION.PAN),
    action: z.nativeEnum(BANNER_ACTION).default(BANNER_ACTION.NONE),
    actionTarget: z.string().trim().max(500).optional().default(''),
    isActive: booleanFromForm.optional().default(true),
    sortOrder: z.coerce.number().int().min(0).max(999).optional().default(0),
    startsAt: optionalDate,
    endsAt: optionalDate,
  })
  .refine(
    (value) => !value.startsAt || !value.endsAt || value.endsAt > value.startsAt,
    { message: 'The end date must come after the start date', path: ['endsAt'] },
  );

export const updateBannerSchema = z
  .object({
    title: z.string().trim().min(2).max(80).optional(),
    note: z.string().trim().max(200).optional(),
    animation: z.nativeEnum(BANNER_ANIMATION).optional(),
    action: z.nativeEnum(BANNER_ACTION).optional(),
    actionTarget: z.string().trim().max(500).optional(),
    isActive: booleanFromForm.optional(),
    sortOrder: z.coerce.number().int().min(0).max(999).optional(),
    startsAt: optionalDate,
    endsAt: optionalDate,
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'Nothing to update' });

export const bannerIdParamSchema = z.object({ bannerId: objectIdSchema });

export const impressionSchema = z
  .object({ bannerIds: z.array(objectIdSchema).min(1).max(20) })
  .strict();
