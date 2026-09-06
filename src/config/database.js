import mongoose from 'mongoose';

import { env } from '#src/config/env.js';
import { logger } from '#src/config/logger.js';

mongoose.set('strictQuery', true);

let connectionPromise = null;

export async function connectDatabase(uri = env.MONGODB_URI) {
  if (connectionPromise) return connectionPromise;

  connectionPromise = mongoose
    .connect(uri, {
      /*
       * 30s, not 10s.
       *
       * Server selection covers DNS resolution of the SRV record plus the
       * handshake to a replica-set member. Ten seconds is comfortable on a
       * fast connection and not enough on a slow or congested one — Atlas here
       * has repeatedly needed longer, and the process exits at boot rather
       * than retrying, so a slow network turns into a dead backend rather than
       * a slow start. This does not make a genuinely unreachable database hang
       * forever; it just stops a survivable delay from being fatal.
       */
      serverSelectionTimeoutMS: 30_000,
      maxPoolSize: 30,
      minPoolSize: 5,
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
