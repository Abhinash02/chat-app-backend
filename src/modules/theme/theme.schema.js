import { z } from 'zod';

import { hexColorSchema } from '#src/common/validators/common.schema.js';
import { THEME_COLOR_KEYS } from '#src/modules/theme/theme.constants.js';

const colorsShape = Object.fromEntries(THEME_COLOR_KEYS.map((key) => [key, hexColorSchema.optional()]));

export const themeColorsSchema = z.object(colorsShape).strict();

export const themeBrandingSchema = z
  .object({
    appName: z.string().trim().min(1).max(40).optional(),
    tagline: z.string().trim().max(120).optional(),
    logoUrl: z.string().trim().max(500_000).optional(),
    splashImageUrl: z.string().trim().max(500_000).optional(),
    borderRadius: z.number().int().min(0).max(40).optional(),
    fontFamily: z.string().trim().max(60).optional(),
  })
  .strict();

export const createThemeSchema = z
  .object({
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .min(2)
      .max(40)
      .regex(/^[a-z0-9-]+$/, 'Use lowercase letters, numbers and hyphens only'),
    name: z.string().trim().min(2).max(60),
    description: z.string().trim().max(200).optional(),
    isDark: z.boolean().optional(),
    colors: themeColorsSchema.optional(),
    branding: themeBrandingSchema.optional(),
  })
  .strict();

export const updateThemeSchema = z
  .object({
    name: z.string().trim().min(2).max(60).optional(),
    description: z.string().trim().max(200).optional(),
    isDark: z.boolean().optional(),
    colors: themeColorsSchema.optional(),
    branding: themeBrandingSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: 'Nothing to update' });
