import { describe, expect, it } from 'vitest';

import { GENDER } from '#src/common/constants/index.js';
import { buildWalletSnapshot, isChargedGender } from '#src/modules/coins/coins.service.js';
import { DEFAULT_SETTINGS } from '#src/modules/settings/settings.constants.js';

const coinSettings = DEFAULT_SETTINGS.coins;

function wallet(overrides = {}) {
  return {
    coinBalance: 0,
    messageCredits: 0,
    freeTalkSecondsRemaining: 0,
    totalPurchasedCoins: 0,
    totalSpentCoins: 0,
    totalBonusCoins: 0,
    lifetimeBilledMessages: 0,
    lastDailyBonusAt: null,
    ...overrides,
  };
}

describe('isChargedGender', () => {
  it('should charge male accounts under the launch rules', () => {
    expect(isChargedGender(GENDER.MALE, coinSettings)).toBe(true);
  });

  it('should never charge female accounts', () => {
    expect(isChargedGender(GENDER.FEMALE, coinSettings)).toBe(false);
  });
});

describe('buildWalletSnapshot', () => {
  it('should mark a female account as unlimited with no message estimate', () => {
    const snapshot = buildWalletSnapshot({
      wallet: wallet(),
      coinSettings,
      gender: GENDER.FEMALE,
    });

    expect(snapshot.isUnlimited).toBe(true);
    expect(snapshot.isChargedAccount).toBe(false);
    expect(snapshot.estimatedMessagesRemaining).toBeNull();
  });

  it('should estimate remaining messages from balance and unused credits', () => {
    // 60 coins buys 6 blocks of 7 messages, plus 3 already-paid messages.
    const snapshot = buildWalletSnapshot({
      wallet: wallet({ coinBalance: 60, messageCredits: 3 }),
      coinSettings,
      gender: GENDER.MALE,
    });

    expect(snapshot.estimatedMessagesRemaining).toBe(3 + 6 * 7);
  });

  it('should not count a partial block the user cannot afford', () => {
    const snapshot = buildWalletSnapshot({
      wallet: wallet({ coinBalance: 9 }),
      coinSettings,
      gender: GENDER.MALE,
    });

    expect(snapshot.estimatedMessagesRemaining).toBe(0);
  });

  it('should offer the daily bonus immediately to an account that never claimed', () => {
    const snapshot = buildWalletSnapshot({ wallet: wallet(), coinSettings, gender: GENDER.MALE });

    expect(snapshot.dailyBonus).toMatchObject({
      eligible: true,
      isAvailable: true,
      amount: coinSettings.dailyBonusCoins,
      msRemaining: 0,
    });
  });

  it('should count down to the next bonus after a recent claim', () => {
    const claimedHoursAgo = 4;
    const snapshot = buildWalletSnapshot({
      wallet: wallet({ lastDailyBonusAt: new Date(Date.now() - claimedHoursAgo * 60 * 60 * 1000) }),
      coinSettings,
      gender: GENDER.MALE,
    });

    const expectedHoursLeft = coinSettings.dailyBonusIntervalHours - claimedHoursAgo;

    expect(snapshot.dailyBonus.isAvailable).toBe(false);
    expect(snapshot.dailyBonus.msRemaining / (60 * 60 * 1000)).toBeCloseTo(expectedHoursLeft, 1);
  });

  it('should not offer a daily bonus to an account that is never charged', () => {
    const snapshot = buildWalletSnapshot({ wallet: wallet(), coinSettings, gender: GENDER.FEMALE });

    expect(snapshot.dailyBonus.eligible).toBe(false);
    expect(snapshot.dailyBonus.isAvailable).toBe(false);
  });
});
