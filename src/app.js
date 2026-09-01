import path from 'node:path';

import compression from 'compression';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';

import {
  errorHandler,
  globalRateLimiter,
  notFoundHandler,
  requestContext,
} from '#src/common/middleware/index.js';
import { ForbiddenError } from '#src/common/errors/index.js';
import { env } from '#src/config/env.js';
import { logger } from '#src/config/logger.js';
import { apiRoutes } from '#src/routes/index.js';
import { paymentWebhookRoutes } from '#src/modules/payments/index.js';
import { UPLOAD_ROOT } from '#src/integrations/storage/local.storage.js';

export function createApp() {
  const app = express();

  // Behind a proxy (Render, Railway, Nginx) this is what makes `req.ip` and the
  // rate limiter see the real client address instead of the proxy's.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

  app.use(
    cors({
      origin(origin, callback) {
        // Native apps and server-to-server calls send no Origin header.
        if (!origin) return callback(null, true);

        // Allow wildcard or explicit matches
        if (
          env.corsOrigins.includes('*') ||
          env.corsOrigins.includes(origin) ||
          origin.endsWith('.vercel.app') ||
          origin.endsWith('.onrender.com') ||
          /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/.test(origin)
        ) {
          return callback(null, true);
        }

        return callback(
          new ForbiddenError(
            `Origin ${origin} is not allowed. Add it to CORS_ORIGINS.`,
            'ORIGIN_NOT_ALLOWED',
          ),
        );
      },
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    }),
  );

  app.use(requestContext);
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => req.id,
      autoLogging: { ignore: (req) => req.url === '/api/v1/health' },
    }),
  );

  /**
   * Webhooks are mounted before the JSON parser: their signature covers the raw
   * bytes, which a re-serialised body would not reproduce.
   */
  app.use('/webhooks', paymentWebhookRoutes);

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(compression());
  app.use(globalRateLimiter);

  // Only used by the local storage provider; cloud providers serve their own URLs.
  if (env.STORAGE_PROVIDER === 'local') {
    app.use('/uploads', express.static(path.resolve(UPLOAD_ROOT), { maxAge: '365d', index: false }));
  }

  // Root health / info endpoint for Render and ping probes
  app.get('/', (_req, res) => {
    res.json({
      name: 'Vibe Chat API',
      status: 'online',
      version: '1.0.0',
      apiPrefix: env.API_PREFIX,
      healthCheck: `${env.API_PREFIX}/health`,
    });
  });
  app.head('/', (_req, res) => res.status(200).end());

  app.use(env.API_PREFIX, apiRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
