import mongoose from 'mongoose';

import { logger } from '#src/config/logger.js';

/**
 * Brings every collection's indexes in line with its schema.
 *
 * `autoIndex` is disabled in production (see config/database.js), so this is
 * the deliberate step that creates new indexes and drops ones the schema no
 * longer declares. Run it as part of a deploy, before the new code serves
 * traffic — a query that expects an index it does not have is a slow scan, not
 * an error, so it will not announce itself.
 *
 * Importing the model registry first guarantees every schema is registered;
 * `mongoose.models` is otherwise only populated for modules already imported.
 */
export async function syncIndexes() {
  await import('#src/database/models.js');

  const results = [];

  for (const [name, model] of Object.entries(mongoose.models)) {
    const dropped = await model.syncIndexes();
    results.push({ model: name, droppedIndexes: dropped });
    logger.info({ model: name, dropped }, 'Synced indexes');
  }

  return results;
}
