import mongoose from 'mongoose';

import { env } from '#src/config/env.js';
import { logger } from '#src/config/logger.js';

mongoose.set('strictQuery', true);

let connectionPromise = null;

export async function connectDatabase(uri = env.MONGODB_URI) {
  if (connectionPromise) return connectionPromise;

  connectionPromise = mongoose
    .connect(uri, {
      serverSelectionTimeoutMS: 10_000,
      maxPoolSize: 20,
      minPoolSize: 2,
      // Building indexes on every boot is convenient locally but a real hazard
      // in production, where it can lock a large collection during a deploy.
      // Production syncs them explicitly via `npm run sync-indexes`.
      autoIndex: !env.isProduction,
    })
    .then((connection) => {
      logger.info({ host: connection.connection.host }, 'MongoDB connected');
      return connection;
    })
    .catch((error) => {
      connectionPromise = null;
      throw error;
    });

  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
  mongoose.connection.on('error', (error) => logger.error({ err: error }, 'MongoDB error'));

  return connectionPromise;
}

export async function disconnectDatabase() {
  if (!connectionPromise) return;
  await mongoose.disconnect();
  connectionPromise = null;
  logger.info('MongoDB disconnected');
}

export function isDatabaseHealthy() {
  return mongoose.connection.readyState === 1;
}
