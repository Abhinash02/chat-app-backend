import mongoose from 'mongoose';

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

const colorField = (fallback) => ({
  type: String,
  default: fallback,
  validate: { validator: (value) => !value || HEX.test(value), message: '{VALUE} is not a hex colour' },
});

/**
 * How the marketing website looks, owned by the admin panel.
 *
 * Separate from the app's theme on purpose. The website has its own art
 * direction — a hero built on a blue that sinks into daylight — and inheriting
 * whatever brand colour the app is running would undo it. `followAppTheme`
 * exists for operators who would rather the two move together, and turns the
 * whole document off in favour of `/theme/active`.
 *
 * A singleton: one document, found by `key`, so there is never a question of
 * which row is live.
 */
const siteAppearanceSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'default', unique: true, index: true },

    /** When true the website repaints from the app's active theme instead. */
    followAppTheme: { type: Boolean, default: false },

    // Brand
    primary: colorField('#1f5fe0'),
    primaryDark: colorField('#1330cc'),
    onPrimary: colorField('#ffffff'),
    accent: colorField('#4f9df4'),

    // Surfaces and type
    background: colorField('#ffffff'),
    surface: colorField('#ffffff'),
    surfaceAlt: colorField('#eef5fe'),
    border: colorField('#d8e6f8'),
    textPrimary: colorField('#0b1b3a'),
    textSecondary: colorField('#40567d'),
    textMuted: colorField('#7d90ad'),

    // The brand gradient used on buttons, avatars and the final call to action
    gradientStart: colorField('#1f5fe0'),
    gradientEnd: colorField('#4f9df4'),

    /* Coins read as gold rather than as brand colour, in the app and now on the
       website's wallet and buy-coins screens, so it is a palette entry of its
       own instead of a literal in the page. */
    coinGold: colorField('#ffb020'),

    // The hero, top to bottom, and the near-black of the nav pill
    heroTop: colorField('#1330cc'),
    heroMid: colorField('#2f7ef0'),
    heroLow: colorField('#93ccf7'),
    heroBase: colorField('#dff0fb'),
    ink: colorField('#08080c'),
  },
  { timestamps: true },
);

export const SiteAppearanceModel = mongoose.model('SiteAppearance', siteAppearanceSchema);
