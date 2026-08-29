import { describe, expect, it } from 'vitest';

import { ONE_DAY_MS, addMinutes, isExpired, millisecondsUntil, parseDurationToMs } from '#src/common/utils/date.util.js';

describe('parseDurationToMs', () => {
  it('should parse the duration formats used for token lifetimes', () => {
    expect(parseDurationToMs('30s')).toBe(30_000);
    expect(parseDurationToMs('15m')).toBe(900_000);
    expect(parseDurationToMs('2h')).toBe(7_200_000);
    expect(parseDurationToMs('30d')).toBe(30 * ONE_DAY_MS);
  });

  it('should pass a numeric duration straight through', () => {
    expect(parseDurationToMs(1234)).toBe(1234);
  });

  it('should throw on an unsupported format rather than guess', () => {
    expect(() => parseDurationToMs('1 week')).toThrow(/Unsupported duration/);
  });
});

describe('isExpired', () => {
  it('should report a past date as expired', () => {
    expect(isExpired(new Date(Date.now() - 1000))).toBe(true);
  });

  it('should report a future date as not expired', () => {
    expect(isExpired(addMinutes(new Date(), 5))).toBe(false);
  });

  it('should treat a missing date as expired', () => {
    expect(isExpired(null)).toBe(true);
  });
});

describe('millisecondsUntil', () => {
  it('should never return a negative value for a past date', () => {
    expect(millisecondsUntil(new Date(Date.now() - 10_000))).toBe(0);
  });
});
