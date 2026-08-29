import { logger } from '#src/config/logger.js';
import { startCampaignWorker } from '#src/jobs/workers/campaign.worker.js';
import { startDailyBonusScheduler } from '#src/jobs/schedulers/daily-bonus.scheduler.js';
import { startHousekeepingScheduler } from '#src/jobs/schedulers/housekeeping.scheduler.js';

let timers = [];

/**
 * Background work runs as in-process interval timers rather than a queue.
 *
 * The sweeps are idempotent, so running them on several instances at once is
 * harmless, and the campaign worker claims each campaign conditionally so only
 * one instance ever sends it. If this workload later needs retries, backoff or
 * fan-out, this is the seam to replace with a real queue.
 */
export function startSchedulers() {
  timers = [startDailyBonusScheduler(), startHousekeepingScheduler(), startCampaignWorker()];
  logger.info({ count: timers.length }, 'Background schedulers started');
}

export function stopSchedulers() {
  for (const timer of timers) clearInterval(timer);
  timers = [];
}
