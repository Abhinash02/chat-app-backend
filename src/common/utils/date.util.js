export const ONE_MINUTE_MS = 60 * 1000;
export const ONE_HOUR_MS = 60 * ONE_MINUTE_MS;
export const ONE_DAY_MS = 24 * ONE_HOUR_MS;

export function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * ONE_MINUTE_MS);
}

export function addMilliseconds(date, milliseconds) {
  return new Date(date.getTime() + milliseconds);
}

export function isExpired(date, now = new Date()) {
  return !date || date.getTime() <= now.getTime();
}

/** Milliseconds until `date`, never negative. */
export function millisecondsUntil(date, now = new Date()) {
  if (!date) return 0;
  return Math.max(0, date.getTime() - now.getTime());
}

const DURATION_UNIT_MS = {
  s: 1000,
  m: ONE_MINUTE_MS,
  h: ONE_HOUR_MS,
  d: ONE_DAY_MS,
};

/**
 * Parses the same duration strings jsonwebtoken accepts ("15m", "30d", "12h"),
 * so a session row expires at exactly the moment its token does.
 */
export function parseDurationToMs(duration) {
  if (typeof duration === 'number') return duration;

  const match = /^(\d+)\s*([smhd])$/.exec(String(duration).trim());
  if (!match) throw new Error(`Unsupported duration format: ${duration}`);

  return Number(match[1]) * DURATION_UNIT_MS[match[2]];
}
