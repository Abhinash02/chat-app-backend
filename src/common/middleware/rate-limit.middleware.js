import rateLimit from 'express-rate-limit';

import { env } from '#src/config/env.js';

const ONE_MINUTE = 60 * 1000;

function buildLimiter({ windowMs, max, code, message }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    // Tests and local development would otherwise trip limits constantly.
    skip: () => env.isTest,
    keyGenerator: (req) => req.user?.id ?? req.ip,
    handler: (_req, res) => {
      res.status(429).json({ success: false, error: { code, message } });
    },
  });
}

export const globalRateLimiter = buildLimiter({
  windowMs: ONE_MINUTE,
  max: 300,
  code: 'RATE_LIMITED',
  message: 'Too many requests. Please slow down.',
});

/** Credential endpoints are the cheapest thing to brute force, so they are tightest. */
export const authRateLimiter = buildLimiter({
  windowMs: 15 * ONE_MINUTE,
  max: 20,
  code: 'AUTH_RATE_LIMITED',
  message: 'Too many attempts. Please try again in a few minutes.',
});

/** Sending mail costs money and can be used to spam a third party's inbox. */
export const otpRateLimiter = buildLimiter({
  windowMs: 15 * ONE_MINUTE,
  max: 5,
  code: 'OTP_RATE_LIMITED',
  message: 'Too many verification codes requested. Please wait before trying again.',
});

export const paymentRateLimiter = buildLimiter({
  windowMs: ONE_MINUTE,
  max: 15,
  code: 'PAYMENT_RATE_LIMITED',
  message: 'Too many payment attempts. Please wait a moment.',
});
