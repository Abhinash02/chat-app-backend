import crypto from 'node:crypto';

import Razorpay from 'razorpay';

import { env } from '#src/config/env.js';
import { logger } from '#src/config/logger.js';
import { PAYMENT_PROVIDER } from '#src/integrations/payments/payment.gateway.js';

let client = null;

function getClient() {
  if (client) return client;

  if (!env.isRazorpayConfigured) {
    throw new Error('Razorpay is not configured (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET missing)');
  }

  client = new Razorpay({ key_id: env.RAZORPAY_KEY_ID, key_secret: env.RAZORPAY_KEY_SECRET });
  return client;
}

/** Length-safe HMAC comparison — `timingSafeEqual` throws on unequal lengths. */
function signatureMatches(expected, received) {
  const expectedBuffer = Buffer.from(expected, 'utf8');
  const receivedBuffer = Buffer.from(String(received ?? ''), 'utf8');

  if (expectedBuffer.length !== receivedBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

/** @type {import('#src/integrations/payments/payment.gateway.js').PaymentGateway} */
export const razorpayGateway = {
  name: PAYMENT_PROVIDER.RAZORPAY,

  get isConfigured() {
    return env.isRazorpayConfigured;
  },

  async createOrder({ amountInPaise, currency, receipt, notes }) {
    const order = await getClient().orders.create({
      amount: amountInPaise,
      currency,
      receipt,
      notes,
      payment_capture: 1,
    });

    return {
      providerOrderId: order.id,
      amountInPaise: Number(order.amount),
      currency: order.currency,
      provider: PAYMENT_PROVIDER.RAZORPAY,
    };
  },

  /**
   * A hosted checkout page, for clients that cannot run the browser SDK.
   *
   * Razorpay's standard checkout is JavaScript in a page — there is no native
   * equivalent and no way to turn an order id into a URL. A Payment Link is the
   * supported answer: Razorpay hosts the page, the app opens it in the device
   * browser, and the result comes back over the webhook like any other payment.
   *
   * `reference_id` carries our own order id so the webhook can find its way
   * back here, and `notes` repeats it because the two travel in different parts
   * of different events.
   */
  async createPaymentLink({
    amountInPaise,
    currency = 'INR',
    description,
    referenceId,
    customer = {},
    notes = {},
    callbackUrl,
  }) {
    const link = await getClient().paymentLink.create({
      amount: amountInPaise,
      currency,
      description,
      reference_id: referenceId,
      customer: {
        name: customer.name || undefined,
        email: customer.email || undefined,
        contact: customer.contact || undefined,
      },
      notify: { sms: false, email: false },
      reminder_enable: false,
      notes: { ...notes, referenceId },
      ...(callbackUrl ? { callback_url: callbackUrl, callback_method: 'get' } : {}),
    });

    return {
      paymentLinkId: link.id,
      shortUrl: link.short_url,
      status: link.status,
    };
  },

  /** Current state of a hosted link, for confirming without waiting on a webhook. */
  async fetchPaymentLink(paymentLinkId) {
    return getClient().paymentLink.fetch(paymentLinkId);
  },

  /**
   * Confirms a client-reported success. The signature proves Razorpay produced
   * this (order, payment) pair — the client cannot forge it without the secret.
   */
  verifyPaymentSignature({ orderId, paymentId, signature }) {
    if (!env.isRazorpayConfigured) return false;

    const expected = crypto
      .createHmac('sha256', env.RAZORPAY_KEY_SECRET)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    return signatureMatches(expected, signature);
  },

  /** Webhooks must be verified against the *raw* body, before any JSON parsing. */
  verifyWebhookSignature({ rawBody, signature }) {
    if (!env.RAZORPAY_WEBHOOK_SECRET) {
      logger.warn('Razorpay webhook received but RAZORPAY_WEBHOOK_SECRET is not set');
      return false;
    }

    const expected = crypto
      .createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET)
      .update(rawBody)
      .digest('hex');

    return signatureMatches(expected, signature);
  },

  async fetchPayment(paymentId) {
    return getClient().payments.fetch(paymentId);
  },

  async fetchOrder(orderId) {
    return getClient().orders.fetch(orderId);
  },

  async fetchOrderPayments(orderId) {
    return getClient().orders.fetchPayments(orderId);
  },

  async capturePayment({ paymentId, amountInPaise, currency = 'INR' }) {
    return getClient().payments.capture(paymentId, amountInPaise, currency);
  },

  async refundPayment({ paymentId, amountInPaise, notes = {} }) {
    return getClient().payments.refund(paymentId, {
      amount: amountInPaise,
      notes,
    });
  },
};
