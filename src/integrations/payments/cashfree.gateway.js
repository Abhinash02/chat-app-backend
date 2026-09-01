import crypto from 'node:crypto';

import { env } from '#src/config/env.js';
import { logger } from '#src/config/logger.js';
import { PAYMENT_PROVIDER } from '#src/integrations/payments/payment.gateway.js';

function getBaseUrl() {
  const isProd =
    env.CASHFREE_ENV?.toUpperCase() === 'PROD' || env.CASHFREE_ENV?.toLowerCase() === 'production';
  return isProd ? 'https://api.cashfree.com/pg' : 'https://sandbox.cashfree.com/pg';
}

function getHeaders() {
  return {
    'x-client-id': env.CASHFREE_APP_ID,
    'x-client-secret': env.CASHFREE_SECRET_KEY,
    'x-api-version': env.CASHFREE_API_VERSION || '2023-08-01',
    'Content-Type': 'application/json',
  };
}

export const cashfreeGateway = {
  name: PAYMENT_PROVIDER.CASHFREE,

  get isConfigured() {
    return env.isCashfreeConfigured;
  },

  get environment() {
    const isProd =
      env.CASHFREE_ENV?.toUpperCase() === 'PROD' || env.CASHFREE_ENV?.toLowerCase() === 'production';
    return isProd ? 'production' : 'sandbox';
  },

  /**
   * Creates a payment order on Cashfree Payment Gateway.
   */
  async createOrder({ orderId, amountInRupees, customer = {}, returnUrl, orderNote }) {
    if (!env.isCashfreeConfigured) {
      throw new Error('Cashfree is not configured (CASHFREE_APP_ID / CASHFREE_SECRET_KEY missing)');
    }

    const payload = {
      order_id: String(orderId),
      order_amount: Number(Number(amountInRupees).toFixed(2)),
      order_currency: 'INR',
      customer_details: {
        customer_id: String(customer.id || 'cust_' + Date.now()).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50),
        customer_phone:
          customer.phone && String(customer.phone).replace(/\D/g, '').length >= 10
            ? String(customer.phone).replace(/\D/g, '').slice(-10)
            : '9876543210',
        customer_email: customer.email || 'user@vibechat.app',
        customer_name: customer.name || 'Vibe User',
      },
      order_meta: {
        return_url: returnUrl || `${env.publicApiUrl}/api/v1/payments/cashfree/return?order_id={order_id}`,
      },
      order_note: orderNote || 'Coins Recharge on Vibe Chat',
    };

    logger.info({ orderId, amount: payload.order_amount }, 'Creating Cashfree payment order');

    const res = await fetch(`${getBaseUrl()}/orders`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    if (!res.ok) {
      logger.error({ status: res.status, data }, 'Cashfree order creation failed');
      throw new Error(data.message || `Cashfree Error: ${res.statusText}`);
    }

    return {
      provider: PAYMENT_PROVIDER.CASHFREE,
      providerOrderId: data.order_id,
      cfOrderId: data.cf_order_id,
      paymentSessionId: data.payment_session_id,
      orderStatus: data.order_status,
      amountInRupees: data.order_amount,
      environment: this.environment,
    };
  },

  /**
   * Fetches order details and payment verification from Cashfree.
   */
  async fetchOrder(orderId) {
    if (!env.isCashfreeConfigured) {
      throw new Error('Cashfree is not configured');
    }

    const res = await fetch(`${getBaseUrl()}/orders/${orderId}`, {
      method: 'GET',
      headers: getHeaders(),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || 'Failed to fetch Cashfree order');
    }

    return data;
  },

  /**
   * Fetches payment attempts for an order.
   */
  async fetchOrderPayments(orderId) {
    const res = await fetch(`${getBaseUrl()}/orders/${orderId}/payments`, {
      method: 'GET',
      headers: getHeaders(),
    });

    const data = await res.json();
    if (!res.ok) return [];
    return Array.isArray(data) ? data : [];
  },

  /**
   * Verifies Cashfree webhook signature using timestamp and raw payload.
   */
  verifyWebhookSignature({ timestamp, rawBody, signature }) {
    if (!env.CASHFREE_SECRET_KEY || !signature) return false;

    try {
      const dataToSign = `${timestamp}${rawBody}`;
      const expected = crypto
        .createHmac('sha256', env.CASHFREE_SECRET_KEY)
        .update(dataToSign)
        .digest('base64');

      return expected === signature;
    } catch {
      return false;
    }
  },
};
