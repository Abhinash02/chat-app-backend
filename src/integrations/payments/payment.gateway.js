/**
 * Application-facing payment contract.
 *
 * Business code depends on this shape only, so Razorpay can be replaced (or run
 * alongside another provider) without touching the coins or orders logic.
 *
 * @typedef {object} CreateOrderInput
 * @property {number} amountInPaise
 * @property {string} currency
 * @property {string} receipt          Our own order id, echoed back by the provider.
 * @property {Record<string, string>} notes
 *
 * @typedef {object} CreateOrderResult
 * @property {string} providerOrderId
 * @property {number} amountInPaise
 * @property {string} currency
 * @property {string} provider
 *
 * @typedef {object} PaymentGateway
 * @property {string} name
 * @property {boolean} isConfigured
 * @property {(input: CreateOrderInput) => Promise<CreateOrderResult>} createOrder
 * @property {(input: {orderId: string, paymentId: string, signature: string}) => boolean} verifyPaymentSignature
 * @property {(input: {rawBody: Buffer|string, signature: string}) => boolean} verifyWebhookSignature
 * @property {(paymentId: string) => Promise<object>} fetchPayment
 */

export const PAYMENT_PROVIDER = Object.freeze({
  RAZORPAY: 'razorpay',
  CASHFREE: 'cashfree',
  STRIPE: 'stripe',
  MANUAL_UPI: 'manual_upi',
});
