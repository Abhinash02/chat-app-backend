import { ONE_HOUR_MS } from '#src/common/utils/date.util.js';
import { logger } from '#src/config/logger.js';
import { emitToUser } from '#src/realtime/emitter.js';
import { SOCKET_EVENT } from '#src/realtime/events.js';
import { walletRepository } from '#src/modules/coins/wallet.repository.js';
import { settingsService } from '#src/modules/settings/settings.service.js';
import { UserModel } from '#src/modules/users/user.model.js';
import { USER_STATUS } from '#src/common/constants/index.js';

const CHECK_INTERVAL_MS = 5 * 60 * 1000;
const BATCH_SIZE = 500;

/**
 * Nudges people whose daily bonus has just become claimable.
 *
 * The coins themselves are *not* credited here — claiming stays a deliberate
 * user action, which is what makes the countdown in the app meaningful and
 * keeps the ledger tied to an intent rather than a timer. This job only pushes
 * the "your bonus is ready" event to anyone currently connected.
 */
export async function notifyReadyDailyBonuses() {
  const coinSettings = await settingsService.getCoinSettings();
  if (coinSettings.dailyBonusCoins <= 0) return 0;

  const eligibleBefore = new Date(Date.now() - coinSettings.dailyBonusIntervalHours * ONE_HOUR_MS);

  // Only billed genders receive the bonus at all.
  const eligibleUsers = await UserModel.find({
    gender: { $in: coinSettings.chargedGenders },
    status: USER_STATUS.ACTIVE,
    isOnline: true,
  })
    .select('_id')
    .limit(BATCH_SIZE)
    .lean()
    .exec();

  if (eligibleUsers.length === 0) return 0;

  const wallets = await walletRepository.findDueForDailyBonus({
    eligibleBefore,
    userIds: eligibleUsers.map((user) => user._id),
    limit: BATCH_SIZE,
  });

  for (const wallet of wallets) {
    emitToUser(wallet.userId, SOCKET_EVENT.DAILY_BONUS_READY, {
      amount: coinSettings.dailyBonusCoins,
      isAvailable: true,
    });
  }

  if (wallets.length > 0) {
    logger.debug({ count: wallets.length }, 'Notified users their daily bonus is ready');
  }

  return wallets.length;
}

export function startDailyBonusScheduler() {
  const timer = setInterval(() => {
    notifyReadyDailyBonuses().catch((error) =>
      logger.error({ err: error }, 'Daily bonus notification job failed'),
    );
  }, CHECK_INTERVAL_MS);

  // Never hold the process open just for this timer.
  timer.unref();
  return timer;
}
