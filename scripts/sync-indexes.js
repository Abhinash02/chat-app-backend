/**
 * Deploy step: create and prune database indexes.
 *
 *   npm run sync-indexes
 *
 * Safe to run repeatedly. Run it before the new application version starts
 * serving traffic, since production has `autoIndex` disabled.
 */
import { connectDatabase, disconnectDatabase } from '#src/config/database.js';
import { logger } from '#src/config/logger.js';
import { syncIndexes } from '#src/database/index.js';

connectDatabase()
  .then(syncIndexes)
  .then(async (results) => {
    logger.info({ collections: results.length }, 'Index sync complete');
    await disconnectDatabase();
    process.exit(0);
  })
  .catch(async (error) => {
    logger.fatal({ err: error }, 'Index sync failed');
    await disconnectDatabase().catch(() => undefined);
    process.exit(1);
  });
