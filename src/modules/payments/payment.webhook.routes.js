import express, { Router } from 'express';

import { paymentController } from '#src/modules/payments/payment.controller.js';

const router = Router();

/**
 * Mounted before the JSON body parser: the HMAC is computed over the exact
 * bytes Razorpay sent, so any re-serialisation would break verification.
 * There is no session here — the signature is the authentication.
 */
router.post(
  '/razorpay',
  express.raw({ type: 'application/json', limit: '1mb' }),
  paymentController.handleWebhook,
);

export const paymentWebhookRoutes = router;
