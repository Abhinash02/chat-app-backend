import { isDatabaseUnreachable, summariseConnectivityError } from '#src/common/utils/error.util.js';
import { isDatabaseHealthy } from '#src/config/database.js';
import { logger } from '#src/config/logger.js';

/**
 * Wraps a background job so a database outage is reported once, briefly,
 * instead of on every tick with the driver's full replica-set topology
 * attached — which is how one unreachable cluster produces megabytes of log
 * a minute across several jobs.
 *
 * Jobs are skipped entirely while the connection is down: there is nothing
 * they could accomplish, and attempting anyway is what produces the noise.
 *
 * This lives apart from `jobs/index.js` on purpose. Putting it there made the
 * schedulers import the module that imports them, and a cycle like that
 * resolves to `undefined` often enough to be worth avoiding outright.
 */
export function guardJob(name, job) {
  let wasUnreachable = false;

  return async () => {
    if (!isDatabaseHealthy()) {
      if (!wasUnreachable) {
        wasUnreachable = true;
        logger.warn({ job: name }, 'Database unavailable — pausing job until it reconnects');
      }
      return undefined;
    }

    try {
      const result = await job();

      if (wasUnreachable) {
        wasUnreachable = false;
        logger.info({ job: name }, 'Database reachable again — job resumed');
      }

      return result;
    } catch (error) {
      if (isDatabaseUnreachable(error)) {
        if (!wasUnreachable) {
          wasUnreachable = true;
          logger.warn({ job: name, ...summariseConnectivityError(error) }, 'Database unreachable');
        }
        return undefined;
      }

      logger.error({ err: error, job: name }, `${name} failed`);
      return undefined;
    }
  };
}
