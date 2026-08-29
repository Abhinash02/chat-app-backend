import { GENDER } from '#src/common/constants/index.js';

/**
 * Every account gets a generated avatar at signup, so nobody starts as a grey
 * silhouette and the discovery grid never looks empty.
 *
 * The sets are gendered because the product is, and someone browsing should be
 * able to tell at a glance. They lead with people and widen into characters and
 * symbols, which keeps a grid of twenty profiles from looking repetitive.
 */
const MALE_EMOJI = [
  '\u{1F466}', '\u{1F468}', '\u{1F9D4}', '\u{1F473}\u{200D}\u{2642}\u{FE0F}',
  '\u{1F934}', '\u{1F9D9}\u{200D}\u{2642}\u{FE0F}', '\u{1F9B8}\u{200D}\u{2642}\u{FE0F}',
  '\u{1F468}\u{200D}\u{1F3A4}', '\u{1F468}\u{200D}\u{1F680}', '\u{1F468}\u{200D}\u{1F3A8}',
  '\u{1F42F}', '\u{1F981}', '\u{1F43A}', '\u{1F98A}', '\u{1F43B}', '\u{1F988}',
  '\u{1F985}', '\u{1F409}', '\u{1F680}', '\u{26A1}', '\u{1F3B8}', '\u{1F3C0}',
  '\u{26BD}', '\u{1F3AE}', '\u{1F3AF}', '\u{1F3C4}', '\u{1F3CD}', '\u{1F3B2}',
];

const FEMALE_EMOJI = [
  '\u{1F467}', '\u{1F469}', '\u{1F9D5}', '\u{1F470}\u{200D}\u{2640}\u{FE0F}',
  '\u{1F478}', '\u{1F9DA}\u{200D}\u{2640}\u{FE0F}', '\u{1F9DC}\u{200D}\u{2640}\u{FE0F}',
  '\u{1F469}\u{200D}\u{1F3A4}', '\u{1F469}\u{200D}\u{1F3A8}', '\u{1F483}',
  '\u{1F98B}', '\u{1F984}', '\u{1F430}', '\u{1F431}', '\u{1F438}', '\u{1F419}',
  '\u{1F337}', '\u{1F338}', '\u{1F33A}', '\u{1F490}', '\u{1F353}', '\u{1F352}',
  '\u{1F380}', '\u{1F48E}', '\u{2728}', '\u{1F31F}', '\u{1F308}', '\u{1F36D}',
];

/**
 * Backgrounds the emoji sits on. Chosen to stay readable behind a large glyph
 * in both a light and a dark app theme, which rules out anything too pale.
 */
const AVATAR_COLORS = [
  '#FF4E88', '#7C4DFF', '#00B8D4', '#00BFA5', '#FF6D00', '#F4511E',
  '#8E24AA', '#3949AB', '#039BE5', '#00897B', '#43A047', '#FDD835',
  '#FB8C00', '#6D4C41', '#546E7A', '#D81B60', '#5E35B1', '#1E88E5',
];

export const AVATAR_EMOJI_BY_GENDER = Object.freeze({
  [GENDER.MALE]: MALE_EMOJI,
  [GENDER.FEMALE]: FEMALE_EMOJI,
});

export { AVATAR_COLORS };

/**
 * Picks an avatar for a new account.
 *
 * Note that this is *distinctive*, not unique: 28 emoji across 18 colours is
 * 504 combinations, so a large user base will repeat. Guaranteeing uniqueness
 * would mean a lookup table that eventually runs out and a signup that fails
 * because every avatar is taken — a bad trade for a placeholder the user is
 * invited to replace with a real photo anyway.
 *
 * Selection is random rather than derived from the user id, so two people who
 * sign up seconds apart do not end up looking related.
 */
export function generateAvatar(gender) {
  const emojiSet = AVATAR_EMOJI_BY_GENDER[gender] ?? MALE_EMOJI;

  return {
    emoji: emojiSet[Math.floor(Math.random() * emojiSet.length)],
    color: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
  };
}
