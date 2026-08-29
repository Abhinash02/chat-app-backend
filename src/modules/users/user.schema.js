import { z } from 'zod';

import { MAX_DISCOVERY_RADIUS_KM } from '#src/common/constants/index.js';
import { objectIdSchema, paginationSchema } from '#src/common/validators/common.schema.js';

export const updateProfileSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2)
      .max(60)
      .regex(/^[\p{L}\p{M}'\-. ]+$/u, 'Name can only contain letters, spaces, hyphens and apostrophes')
      .optional(),
    nickname: z
      .string()
      .trim()
      .min(2)
      .max(24)
      .regex(/^[a-zA-Z0-9_.]+$/, 'Nickname can only contain letters, numbers, dots and underscores')
      .optional(),
    bio: z.string().trim().max(240).optional(),
    interests: z.array(z.string().trim().min(1).max(30)).max(10).optional(),
    preferences: z
      .object({
        shareLocation: z.boolean().optional(),
        showOnlineStatus: z.boolean().optional(),
        pushEnabled: z.boolean().optional(),
        soundEnabled: z.boolean().optional(),
        notificationSound: z.string().trim().max(40).optional(),
        marketingEmails: z.boolean().optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: 'Nothing to update' });

export const updateLocationSchema = z
  .object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    city: z.string().trim().max(120).optional(),
    country: z.string().trim().max(120).optional(),
  })
  .strict();

export const discoverQuerySchema = paginationSchema
  .extend({
    onlineOnly: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional()
      .default('false'),
    search: z.string().trim().min(1).max(30).optional(),
    latitude: z.coerce.number().min(-90).max(90).optional(),
    longitude: z.coerce.number().min(-180).max(180).optional(),
    radiusKm: z.coerce.number().min(1).max(MAX_DISCOVERY_RADIUS_KM).optional(),
  })
  .refine(
    (value) =>
      (value.latitude === undefined) === (value.longitude === undefined),
    { message: 'Provide both latitude and longitude, or neither' },
  );

export const userIdParamSchema = z.object({ userId: objectIdSchema });
