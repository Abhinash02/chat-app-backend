import { CAMPAIGN_REPEAT } from '#src/modules/notifications/notification.constants.js';

/**
 * Works out when a recurring campaign should next fire.
 *
 * The awkward part is timezones: "every day at 7pm" must stay 7pm for the
 * audience through a daylight-saving change, so the target is expressed as a
 * wall-clock time in a named zone and converted to a UTC instant each time
 * rather than stored as one.
 *
 * `Intl.DateTimeFormat` is used to read the zone's current offset, which keeps
 * this correct without pulling in a date library.
 */
function zoneOffsetMinutes(timezone, instant) {
  // Reading the same instant as wall-clock parts in the target zone, then
  // treating those parts as if they were UTC, gives the zone's offset at that
  // moment — including any daylight-saving shift. Parts are used rather than a
  // formatted string because `Intl` emits US-style "08/30/2026, 03:41:23",
  // which Date cannot parse.
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);

  const pick = (type) => Number(parts.find((part) => part.type === type)?.value);

  // `hourCycle: h23` still reports midnight as 24 in some environments.
  const hour = pick('hour') % 24;

  const asIfUtc = Date.UTC(pick('year'), pick('month') - 1, pick('day'), hour, pick('minute'), pick('second'));

  // Round to the minute: the source instant carries milliseconds the formatted
  // parts do not, and a zone offset is always a whole number of minutes.
  return Math.round((asIfUtc - instant.getTime()) / 60_000);
}

/**
 * The UTC instant for a given wall-clock time on a given day in a zone.
 *
 * Two passes: the first uses the offset at the naive instant, the second
 * corrects it if that guess landed on the far side of a daylight-saving
 * boundary — which is exactly the case that makes a 7pm send drift to 6pm.
 */
function instantFor({ year, month, day, hour, minute, timezone }) {
  const naive = Date.UTC(year, month, day, hour, minute, 0, 0);
  const firstGuess = naive - zoneOffsetMinutes(timezone, new Date(naive)) * 60_000;
  const corrected = naive - zoneOffsetMinutes(timezone, new Date(firstGuess)) * 60_000;

  return new Date(corrected);
}

function partsInZone(instant, timezone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).formatToParts(instant);

  const pick = (type) => parts.find((part) => part.type === type)?.value;
  const weekdays = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

  return {
    year: Number(pick('year')),
    month: Number(pick('month')) - 1,
    day: Number(pick('day')),
    weekday: weekdays[pick('weekday')] ?? 0,
  };
}

/**
 * The next firing at or after `from`.
 *
 * Returns null for a non-repeating campaign, so callers can treat "no schedule"
 * and "schedule finished" identically.
 */
export function computeNextRun(repeat, from = new Date()) {
  if (!repeat || repeat.rule === CAMPAIGN_REPEAT.NONE || !repeat.isEnabled) return null;

  const timezone = repeat.timezone || 'Asia/Kolkata';
  const { year, month, day, weekday } = partsInZone(from, timezone);

  if (repeat.rule === CAMPAIGN_REPEAT.DAILY) {
    const today = instantFor({ year, month, day, hour: repeat.hour, minute: repeat.minute, timezone });
    if (today > from) return today;

    // Already past today's slot, so aim at tomorrow.
    return instantFor({ year, month, day: day + 1, hour: repeat.hour, minute: repeat.minute, timezone });
  }

  if (repeat.rule === CAMPAIGN_REPEAT.WEEKLY) {
    const target = repeat.weekday ?? 1;
    let daysAhead = (target - weekday + 7) % 7;

    const candidate = instantFor({
      year,
      month,
      day: day + daysAhead,
      hour: repeat.hour,
      minute: repeat.minute,
      timezone,
    });

    // If today is the day but the time has passed, go a full week out.
    if (candidate <= from) daysAhead += 7;
    if (candidate > from) return candidate;

    return instantFor({
      year,
      month,
      day: day + daysAhead,
      hour: repeat.hour,
      minute: repeat.minute,
      timezone,
    });
  }

  return null;
}

/** Human summary for the admin panel, e.g. "Every day at 19:00 (Asia/Kolkata)". */
export function describeSchedule(repeat) {
  if (!repeat || repeat.rule === CAMPAIGN_REPEAT.NONE) return 'Sends once';

  const time = `${String(repeat.hour).padStart(2, '0')}:${String(repeat.minute).padStart(2, '0')}`;
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  const when =
    repeat.rule === CAMPAIGN_REPEAT.DAILY ? 'Every day' : `Every ${days[repeat.weekday ?? 1]}`;

  return `${when} at ${time} (${repeat.timezone})${repeat.isEnabled ? '' : ' — paused'}`;
}
