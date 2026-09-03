/**
 * How a banner draws attention to itself.
 *
 * Kept to a short, named list rather than free-form CSS: the app renders these
 * with native drivers, and an admin should not be able to author something the
 * phone cannot run smoothly at 60fps.
 */
export const BANNER_ANIMATION = Object.freeze({
  NONE: 'none',
  /** Slow horizontal drift — the usual choice for a wide promo image. */
  PAN: 'pan',
  /** Gentle scale in and out. */
  PULSE: 'pulse',
  /** A light sweep across the surface, like a shine. */
  SHIMMER: 'shimmer',
  /** Cross-fades between banners instead of sliding. */
  FADE: 'fade',
});

/** Where tapping a banner goes. */
export const BANNER_ACTION = Object.freeze({
  NONE: 'none',
  /** An in-app screen: coins, rooms, games, leaderboard. */
  SCREEN: 'screen',
  /** An external link, opened in the system browser. */
  URL: 'url',
});

export const BANNER_SCREENS = Object.freeze(['coins', 'rooms', 'games', 'chats', 'leaderboard', 'events', 'profile']);

/** Where a banner appears. */
export const BANNER_PLACEMENT = Object.freeze({
  HOME_TOP: 'home_top',
  HOME_BOTTOM_AD: 'home_bottom_ad',
});
