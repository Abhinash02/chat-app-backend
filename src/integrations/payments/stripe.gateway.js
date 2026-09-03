import Stripe from 'stripe';

import { env } from '#src/config/env.js';
import { logger } from '#src/config/logger.js';
import { PAYMENT_PROVIDER } from '#src/integrations/payments/payment.gateway.js';

let stripeClient = null;

function getClient() {
  if (stripeClient) return stripeClient;

  if (!env.isStripeConfigured) {
    throw new Error('Stripe is not configured (STRIPE_SECRET_KEY missing)');
  }

  stripeClient = new Stripe(env.STRIPE_SECRET_KEY, {
    apiVersion: '2024-11-20.acacia',
  });
  return stripeClient;
}

export const stripeGateway = {
  name: PAYMENT_PROVIDER.STRIPE,

  get isConfigured() {
    return env.isStripeConfigured;
  },

  get publishableKey() {
    return env.STRIPE_PUBLISHABLE_KEY;
  },

  /**
   * Creates a Stripe Checkout Session for buying coins.
   */
  async createCheckoutSession({
    amountInPaise,
    currency = 'inr',
    orderId,
    packageName,
    userEmail,
    returnUrl,
  }) {
    const client = getClient();
    const origin = env.publicApiUrl || 'http://localhost:5000';
    const finalReturnUrl = returnUrl || `${origin}/api/v1/payments/stripe/return?order_id=${orderId}`;

    const session = await client.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: currency.toLowerCase(),
            product_data: {
              name: packageName || 'Coin Package',
              description: 'Vibe Chat Virtual Coins',
            },
            unit_amount: amountInPaise,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      customer_email: userEmail || undefined,
      client_reference_id: String(orderId),
      metadata: {
        orderId: String(orderId),
      },
      success_url: `${finalReturnUrl}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${finalReturnUrl}&cancelled=true`,
    });

    return {
      providerOrderId: session.id,
      paymentUrl: session.url,
      amountInPaise,
      currency: session.currency,
      provider: PAYMENT_PROVIDER.STRIPE,
    };
  },

  /**
   * Retrieves session status from Stripe to verify payment completion.
   */
  async retrieveSession(sessionId) {
    const client = getClient();
    return client.checkout.sessions.retrieve(sessionId);
  },

  /**
   * Refunds a charge or payment intent.
   */
  async refundPayment({ paymentIntentId, amountInPaise }) {
    const client = getClient();
    return client.refunds.create({
      payment_intent: paymentIntentId,
      amount: amountInPaise,
    });
  },
};
