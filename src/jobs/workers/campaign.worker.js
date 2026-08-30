import { ONE_HOUR_MS } from '#src/common/utils/date.util.js';
import { logger } from '#src/config/logger.js';
import { guardJob } from '#src/jobs/guard.js';
import { isDatabaseUnreachable } from '#src/common/utils/error.util.js';
import { campaignService } from '#src/modules/notifications/campaign.service.js';
import { notificationRepository } from '#src/modules/notifications/notification.repository.js';
import {
  CAMPAIGN_BATCH_DELAY_MS,
  CAMPAIGN_STATUS,
} from '#src/modules/notifications/notification.constants.js';

// Ten seconds keeps a scheduled send within a minute of its slot without
// hammering the database when nothing is due.
const TICK_INTERVAL_MS = 10_000;
/** A send that has not progressed in this long is assumed dead and requeued. */
const STUCK_AFTER_MS = 2 * ONE_HOUR_MS;

let isRunning = false;

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms).unref?.();
  });
}

/**
 * Sends one queued campaign to completion, a batch at a time.
 *
 * Batches exist for two reasons: a mail provider will throttle or blacklist a
 * burst, and a 50,000-recipient send must survive a restart. The cursor is
 * written after every batch, so a process that dies resumes where it stopped
 * rather than mailing the first ten thousand people twice.
 */
export async function runCampaignTick() {
  if (isRunning) return { skipped: 'ALREADY_RUNNING' };
  isRunning = true;

  try {
    // Promote any recurring campaign whose slot has arrived, so it joins the
    // queue this tick rather than waiting for the next one.
    await campaignService
      .startDueRecurringCampaigns()
      .catch((error) => logger.error({ err: error }, 'Recurring campaign sweep failed'));

    const queued = await notificationRepository.findNextQueuedCampaign();
    if (!queued) return { skipped: 'NOTHING_QUEUED' };

    // Claiming is conditional, so a second instance ticking at the same moment
    // finds nothing to claim and moves on.
    const campaign = await notificationRepository.claimCampaignForSending(queued._id);
    if (!campaign) return { skipped: 'CLAIMED_ELSEWHERE' };

    logger.info(
      { campaignId: String(campaign._id), targeted: campaign.stats.targeted },
      'Campaign send started',
    );

    let current = campaign;
    let processed = 0;

    for (;;) {
      const result = await campaignService.sendCampaignBatch(current);
      processed += result.processed;

      if (result.done) break;

      current = await notificationRepository.findCampaignById(campaign._id);

      // An operator can stop a send between batches.
      if (current.status === CAMPAIGN_STATUS.CANCELLED) {
        logger.info({ campaignId: String(campaign._id), processed }, 'Campaign cancelled mid-send');
        return { cancelled: true, processed };
      }

      await delay(CAMPAIGN_BATCH_DELAY_MS);
    }

    const finished = await notificationRepository.updateCampaign(campaign._id, {
      $set: { status: CAMPAIGN_STATUS.SENT, completedAt: new Date() },
    });

    logger.info(
      { campaignId: String(campaign._id), processed, stats: finished.stats },
      'Campaign send completed',
    );

    return { completed: true, processed, stats: finished.stats };
  } catch (error) {
    // Connectivity failures are re-thrown so the guard can collapse them into
    // a single line; anything else is a real fault worth the full trace.
    if (isDatabaseUnreachable(error)) throw error;

    logger.error({ err: error }, 'Campaign worker failed');
    return { failed: true };
  } finally {
    isRunning = false;
  }
}

export function startCampaignWorker() {
  // A deploy mid-send leaves a campaign stuck in `sending`; put those back in
  // the queue so they finish rather than stalling forever.
  notificationRepository
    .requeueStuckCampaigns(new Date(Date.now() - STUCK_AFTER_MS))
    .then((result) => {
      if (result.modifiedCount > 0) {
        logger.warn({ count: result.modifiedCount }, 'Requeued campaigns left mid-send');
      }
    })
    .catch((error) => logger.error({ err: error }, 'Failed to requeue stuck campaigns'));

  const tick = guardJob('campaign-worker', runCampaignTick);
  const timer = setInterval(tick, TICK_INTERVAL_MS);

  timer.unref();
  return timer;
}
