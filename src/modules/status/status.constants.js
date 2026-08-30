export const STATUS_TYPE = Object.freeze({
  TEXT: 'text',
  IMAGE: 'image',
  VIDEO: 'video',
});

/**
 * How long a status lives.
 *
 * Twenty-four hours is the convention people already expect, and it is what
 * makes posting feel low-stakes — nothing here becomes a permanent profile.
 * Expiry is enforced by a TTL index rather than a sweep, so a status vanishes
 * on the database's clock whether or not the app is running.
 */
export const STATUS_TTL_HOURS = 24;

/** Video is capped hard: a status is a glance, not a broadcast. */
export const MAX_VIDEO_SECONDS = 15;

/** Text statuses are rendered on a colour rather than over an image. */
export const TEXT_BACKGROUNDS = Object.freeze([
  { id: 'sunset', colors: ['#FF6B35', '#F7B32B'] },
  { id: 'blush', colors: ['#FF4E88', '#7C4DFF'] },
  { id: 'ocean', colors: ['#0EA5E9', '#14B8A6'] },
  { id: 'forest', colors: ['#1B9E77', '#84CC16'] },
  { id: 'midnight', colors: ['#4C1D95', '#1E1B4B'] },
  { id: 'ember', colors: ['#DC2626', '#F59E0B'] },
  { id: 'candy', colors: ['#EC4899', '#8B5CF6'] },
  { id: 'slate', colors: ['#334155', '#0F172A'] },
]);

export const TEXT_BACKGROUND_IDS = Object.freeze(TEXT_BACKGROUNDS.map((option) => option.id));
