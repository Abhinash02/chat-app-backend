import mongoose from 'mongoose';

import {
  DEFAULT_BRANDING,
  DEFAULT_THEME_COLORS,
  THEME_COLOR_KEYS,
} from '#src/modules/theme/theme.constants.js';

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

const colorFields = Object.fromEntries(
  THEME_COLOR_KEYS.map((key) => [
    key,
    {
      type: String,
      required: true,
      default: DEFAULT_THEME_COLORS[key],
      validate: { validator: (value) => HEX_COLOR.test(value), message: '{VALUE} is not a hex colour' },
    },
  ]),
);

const colorsSchema = new mongoose.Schema(colorFields, { _id: false });

const brandingSchema = new mongoose.Schema(
  {
    appName: { type: String, trim: true, maxlength: 40, default: DEFAULT_BRANDING.appName },
    tagline: { type: String, trim: true, maxlength: 120, default: DEFAULT_BRANDING.tagline },
    logoUrl: { type: String, default: DEFAULT_BRANDING.logoUrl },
    splashImageUrl: { type: String, default: DEFAULT_BRANDING.splashImageUrl },
    borderRadius: { type: Number, min: 0, max: 40, default: DEFAULT_BRANDING.borderRadius },
    fontFamily: { type: String, trim: true, maxlength: 60, default: DEFAULT_BRANDING.fontFamily },
  },
  { _id: false },
);

const themeSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, trim: true, lowercase: true, maxlength: 40 },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    description: { type: String, trim: true, maxlength: 200, default: '' },
    isDark: { type: Boolean, default: false },
    /** Presets ship with the product and cannot be deleted by an admin. */
    isPreset: { type: Boolean, default: false },
    isActive: { type: Boolean, default: false, index: true },
    colors: { type: colorsSchema, default: () => ({}) },
    branding: { type: brandingSchema, default: () => ({}) },
    updatedByAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

themeSchema.index({ slug: 1 }, { unique: true });

export const ThemeModel = mongoose.model('Theme', themeSchema);
