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

  /*
   * A port clash is the most common way starting this fails, and it is always
   * a two-second fix — but Node reports it as a bare stack trace ending in
   * `errno: -98`, which says nothing about what to do. Translating it here
   * costs one listener and saves the reader a search.
   */
  await new Promise((resolve, reject) => {
    httpServer.once('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        reject(
          Object.assign(
            new Error(
              `Port ${env.PORT} is already in use — most likely another copy of this server.\n` +
                `  Find it:  lsof -i :${env.PORT}      (macOS/Linux)   netstat -ano | findstr :${env.PORT}   (Windows)\n` +
                `  Or run on a different port:  PORT=5001 npm run dev`,
            ),
            // Flags an error whose message already says everything useful, so
            // the handler prints it plainly instead of adding a stack trace
            // that points at this line rather than at the cause.
            { isExplained: true },
          ),
        );
        return;
      }

      if (error.code === 'EACCES') {
        reject(
          Object.assign(
            new Error(
              `Not allowed to bind port ${env.PORT}. Ports below 1024 need elevated rights — ` +
                'try PORT=5000 npm run dev.',
            ),
            { isExplained: true },
          ),
        );
        return;
      }

      reject(error);
    });

    httpServer.listen(env.PORT, '0.0.0.0', resolve);
  });
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
    /*
     * A startup failure is read by a person at a terminal, not scraped from a
     * log aggregator. When we already know what went wrong and how to fix it,
     * the message alone is more useful than a stack trace pointing at the
     * line that threw. Anything unexpected still gets the full trace.
     */
    if (error.isExplained) {
      console.error(`\nCould not start: ${error.message}\n`);
    } else {
      logger.fatal({ err: error }, 'Failed to start server');
    }

    process.exit(1);
  });
