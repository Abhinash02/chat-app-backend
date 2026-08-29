import { ONE_DAY_MS } from '#src/common/utils/date.util.js';
import { USER_STATUS } from '#src/common/constants/index.js';
import { WalletModel } from '#src/modules/coins/wallet.model.js';
import { AUDIENCE_PRESET } from '#src/modules/notifications/notification.constants.js';

/**
 * Turns an audience description into a MongoDB filter over users.
 *
 * Presets that depend on wallet state (paying, low balance, never purchased)
 * resolve to a set of user ids first, because wallets live in their own
 * collection. That is a two-step query rather than a join, which is fine at the
 * scale this app targets and keeps the wallet as the single owner of coin data.
 * If the user base outgrows it, this is the one function to revisit.
 */
async function resolveWalletUserIds(preset, maxCoinBalance) {
  if (preset === AUDIENCE_PRESET.NEVER_PURCHASED) {
    const wallets = await WalletModel.find({ totalPurchasedCoins: { $lte: 0 } })
      .select('userId')
      .lean()
      .exec();
    return wallets.map((wallet) => wallet.userId);
  }

  if (preset === AUDIENCE_PRESET.PAYING_USERS) {
    const wallets = await WalletModel.find({ totalPurchasedCoins: { $gt: 0 } })
      .select('userId')
      .lean()
      .exec();
    return wallets.map((wallet) => wallet.userId);
  }

  if (preset === AUDIENCE_PRESET.LOW_BALANCE || maxCoinBalance !== null) {
    const threshold = maxCoinBalance ?? 10;
    const wallets = await WalletModel.find({ coinBalance: { $lte: threshold } })
      .select('userId')
      .lean()
      .exec();
    return wallets.map((wallet) => wallet.userId);
  }

  return null;
}

export async function buildAudienceFilter(audience = {}) {
  const {
    preset = AUDIENCE_PRESET.EVERYONE,
    gender = null,
    onlineOnly = false,
    inactiveForDays = null,
    maxCoinBalance = null,
    hasPurchased = null,
  } = audience;

  // Only verified, usable accounts ever receive a campaign. Sending to a
  // pending or suspended account is at best noise and at worst harassment.
  const filter = { status: USER_STATUS.ACTIVE };

  if (preset === AUDIENCE_PRESET.BOYS) filter.gender = 'male';
  if (preset === AUDIENCE_PRESET.GIRLS) filter.gender = 'female';
  if (preset === AUDIENCE_PRESET.ONLINE_NOW) filter.isOnline = true;

  if (preset === AUDIENCE_PRESET.INACTIVE_7_DAYS) {
    filter.lastSeenAt = { $lt: new Date(Date.now() - 7 * ONE_DAY_MS) };
  }

  // Explicit filters layer on top of the preset and win where they overlap.
  if (gender) filter.gender = gender;
  if (onlineOnly) filter.isOnline = true;

  if (inactiveForDays) {
    filter.lastSeenAt = { $lt: new Date(Date.now() - inactiveForDays * ONE_DAY_MS) };
  }

  const walletPreset =
    hasPurchased === true
      ? AUDIENCE_PRESET.PAYING_USERS
      : hasPurchased === false
        ? AUDIENCE_PRESET.NEVER_PURCHASED
        : preset;

  const walletUserIds = await resolveWalletUserIds(walletPreset, maxCoinBalance);
  if (walletUserIds) filter._id = { $in: walletUserIds };

  return filter;
}
