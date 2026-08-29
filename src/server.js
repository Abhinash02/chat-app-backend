import http from 'node:http';

import { createApp } from '#src/app.js';
import { connectDatabase, disconnectDatabase } from '#src/config/database.js';
import { env } from '#src/config/env.js';
import { logger } from '#src/config/logger.js';
import { startSchedulers, stopSchedulers } from '#src/jobs/index.js';
import { createSocketServer } from '#src/realtime/socket.js';
import { campaignService } from '#src/modules/notifications/campaign.service.js';
import { themeService } from '#src/modules/theme/theme.service.js';
import { userService } from '#src/modules/users/user.service.js';

const SHUTDOWN_TIMEOUT_MS = 15_000;

async function bootstrap() {
  await connectDatabase();

  // Presence flags survive a crash but the sockets behind them do not.
  await userService.resetAllPresence();
  await themeService.ensurePresetsSeeded();
  await campaignService.ensureSystemTemplatesSeeded();

  const app = createApp();
  const httpServer = http.createServer(app);
  const io = createSocketServer(httpServer);

  startSchedulers();

  await new Promise((resolve) => httpServer.listen(env.PORT, resolve));
  logger.info({ port: env.PORT, env: env.NODE_ENV, api: env.API_PREFIX }, 'Server listening');

  return { httpServer, io };
}

/**
 * Graceful shutdown: stop accepting connections, let in-flight requests finish,
 * close sockets and the database, then exit. A hard timeout guarantees the
 * process dies even if something refuses to settle.
 */
function registerShutdownHandlers({ httpServer, io }) {
  let shuttingDown = false;

  async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;

    logger.info({ signal }, 'Shutting down');

    const forceExit = setTimeout(() => {
      logger.error('Graceful shutdown timed out; forcing exit');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceExit.unref();

    try {
      stopSchedulers();
      await new Promise((resolve) => io.close(resolve));
      await new Promise((resolve) => httpServer.close(resolve));
      await userService.resetAllPresence();
      await disconnectDatabase();

      logger.info('Shutdown complete');
      process.exit(0);
    } catch (error) {
      logger.error({ err: error }, 'Error during shutdown');
      process.exit(1);
    }
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error({ err: reason }, 'Unhandled promise rejection');
  });

  process.on('uncaughtException', (error) => {
    // The process state is no longer trustworthy after this; log and restart.
    logger.fatal({ err: error }, 'Uncaught exception');
    shutdown('uncaughtException');
  });
}

bootstrap()
  .then(registerShutdownHandlers)
  .catch((error) => {
    logger.fatal({ err: error }, 'Failed to start server');
    process.exit(1);
  });
