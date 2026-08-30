import { logger } from '#src/config/logger.js';
import { guardJob } from '#src/jobs/guard.js';
import { ONE_HOUR_MS } from '#src/common/utils/date.util.js';
import { paymentRepository } from '#src/modules/payments/payment.repository.js';
import { ORDER_EXPIRY_MINUTES } from '#src/modules/payments/payment.constants.js';
import { roomRepository } from '#src/modules/rooms/room.repository.js';
import { themeService } from '#src/modules/theme/theme.service.js';

const CHECK_INTERVAL_MS = 15 * 60 * 1000;
const ROOM_IDLE_HOURS = 2;

/**
 * Sweeps state that nothing else will clean up:
 *   - checkout orders abandoned before payment
 *   - rooms whose participants all vanished (e.g. a process restart)
 *   - themes whose scheduled festival window has opened or closed
 *
 * Both are safe to run repeatedly and only touch rows that are already stale,
 * so a second instance running the same sweep changes nothing.
 */
export async function runHousekeeping() {
  const expiredOrders = await paymentRepository.expireStaleOrders(
    new Date(Date.now() - ORDER_EXPIRY_MINUTES * 60 * 1000),
  );

  const closedRooms = await roomRepository.closeStaleRooms(
    new Date(Date.now() - ROOM_IDLE_HOURS * ONE_HOUR_MS),
  );

  // A scheduled theme swap is the one part of this sweep users actually see,
  // so it runs on the same cadence rather than waiting for a deploy.
  const theme = await themeService.applyScheduledThemes().catch(() => ({ changed: null }));

  if (expiredOrders.modifiedCount > 0 || closedRooms.modifiedCount > 0) {
    logger.info(
      { expiredOrders: expiredOrders.modifiedCount, closedRooms: closedRooms.modifiedCount },
      'Housekeeping sweep completed',
    );
  }

  return {
    expiredOrders: expiredOrders.modifiedCount,
    closedRooms: closedRooms.modifiedCount,
    themeChangedTo: theme.changed,
  };
}

export function startHousekeepingScheduler() {
  const tick = guardJob('housekeeping', runHousekeeping);
  const timer = setInterval(tick, CHECK_INTERVAL_MS);

  timer.unref();
  return timer;
}
