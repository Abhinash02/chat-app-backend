import { logger } from '#src/config/logger.js';
import { guardJob } from '#src/jobs/guard.js';
import { ONE_HOUR_MS } from '#src/common/utils/date.util.js';
import { chatRepository } from '#src/modules/chat/chat.repository.js';
import { paymentRepository } from '#src/modules/payments/payment.repository.js';
import { ORDER_EXPIRY_MINUTES } from '#src/modules/payments/payment.constants.js';
import { roomRepository } from '#src/modules/rooms/room.repository.js';
import { themeService } from '#src/modules/theme/theme.service.js';

const CHECK_INTERVAL_MS = 15 * 60 * 1000;
/*
 * How long an empty room is kept before it is collected.
 *
 * Long enough that a host who backgrounded the app, lost signal or took a
 * call can come back to it; short enough that abandoned rooms do not pile up
 * in the list. A dropped socket no longer closes a room, so this is the only
 * thing that ever cleans one up automatically.
 */
const ROOM_IDLE_HOURS = 1;

/**
 * Sweeps state that nothing else will clean up:
 *   - checkout orders abandoned before payment
 *   - rooms whose participants all vanished (e.g. a process restart)
 *   - chats with 7+ days of inactivity (deleting inbox threads and messages)
 *   - themes whose scheduled festival window has opened or closed
 *
 * Safe to run repeatedly and only touches rows that are already stale.
 */
export async function runHousekeeping() {
  const expiredOrders = await paymentRepository.expireStaleOrders(
    new Date(Date.now() - ORDER_EXPIRY_MINUTES * 60 * 1000),
  );

  const closedRooms = await roomRepository.closeStaleRooms(
    new Date(Date.now() - ROOM_IDLE_HOURS * ONE_HOUR_MS),
  );

  // Auto-delete chats with 7+ days of inactivity
  const cleanedChats = await chatRepository.cleanupInactiveConversations(
    new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
  );

  // A scheduled theme swap is the one part of this sweep users actually see,
  // so it runs on the same cadence rather than waiting for a deploy.
  const theme = await themeService.applyScheduledThemes().catch(() => ({ changed: null }));

  if (
    expiredOrders.modifiedCount > 0 ||
    closedRooms.modifiedCount > 0 ||
    cleanedChats.deletedConversations > 0
  ) {
    logger.info(
      {
        expiredOrders: expiredOrders.modifiedCount,
        closedRooms: closedRooms.modifiedCount,
        deletedConversations: cleanedChats.deletedConversations,
        deletedMessages: cleanedChats.deletedMessages,
      },
      'Housekeeping sweep completed',
    );
  }

  return {
    expiredOrders: expiredOrders.modifiedCount,
    closedRooms: closedRooms.modifiedCount,
    cleanedChats,
    themeChangedTo: theme.changed,
  };
}

export function startHousekeepingScheduler() {
  const tick = guardJob('housekeeping', runHousekeeping);
  const timer = setInterval(tick, CHECK_INTERVAL_MS);

  timer.unref();
  return timer;
}
