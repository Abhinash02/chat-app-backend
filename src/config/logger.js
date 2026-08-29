import pino from 'pino';

import { env } from '#src/config/env.js';

/**
 * Keys that must never reach the log sink. Pino redacts them at every depth.
 */
const REDACTED_PATHS = [
  'password',
  'passwordHash',
  'newPassword',
  'currentPassword',
  'otp',
  'otpHash',
  'token',
  'accessToken',
  'refreshToken',
  'authorization',
  'req.headers.authorization',
  'req.headers.cookie',
  '*.password',
  '*.otp',
  '*.token',
];

function resolveLevel() {
  // Test runs stay quiet so a failing assertion is not buried in log output.
  if (env.isTest) return 'silent';
  return env.isProduction ? 'info' : 'debug';
}

export const logger = pino({
  level: resolveLevel(),
  redact: { paths: REDACTED_PATHS, censor: '[redacted]' },
  base: { service: 'vibe-chat-backend' },
  transport: env.isProduction || env.isTest
    ? undefined
    : { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss' } },
});
