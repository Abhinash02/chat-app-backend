import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from '#src/common/errors/index.js';
import { buildPaginationMeta, resolvePagination } from '#src/common/utils/pagination.util.js';
import { addMinutes } from '#src/common/utils/date.util.js';
import { logger } from '#src/config/logger.js';
import { env } from '#src/config/env.js';
import { razorpayGateway } from '#src/integrations/payments/razorpay.gateway.js';
import { cashfreeGateway } from '#src/integrations/payments/cashfree.gateway.js';
import { PAYMENT_PROVIDER } from '#src/integrations/payments/payment.gateway.js';
import { coinsService } from '#src/modules/coins/coins.service.js';
import { settingsService } from '#src/modules/settings/settings.service.js';
import { userRepository } from '#src/modules/users/user.repository.js';
import { paymentRepository } from '#src/modules/payments/payment.repository.js';
import { ORDER_EXPIRY_MINUTES, PAYMENT_STATUS } from '#src/modules/payments/payment.constants.js';
import { emitToAdmin } from '#src/realtime/emitter.js';
import { SOCKET_EVENT } from '#src/realtime/events.js';
import { notificationService } from '#src/modules/notifications/notification.service.js';
import { generateAndSaveOrderInvoicePdf } from '#src/modules/payments/invoice-pdf.service.js';

function toOrderDto(order) {
  return {
    id: String(order._id),
    packageName: order.packageName,
    amountInPaise: order.amountInPaise,
    amountInRupees: order.amountInPaise / 100,
    currency: order.currency,
    coins: order.coins,
    bonusCoins: order.bonusCoins,
    totalCoins: order.coins + order.bonusCoins,
    provider: order.provider,
    status: order.status,
    providerOrderId: order.providerOrderId,
    providerPaymentId: order.providerPaymentId,
    providerRefundId: order.providerRefundId,
    creditedAt: order.creditedAt,
    rejectionReason: order.rejectionReason,
    refundReason: order.refundReason,
    refundedAt: order.refundedAt,
    createdAt: order.createdAt,
    invoiceUrl: order.invoiceUrl || null,
  };
}

/**
 * Builds a UPI deep link. Any UPI app (GPay, PhonePe, Paytm) opens this, and it
 * is also what the displayed QR encodes — one payload, three payment routes.
 */
function buildUpiIntent({ upiId, payeeName, amountInPaise, orderId, currency }) {
  const params = new URLSearchParams({
    pa: upiId,
    pn: payeeName,
    am: (amountInPaise / 100).toFixed(2),
    cu: currency,
    tn: `Coins order ${orderId}`,
  });

  return `upi://pay?${params.toString()}`;
}

async function snapshotPackage(packageId) {
  const coinPackage = await coinsService.getPurchasablePackage(packageId);

  return {
    packageId: coinPackage._id,
    packageName: coinPackage.name,
    amountInPaise: coinPackage.priceInPaise,
    currency: coinPackage.currency ?? 'INR',
    coins: coinPackage.coins,
    bonusCoins: coinPackage.bonusCoins ?? 0,
  };
}

/** Credits an order's coins once and only once. */
async function creditOrder(order) {
  const user = await userRepository.findById(order.userId);
  if (!user) {
    logger.error({ orderId: String(order._id) }, 'Paid order has no owning account');
    return null;
  }

  const { snapshot, alreadyCredited } = await coinsService.creditPurchase({
    userId: order.userId,
    gender: user.gender,
    coins: order.coins + order.bonusCoins,
    orderId: String(order._id),
    metadata: {
      provider: order.provider,
      packageName: order.packageName,
      amountInPaise: order.amountInPaise,
    },
  });

  logger.info(
    { orderId: String(order._id), coins: order.coins + order.bonusCoins, alreadyCredited },
    'Coin purchase credited',
  );

  // Send push notification to user
  notificationService
    .sendToUser({
      userId: order.userId,
      title: '🎉 Coins Added!',
      body: `Your recharge for ${order.packageName || 'Coins'} succeeded! +${order.coins + order.bonusCoins} coins added.`,
      data: { type: 'coins', orderId: String(order._id) },
    })
    .catch((err) => logger.warn({ err }, 'Payment success push notification failed'));

  // Generate & save PDF invoice to Cloudinary / DB in the background
  generateAndSaveOrderInvoicePdf(order._id).catch((err) => {
    logger.warn({ err: err?.message, orderId: String(order._id) }, 'Background invoice PDF generation failed');
  });

  return snapshot;
}

export async function createRazorpayOrder({ user, packageId }) {
  const settings = await settingsService.getSettings();

  if (!settings.payments.razorpayEnabled) {
    throw new ForbiddenError('Card and UPI checkout is currently unavailable', 'RAZORPAY_DISABLED');
  }

  if (!razorpayGateway.isConfigured) {
    throw new ForbiddenError('Online payment is not configured yet', 'RAZORPAY_NOT_CONFIGURED');
  }

  const snapshot = await snapshotPackage(packageId);

  const order = await paymentRepository.create({
    userId: user.id,
    ...snapshot,
    provider: PAYMENT_PROVIDER.RAZORPAY,
    status: PAYMENT_STATUS.CREATED,
    expiresAt: addMinutes(new Date(), ORDER_EXPIRY_MINUTES),
  });

  try {
    const providerOrder = await razorpayGateway.createOrder({
      amountInPaise: snapshot.amountInPaise,
      currency: snapshot.currency,
      receipt: String(order._id),
      notes: { userId: String(user.id), packageId: String(packageId) },
    });

    const updated = await paymentRepository.updateById(order._id, {
      $set: { providerOrderId: providerOrder.providerOrderId },
    });

    return {
      order: toOrderDto(updated),
      checkout: {
        provider: PAYMENT_PROVIDER.RAZORPAY,
        // The public key id is safe to hand to the app; the secret never leaves the server.
        keyId: env.RAZORPAY_KEY_ID,
        providerOrderId: providerOrder.providerOrderId,
        amountInPaise: providerOrder.amountInPaise,
        currency: providerOrder.currency,
        name: settings.payments.upiPayeeName || 'Coins',
        description: snapshot.packageName,
        prefill: { email: user.email, name: user.name },
      },
    };
  } catch (error) {
    await paymentRepository.updateById(order._id, {
      $set: { status: PAYMENT_STATUS.FAILED, failureReason: 'PROVIDER_ORDER_FAILED' },
    });

    logger.error({ err: error, orderId: String(order._id) }, 'Razorpay order creation failed');
    throw new BadRequestError('Could not start the payment. Please try again.', 'PAYMENT_INIT_FAILED');
  }
}

/**
 * Confirms a checkout the app reports as successful. The signature is what makes
 * this trustworthy — without it, a client could simply claim it paid.
 */
export async function verifyRazorpayPayment({ user, orderId, razorpayPaymentId, razorpaySignature }) {
  const order = await paymentRepository.findById(orderId);
  if (!order) throw new NotFoundError('Order not found', 'ORDER_NOT_FOUND');

  if (String(order.userId) !== String(user.id)) {
    throw new ForbiddenError('This order is not yours', 'NOT_ORDER_OWNER');
  }

  if (order.creditedAt) {
    return { order: toOrderDto(order), wallet: null, alreadyCredited: true };
  }

  const signatureValid = razorpayGateway.verifyPaymentSignature({
    orderId: order.providerOrderId,
    paymentId: razorpayPaymentId,
    signature: razorpaySignature,
  });

  if (!signatureValid) {
    await paymentRepository.updateById(order._id, {
      $set: { status: PAYMENT_STATUS.FAILED, failureReason: 'SIGNATURE_MISMATCH' },
    });

    logger.warn({ orderId: String(order._id), userId: user.id }, 'Rejected payment with invalid signature');
    throw new UnauthorizedError('We could not verify this payment', 'PAYMENT_SIGNATURE_INVALID');
  }

  const paid = await paymentRepository.markPaidOnce({
    orderId: order._id,
    providerPaymentId: razorpayPaymentId,
    providerSignature: razorpaySignature,
  });

  if (!paid) {
    // The webhook got here first; the coins are already in the wallet.
    const current = await paymentRepository.findById(order._id);
    return { order: toOrderDto(current), wallet: null, alreadyCredited: true };
  }

  const wallet = await creditOrder(paid);
  return { order: toOrderDto(paid), wallet, alreadyCredited: false };
}

/**
 * Server-to-server confirmation. This is the authoritative path: it still
 * credits the order when the app is killed before its callback runs.
 */
export async function handleRazorpayWebhook({ rawBody, signature }) {
  if (!razorpayGateway.verifyWebhookSignature({ rawBody, signature })) {
    throw new UnauthorizedError('Invalid webhook signature', 'WEBHOOK_SIGNATURE_INVALID');
  }

  const event = JSON.parse(rawBody.toString('utf8'));
  const eventType = event?.event;

  if (eventType !== 'payment.captured' && eventType !== 'order.paid') {
    logger.debug({ eventType }, 'Ignoring unhandled Razorpay event');
    return { handled: false, eventType };
  }

  const payment = event?.payload?.payment?.entity;
  const providerOrderId = payment?.order_id ?? event?.payload?.order?.entity?.id;

  if (!providerOrderId) {
    logger.warn({ eventType }, 'Razorpay event carried no order id');
    return { handled: false, eventType };
  }

  const order = await paymentRepository.findByProviderOrderId(providerOrderId);
  if (!order) {
    logger.warn({ providerOrderId }, 'Webhook for an unknown order');
    return { handled: false, eventType };
  }

  if (order.creditedAt) return { handled: true, eventType, alreadyCredited: true };

  const paid = await paymentRepository.markPaidOnce({
    orderId: order._id,
    providerPaymentId: payment?.id ?? null,
    providerSignature: null,
  });

  if (!paid) return { handled: true, eventType, alreadyCredited: true };

  await creditOrder(paid);
  return { handled: true, eventType, alreadyCredited: false };
}

// ----- Cashfree Payment Gateway --------------------------------------------

export async function createCashfreeOrder({ user, packageId, returnUrl }) {
  if (!cashfreeGateway.isConfigured) {
    throw new ForbiddenError('Cashfree online payment is not configured yet', 'CASHFREE_NOT_CONFIGURED');
  }

  const snapshot = await snapshotPackage(packageId);

  const order = await paymentRepository.create({
    userId: user.id,
    ...snapshot,
    provider: PAYMENT_PROVIDER.CASHFREE,
    status: PAYMENT_STATUS.CREATED,
    expiresAt: addMinutes(new Date(), ORDER_EXPIRY_MINUTES),
  });

  try {
    const providerOrder = await cashfreeGateway.createOrder({
      orderId: String(order._id),
      amountInRupees: snapshot.amountInPaise / 100,
      customer: {
        id: String(user.id),
        email: user.email,
        name: user.name || user.nickname,
      },
      returnUrl,
      orderNote: `${snapshot.packageName} (${snapshot.coins + snapshot.bonusCoins} Coins)`,
    });

    const updated = await paymentRepository.updateById(order._id, {
      $set: {
        providerOrderId: providerOrder.providerOrderId,
        'metadata.paymentSessionId': providerOrder.paymentSessionId,
        'metadata.cfOrderId': providerOrder.cfOrderId,
      },
    });

    return {
      order: toOrderDto(updated),
      checkout: {
        provider: PAYMENT_PROVIDER.CASHFREE,
        paymentSessionId: providerOrder.paymentSessionId,
        orderId: providerOrder.providerOrderId,
        cfOrderId: providerOrder.cfOrderId,
        environment: providerOrder.environment,
        amountInRupees: snapshot.amountInPaise / 100,
        currency: snapshot.currency,
        packageName: snapshot.packageName,
      },
    };
  } catch (error) {
    await paymentRepository.updateById(order._id, {
      $set: { status: PAYMENT_STATUS.FAILED, failureReason: 'PROVIDER_ORDER_FAILED' },
    });
    logger.error({ err: error, orderId: String(order._id) }, 'Cashfree order creation failed');
    throw new BadRequestError(error.message || 'Could not initiate Cashfree payment', 'PAYMENT_INIT_FAILED');
  }
}

export async function verifyCashfreePayment({ user, orderId }) {
  const order = await paymentRepository.findById(orderId);
  if (!order) throw new NotFoundError('Order not found', 'ORDER_NOT_FOUND');

  if (String(order.userId) !== String(user.id)) {
    throw new ForbiddenError('This order is not yours', 'NOT_ORDER_OWNER');
  }

  if (order.creditedAt) {
    return { order: toOrderDto(order), wallet: null, alreadyCredited: true };
  }

  const cfOrder = await cashfreeGateway.fetchOrder(order.providerOrderId || orderId);

  if (cfOrder.order_status === 'PAID') {
    const paid = await paymentRepository.markPaidOnce({
      orderId: order._id,
      providerPaymentId: String(cfOrder.cf_order_id || orderId),
      providerSignature: 'cashfree_verified',
    });

    if (paid) {
      const wallet = await creditOrder(paid);
      return { order: toOrderDto(paid), wallet, alreadyCredited: false };
    }
  }

  const current = await paymentRepository.findById(order._id);
  return {
    order: toOrderDto(current),
    wallet: null,
    alreadyCredited: Boolean(current.creditedAt),
    status: current.status,
    cashfreeStatus: cfOrder.order_status,
  };
}

export async function handleCashfreeWebhook({ rawBody, signature, timestamp }) {
  const isValid = cashfreeGateway.verifyWebhookSignature({ rawBody, signature, timestamp });
  if (!isValid) {
    logger.warn('Rejected Cashfree webhook with invalid signature');
    throw new UnauthorizedError('Invalid webhook signature', 'WEBHOOK_SIGNATURE_INVALID');
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    throw new BadRequestError('Invalid webhook payload', 'WEBHOOK_PAYLOAD_INVALID');
  }

  const orderId = event.data?.order?.order_id;
  const paymentStatus = event.data?.payment?.payment_status || event.data?.order?.order_status;

  if (!orderId) return { handled: true, ignored: true };

  const order = await paymentRepository.findById(orderId);
  if (!order) {
    logger.warn({ orderId }, 'Cashfree webhook received for unknown order');
    return { handled: true, unknownOrder: true };
  }

  if (paymentStatus === 'SUCCESS' || paymentStatus === 'PAID') {
    const paid = await paymentRepository.markPaidOnce({
      orderId: order._id,
      providerPaymentId: String(event.data?.payment?.cf_payment_id || orderId),
      providerSignature: signature,
    });

    if (paid) {
      await creditOrder(paid);
      return { handled: true, paid: true };
    }
  }

  return { handled: true };
}

export async function handleCashfreeReturn({ orderId }) {
  if (!orderId) {
    return { status: 'unknown', order: null };
  }

  const order = await paymentRepository.findById(orderId);
  if (!order) {
    return { status: 'unknown', order: null };
  }

  if (order.creditedAt) {
    return { status: 'already_paid', order: toOrderDto(order) };
  }

  try {
    const cfOrder = await cashfreeGateway.fetchOrder(order.providerOrderId || orderId);
    if (cfOrder.order_status === 'PAID') {
      const paid = await paymentRepository.markPaidOnce({
        orderId: order._id,
        providerPaymentId: String(cfOrder.cf_order_id || orderId),
        providerSignature: 'cashfree_return_verified',
      });

      if (paid) {
        await creditOrder(paid);
        return { status: 'paid', order: toOrderDto(paid) };
      }
    }
  } catch (err) {
    logger.error({ err, orderId }, 'Failed to verify Cashfree return');
  }

  const current = await paymentRepository.findById(order._id);
  return { status: current.status, order: toOrderDto(current) };
}

export async function getOrderInvoiceHtml({ user, orderId }) {
  const order = await paymentRepository.findById(orderId);
  if (!order) throw new NotFoundError('Order not found', 'ORDER_NOT_FOUND');

  if (user.role !== 'admin' && String(order.userId) !== String(user.id)) {
    throw new ForbiddenError('You can only download invoices for your own orders', 'FORBIDDEN');
  }

  const orderUser = await userRepository.findById(order.userId);
  const settings = await settingsService.getSettings();

  const formattedDate = new Date(order.createdAt).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const amountInRupees = (order.amountInPaise / 100).toFixed(2);
  const coinsCredited = order.coins + (order.bonusCoins || 0);
  const isPaid = order.status === 'paid';
  const cashfreeTxnId = order.providerPaymentId || order.providerOrderId || order._id;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Tax Invoice - ${order._id}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
    body { background: #F8FAFC; color: #1E293B; padding: 40px 20px; }
    .invoice-card { max-width: 680px; margin: 0 auto; background: #FFFFFF; border-radius: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.06); border: 1px solid #E2E8F0; overflow: hidden; }
    .header { background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%); padding: 32px 36px; color: #FFFFFF; display: flex; justify-content: space-between; align-items: flex-start; }
    .brand h1 { font-size: 24px; font-weight: 800; letter-spacing: -0.5px; }
    .brand p { font-size: 13px; opacity: 0.85; margin-top: 4px; }
    .invoice-title { text-align: right; }
    .invoice-title h2 { font-size: 20px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; }
    .invoice-title p { font-size: 12px; opacity: 0.85; margin-top: 4px; }
    .content { padding: 32px 36px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 28px; }
    .meta-box h3 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.8px; color: #64748B; margin-bottom: 6px; font-weight: 700; }
    .meta-box p { font-size: 14px; font-weight: 600; color: #0F172A; }
    .meta-box .sub { font-size: 12px; color: #64748B; font-weight: normal; margin-top: 2px; }
    .badge { display: inline-block; padding: 4px 10px; border-radius: 999px; font-size: 11px; font-weight: 700; text-transform: uppercase; margin-top: 4px; }
    .badge-paid { background: #DCFCE7; color: #15803D; }
    .badge-pending { background: #FEF3C7; color: #B45309; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 28px; }
    th { background: #F1F5F9; text-align: left; padding: 12px 16px; font-size: 12px; font-weight: 700; text-transform: uppercase; color: #475569; }
    td { padding: 14px 16px; border-bottom: 1px solid #E2E8F0; font-size: 14px; }
    .total-row { display: flex; justify-content: flex-end; margin-bottom: 28px; }
    .total-box { width: 260px; }
    .total-line { display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px; color: #64748B; }
    .grand-total { display: flex; justify-content: space-between; padding: 12px 0; border-top: 2px solid #E2E8F0; font-size: 16px; font-weight: 800; color: #0F172A; }
    .footer { padding: 24px 36px; background: #F8FAFC; border-top: 1px solid #E2E8F0; font-size: 12px; color: #64748B; text-align: center; line-height: 1.6; }
    .btn-print { display: inline-block; background: #4F46E5; color: white; padding: 10px 24px; border-radius: 8px; font-weight: 700; text-decoration: none; font-size: 13px; cursor: pointer; border: none; margin-bottom: 20px; }
    .print-bar { text-align: center; margin-bottom: 20px; }
    @media print {
      body { background: white; padding: 0; }
      .invoice-card { box-shadow: none; border: none; }
      .print-bar { display: none; }
    }
  </style>
</head>
<body>
  <div class="print-bar">
    <button class="btn-print" onclick="window.print()">📥 Print / Save as PDF</button>
  </div>
  <div class="invoice-card">
    <div class="header">
      <div class="brand">
        <h1>Vibe Chat</h1>
        <p>Premium Social & Real-time Chat</p>
      </div>
      <div class="invoice-title">
        <h2>Tax Invoice</h2>
        <p>Invoice #: INV-${String(order._id).slice(-8).toUpperCase()}</p>
        <span class="badge ${isPaid ? 'badge-paid' : 'badge-pending'}">${order.status}</span>
      </div>
    </div>

    <div class="content">
      <div class="grid">
        <div class="meta-box">
          <h3>Billed To</h3>
          <p>${orderUser?.name || orderUser?.nickname || 'Vibe User'}</p>
          <p class="sub">${orderUser?.email || 'user@vibechat.app'}</p>
          <p class="sub">User ID: ${order.userId}</p>
        </div>
        <div class="meta-box">
          <h3>Transaction Info</h3>
          <p>Date: ${formattedDate}</p>
          <p class="sub">Gateway: ${order.provider?.toUpperCase() || 'CASHFREE'}</p>
          <p class="sub" style="font-family: monospace;">Ref ID: ${cashfreeTxnId}</p>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Description</th>
            <th style="text-align: center;">Coins</th>
            <th style="text-align: right;">Amount (INR)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <strong>${order.packageName}</strong>
              <div style="font-size: 12px; color: #64748B;">In-app digital coin credits for messaging and gifts</div>
            </td>
            <td style="text-align: center; font-weight: 700; color: #D97706;">+${coinsCredited}</td>
            <td style="text-align: right; font-weight: 700;">₹${amountInRupees}</td>
          </tr>
        </tbody>
      </table>

      <div class="total-row">
        <div class="total-box">
          <div class="total-line">
            <span>Subtotal</span>
            <span>₹${amountInRupees}</span>
          </div>
          <div class="total-line">
            <span>Taxes (Included)</span>
            <span>₹0.00</span>
          </div>
          <div class="grand-total">
            <span>Total Paid</span>
            <span style="color: #4F46E5;">₹${amountInRupees}</span>
          </div>
        </div>
      </div>

      <div style="background: #F8FAFC; border: 1px dashed #CBD5E1; border-radius: 8px; padding: 12px 16px; font-size: 12px; color: #475569;">
        <strong>Payment Confirmation:</strong> This transaction was processed securely via Cashfree PG. Coins are permanently credited to your in-app wallet balance.
      </div>
    </div>

    <div class="footer">
      <p>Thank you for supporting Vibe Chat! ❤️</p>
      <p>For any billing inquiries, reach out to us at ${settings.payments.supportEmail || 'support@vibechat.app'}</p>
    </div>
  </div>
</body>
</html>
  `;
}

/**
 * Manual UPI: the user pays via QR / GPay / PhonePe and submits the reference.
 * Coins are credited only after an admin confirms the money arrived — nothing
 * here trusts the user's claim.
 */
export async function createManualUpiOrder({ user, packageId }) {
  const settings = await settingsService.getSettings();

  if (!settings.payments.manualUpiEnabled) {
    throw new ForbiddenError('UPI transfer is currently unavailable', 'MANUAL_UPI_DISABLED');
  }

  if (!settings.payments.upiId) {
    throw new ForbiddenError('UPI payment is not configured yet', 'UPI_NOT_CONFIGURED');
  }

  const snapshot = await snapshotPackage(packageId);

  const order = await paymentRepository.create({
    userId: user.id,
    ...snapshot,
    provider: PAYMENT_PROVIDER.MANUAL_UPI,
    status: PAYMENT_STATUS.CREATED,
    expiresAt: addMinutes(new Date(), ORDER_EXPIRY_MINUTES),
  });

  return {
    order: toOrderDto(order),
    upi: {
      upiId: settings.payments.upiId,
      payeeName: settings.payments.upiPayeeName,
      qrImageUrl: settings.payments.upiQrImageUrl,
      amountInRupees: snapshot.amountInPaise / 100,
      intentUrl: buildUpiIntent({
        upiId: settings.payments.upiId,
        payeeName: settings.payments.upiPayeeName,
        amountInPaise: snapshot.amountInPaise,
        orderId: String(order._id),
        currency: snapshot.currency,
      }),
      instructions:
        'Pay using any UPI app, then enter the 12-digit UTR reference below. Coins are added once we confirm the transfer.',
    },
  };
}

export async function submitManualPaymentProof({ user, orderId, utr, note }) {
  const order = await paymentRepository.findById(orderId);
  if (!order) throw new NotFoundError('Order not found', 'ORDER_NOT_FOUND');

  if (String(order.userId) !== String(user.id)) {
    throw new ForbiddenError('This order is not yours', 'NOT_ORDER_OWNER');
  }

  if (order.provider !== PAYMENT_PROVIDER.MANUAL_UPI) {
    throw new BadRequestError('This order is not a UPI transfer', 'NOT_MANUAL_ORDER');
  }

  if (order.status === PAYMENT_STATUS.PAID) {
    throw new ConflictError('This order is already paid', 'ORDER_ALREADY_PAID');
  }

  const updated = await paymentRepository.updateById(order._id, {
    $set: {
      status: PAYMENT_STATUS.AWAITING_VERIFICATION,
      ...(utr ? { 'manualProof.utr': utr } : {}),
      'manualProof.note': note ?? '',
    },
  });

  logger.info({ orderId: String(order._id) }, 'Manual UPI proof submitted');
  emitToAdmin(SOCKET_EVENT.ADMIN_PAYMENT_NEW, { orderId: String(order._id) });
  return toOrderDto(updated);
}

export async function approveManualPayment({ orderId, adminId }) {
  const order = await paymentRepository.findById(orderId);
  if (!order) throw new NotFoundError('Order not found', 'ORDER_NOT_FOUND');

  if (order.creditedAt) {
    return { order: toOrderDto(order), alreadyCredited: true };
  }

  const paid = await paymentRepository.markPaidOnce({ orderId: order._id });
  if (!paid) {
    const current = await paymentRepository.findById(order._id);
    return { order: toOrderDto(current), alreadyCredited: true };
  }

  await paymentRepository.updateById(paid._id, { $set: { verifiedByAdminId: adminId } });
  await creditOrder(paid);

  logger.info({ orderId: String(order._id), adminId }, 'Manual payment approved');
  emitToAdmin(SOCKET_EVENT.ADMIN_PAYMENT_UPDATED, { orderId: String(order._id), status: 'paid' });
  return { order: toOrderDto(paid), alreadyCredited: false };
}

export async function rejectManualPayment({ orderId, adminId, reason }) {
  const order = await paymentRepository.findById(orderId);
  if (!order) throw new NotFoundError('Order not found', 'ORDER_NOT_FOUND');

  if (order.creditedAt) {
    throw new ConflictError('This order was already credited', 'ORDER_ALREADY_CREDITED');
  }

  const updated = await paymentRepository.updateById(order._id, {
    $set: { status: PAYMENT_STATUS.REJECTED, rejectionReason: reason, verifiedByAdminId: adminId },
  });

  logger.info({ orderId: String(order._id), adminId }, 'Manual payment rejected');
  emitToAdmin(SOCKET_EVENT.ADMIN_PAYMENT_UPDATED, { orderId: String(order._id), status: 'rejected' });

  // Send push notification to user
  notificationService
    .sendToUser({
      userId: order.userId,
      title: '⚠️ Payment Proof Rejected',
      body: reason ? `Your UPI payment proof could not be verified: ${reason}` : 'Your UPI payment proof could not be verified.',
      data: { type: 'payment_rejected', orderId: String(order._id) },
    })
    .catch((err) => logger.warn({ err }, 'Payment rejection push notification failed'));

  return toOrderDto(updated);
}

export async function refundOrder({ orderId, adminId, reason }) {
  const order = await paymentRepository.findById(orderId);
  if (!order) throw new NotFoundError('Order not found', 'ORDER_NOT_FOUND');

  if (order.status === PAYMENT_STATUS.REFUNDED) {
    throw new ConflictError('This order has already been refunded', 'ORDER_ALREADY_REFUNDED');
  }

  if (order.status !== PAYMENT_STATUS.PAID) {
    throw new BadRequestError('Only paid orders can be refunded', 'ORDER_NOT_PAID');
  }

  let providerRefundId = null;
  // If Razorpay, trigger gateway refund
  if (order.provider === PAYMENT_PROVIDER.RAZORPAY && order.providerPaymentId && razorpayGateway.isConfigured) {
    try {
      const refundResult = await razorpayGateway.refundPayment({
        paymentId: order.providerPaymentId,
        amountInPaise: order.amountInPaise,
        notes: { reason: reason || 'Admin initiated refund', orderId: String(order._id) },
      });
      providerRefundId = refundResult?.id ?? null;
      logger.info({ orderId: String(order._id), providerRefundId }, 'Razorpay refund issued');
    } catch (err) {
      logger.error({ err, orderId: String(order._id) }, 'Razorpay refund API call failed');
      throw new BadRequestError(err?.message || 'Razorpay refund failed', 'RAZORPAY_REFUND_FAILED');
    }
  }

  // Deduct/reverse the coins from user wallet if credited
  if (order.creditedAt) {
    try {
      const user = await userRepository.findById(order.userId);
      if (user) {
        await coinsService.adjustBalance({
          userId: order.userId,
          gender: user.gender,
          amount: -(order.coins + order.bonusCoins),
          reason: `Refund for Order #${order._id}: ${reason || 'Customer refund'}`,
          adminId,
        });
      }
    } catch (coinErr) {
      logger.warn({ coinErr, orderId: String(order._id) }, 'Failed to debit coins on refund');
    }
  }

  const updated = await paymentRepository.updateById(order._id, {
    $set: {
      status: PAYMENT_STATUS.REFUNDED,
      refundReason: reason || 'Admin refunded',
      refundedAt: new Date(),
      refundedByAdminId: adminId,
      providerRefundId,
    },
  });

  logger.info({ orderId: String(order._id), adminId }, 'Order marked as refunded');
  emitToAdmin(SOCKET_EVENT.ADMIN_PAYMENT_UPDATED, { orderId: String(order._id), status: 'refunded' });
  return toOrderDto(updated);
}

import { RedeemCodeModel } from './redeem-code.model.js';
import { UserModel } from '#src/modules/users/user.model.js';
import { getPushProvider, PUSH_CHANNEL } from '#src/integrations/push/index.js';
import { notificationRepository } from '#src/modules/notifications/notification.repository.js';
import { emailService } from '#src/integrations/email/email.service.js';

export async function createRedeemCode({
  code,
  description,
  rewardType = 'free_coins',
  coins = 0,
  discountPercent = 0,
  discountAmountInRupees = 0,
  targetType = 'all',
  targetUserId = null,
  targetUserEmail = null,
  maxUsesTotal = 1000,
  maxUsesPerUser = 1,
  expiresAt = null,
  adminId = null,
  sendPush = true,
  sendEmail = true,
}) {
  if (!code) throw new BadRequestError('Code is required', 'CODE_REQUIRED');

  const normalizedCode = code.trim().toUpperCase();
  const existing = await RedeemCodeModel.findOne({ code: normalizedCode });
  if (existing) throw new ConflictError('A redeem code with this name already exists', 'CODE_EXISTS');

  let resolvedUserId = targetUserId;
  let resolvedUserEmail = targetUserEmail;

  if (targetType === 'single_user' && !resolvedUserId && resolvedUserEmail) {
    const user = await UserModel.findOne({ email: resolvedUserEmail.trim().toLowerCase() });
    if (!user) throw new NotFoundError('No user found with that email', 'USER_NOT_FOUND');
    resolvedUserId = user._id;
    resolvedUserEmail = user.email;
  }

  const redeemDoc = await RedeemCodeModel.create({
    code: normalizedCode,
    description: description?.trim() || '',
    rewardType,
    coins: Number(coins) || 0,
    discountPercent: Number(discountPercent) || 0,
    discountAmountInRupees: Number(discountAmountInRupees) || 0,
    targetType,
    targetUserId: resolvedUserId || null,
    targetUserEmail: resolvedUserEmail || null,
    maxUsesTotal: Number(maxUsesTotal) || 1000,
    maxUsesPerUser: Number(maxUsesPerUser) || 1,
    expiresAt: expiresAt ? new Date(expiresAt) : null,
    createdBy: adminId || null,
  });

  // Broadcast push & email to target users if requested
  if (sendPush || sendEmail) {
    (async () => {
      try {
        let userQuery = { status: 'active' };
        if (targetType === 'male') userQuery.gender = 'male';
        if (targetType === 'female') userQuery.gender = 'female';
        if (targetType === 'single_user' && resolvedUserId) userQuery = { _id: resolvedUserId };

        const targetUsers = await UserModel.find(userQuery).select('_id email name preferences');
        const userIds = targetUsers.map((u) => u._id);

        const promoTitle = `🎁 Special Promo Code: ${normalizedCode}`;
        const promoBody =
          rewardType === 'free_coins'
            ? `Use code ${normalizedCode} to get +${coins} free coins in your Coins Store!`
            : `Use coupon code ${normalizedCode} to get ${
                rewardType === 'discount_percent' ? `${discountPercent}% OFF` : `₹${discountAmountInRupees} OFF`
              } on coin packs!`;

        if (sendPush && userIds.length > 0) {
          const activeDevices = await notificationRepository.findActiveTokensForUsers(userIds);
          if (activeDevices.length > 0) {
            const pushProvider = getPushProvider();
            await pushProvider.send(
              activeDevices.map((d) => ({
                token: d.token,
                title: promoTitle,
                body: promoBody,
                data: { type: 'redeem', code: normalizedCode },
                channelId: PUSH_CHANNEL.PROMOTIONS,
              })),
            );
          }
        }

        if (sendEmail && targetUsers.length > 0) {
          const emailUsers = targetUsers.filter((u) => u.email && u.preferences?.marketingEmails !== false);
          for (const u of emailUsers) {
            emailService
              .sendRaw({
                to: u.email,
                subject: `🎁 Your Exclusive Promo Code: ${normalizedCode} on Vibe Chat`,
                html: `
                  <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #1E1B4B;">
                    <h1 style="color: #FF4E88; font-size: 24px;">🎁 Your Exclusive Promo Code</h1>
                    <p style="font-size: 16px; line-height: 1.6;">Hello ${u.name || 'there'},</p>
                    <p style="font-size: 16px; line-height: 1.6;">${promoBody}</p>
                    <div style="background: #FDF2F8; border: 2px dashed #FF4E88; padding: 16px 24px; text-align: center; border-radius: 12px; margin: 24px 0;">
                      <span style="font-family: monospace; font-size: 28px; font-weight: bold; letter-spacing: 2px; color: #FF4E88;">${normalizedCode}</span>
                    </div>
                    <p style="font-size: 14px; color: #64748B;">Open Vibe Chat ➔ Profile ➔ Get Coins ➔ Redeem Code to claim!</p>
                  </div>
                `,
              })
              .catch(() => undefined);
          }
        }
      } catch (broadcastErr) {
        logger.error({ err: broadcastErr }, 'Failed to broadcast redeem code');
      }
    })();
  }

  return redeemDoc;
}

export async function listRedeemCodesForAdmin({ page = 1, limit = 20, search }) {
  const query = {};
  if (search) {
    query.$or = [
      { code: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } },
      { targetUserEmail: { $regex: search, $options: 'i' } },
    ];
  }

  const skip = (Math.max(1, page) - 1) * limit;
  const [items, total] = await Promise.all([
    RedeemCodeModel.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
    RedeemCodeModel.countDocuments(query),
  ]);

  return {
    items,
    meta: {
      page: Number(page),
      limit: Number(limit),
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
}

export async function deleteRedeemCode(id) {
  const deleted = await RedeemCodeModel.findByIdAndDelete(id);
  if (!deleted) throw new NotFoundError('Redeem code not found', 'CODE_NOT_FOUND');
  return { deleted: true };
}

export async function validateCoupon({ code, user, packagePriceInRupees }) {
  if (!code) throw new BadRequestError('Enter a code to validate', 'EMPTY_CODE');

  const normalized = code.trim().toUpperCase();
  const redeemDoc = await RedeemCodeModel.findOne({ code: normalized, isActive: true });
  if (!redeemDoc) throw new NotFoundError('Invalid or expired coupon code', 'INVALID_CODE');

  if (redeemDoc.expiresAt && new Date(redeemDoc.expiresAt).getTime() < Date.now()) {
    throw new BadRequestError('This code has expired', 'CODE_EXPIRED');
  }

  if (redeemDoc.usedCount >= redeemDoc.maxUsesTotal) {
    throw new BadRequestError('This code has reached its maximum redemptions', 'CODE_MAX_USES_REACHED');
  }

  // Target checks
  if (redeemDoc.targetType === 'male' && user.gender !== 'male') {
    throw new ForbiddenError('This coupon is only valid for male accounts', 'GENDER_MISMATCH');
  }
  if (redeemDoc.targetType === 'female' && user.gender !== 'female') {
    throw new ForbiddenError('This coupon is only valid for female accounts', 'GENDER_MISMATCH');
  }
  if (redeemDoc.targetType === 'single_user' && String(redeemDoc.targetUserId) !== String(user.id)) {
    throw new ForbiddenError('This coupon is not assigned to your account', 'USER_NOT_ELIGIBLE');
  }

  const userUses = (redeemDoc.redemptions || []).filter((r) => String(r.userId) === String(user.id)).length;
  if (userUses >= redeemDoc.maxUsesPerUser) {
    throw new BadRequestError('You have already used this coupon code', 'ALREADY_USED');
  }

  let discountedPrice = packagePriceInRupees;
  let discountDescription = '';

  if (redeemDoc.rewardType === 'discount_percent') {
    discountedPrice = Math.max(1, Math.round(packagePriceInRupees * (1 - redeemDoc.discountPercent / 100)));
    discountDescription = `${redeemDoc.discountPercent}% OFF applied!`;
  } else if (redeemDoc.rewardType === 'discount_flat') {
    discountedPrice = Math.max(1, packagePriceInRupees - redeemDoc.discountAmountInRupees);
    discountDescription = `₹${redeemDoc.discountAmountInRupees} discount applied!`;
  } else if (redeemDoc.rewardType === 'free_coins') {
    discountDescription = `+${redeemDoc.coins} Free Coins Voucher`;
  }

  return {
    valid: true,
    code: redeemDoc.code,
    rewardType: redeemDoc.rewardType,
    discountPercent: redeemDoc.discountPercent,
    discountAmountInRupees: redeemDoc.discountAmountInRupees,
    freeCoins: redeemDoc.coins,
    originalPrice: packagePriceInRupees,
    discountedPrice,
    discountDescription,
  };
}

export async function redeemCode({ code, user }) {
  if (!code) throw new BadRequestError('Please enter a redeem code', 'EMPTY_CODE');

  const normalized = code.trim().toUpperCase();
  const redeemDoc = await RedeemCodeModel.findOne({ code: normalized, isActive: true });
  if (!redeemDoc) throw new NotFoundError('Invalid promo code. Please check and try again.', 'INVALID_CODE');

  if (redeemDoc.expiresAt && new Date(redeemDoc.expiresAt).getTime() < Date.now()) {
    throw new BadRequestError('This promo code has expired', 'CODE_EXPIRED');
  }

  if (redeemDoc.usedCount >= redeemDoc.maxUsesTotal) {
    throw new BadRequestError('This promo code has reached its maximum total redemptions', 'CODE_EXHAUSTED');
  }

  // Target checks
  if (redeemDoc.targetType === 'male' && user.gender !== 'male') {
    throw new ForbiddenError('This promo code is only valid for male accounts', 'GENDER_MISMATCH');
  }
  if (redeemDoc.targetType === 'female' && user.gender !== 'female') {
    throw new ForbiddenError('This promo code is only valid for female accounts', 'GENDER_MISMATCH');
  }
  if (redeemDoc.targetType === 'single_user' && String(redeemDoc.targetUserId) !== String(user.id)) {
    throw new ForbiddenError('This promo code is not assigned to your account', 'USER_NOT_ELIGIBLE');
  }

  const userUses = (redeemDoc.redemptions || []).filter((r) => String(r.userId) === String(user.id)).length;
  if (userUses >= redeemDoc.maxUsesPerUser) {
    throw new BadRequestError('You have already redeemed this code', 'ALREADY_REDEEMED');
  }

  if (redeemDoc.rewardType === 'free_coins') {
    const coinsToAdd = redeemDoc.coins;
    await coinsService.adjustBalance({
      userId: user.id,
      gender: user.gender,
      amount: coinsToAdd,
      reason: `Redeemed promo code ${redeemDoc.code}`,
    });

    await RedeemCodeModel.findByIdAndUpdate(redeemDoc._id, {
      $inc: { usedCount: 1 },
      $push: {
        redemptions: {
          userId: user.id,
          userEmail: user.email,
          userNickname: user.nickname,
          redeemedAt: new Date(),
          creditedCoins: coinsToAdd,
        },
      },
    });

    logger.info({ userId: user.id, code: redeemDoc.code, coinsToAdd }, 'Promo code redeemed for free coins');

    return {
      success: true,
      rewardType: 'free_coins',
      coinsCredited: coinsToAdd,
      message: `🎉 Success! +${coinsToAdd} free coins added to your wallet!`,
    };
  }

  // If discount voucher
  return {
    success: true,
    rewardType: redeemDoc.rewardType,
    discountPercent: redeemDoc.discountPercent,
    discountAmountInRupees: redeemDoc.discountAmountInRupees,
    message: `🏷️ Coupon applied: ${
      redeemDoc.rewardType === 'discount_percent'
        ? `${redeemDoc.discountPercent}% OFF`
        : `₹${redeemDoc.discountAmountInRupees} OFF`
    } on your next purchase!`,
  };
}

export async function listMyOrders({ userId, page, limit }) {
  const { skip, page: safePage, limit: safeLimit } = resolvePagination({ page, limit });
  const { items, total } = await paymentRepository.listByUser({ userId, skip, limit: safeLimit });

  return {
    items: items.map(toOrderDto),
    meta: buildPaginationMeta({ page: safePage, limit: safeLimit, total }),
  };
}

export async function listOrdersForAdmin({ status, page, limit }) {
  const { skip, page: safePage, limit: safeLimit } = resolvePagination({ page, limit });
  const filter = status ? { status } : {};
  const { items, total } = await paymentRepository.list({ filter, skip, limit: safeLimit });

  return {
    items: items.map((order) => ({
      ...toOrderDto(order),
      user: order.userId?.nickname
        ? {
            id: String(order.userId._id),
            nickname: order.userId.nickname,
            email: order.userId.email,
            gender: order.userId.gender,
          }
        : { id: String(order.userId) },
      manualProof: order.manualProof,
    })),
    meta: buildPaginationMeta({ page: safePage, limit: safeLimit, total }),
  };
}

export async function deleteOrder({ orderId }) {
  const order = await paymentRepository.findById(orderId);
  if (!order) throw new NotFoundError('Order not found', 'ORDER_NOT_FOUND');

  await paymentRepository.deleteById(orderId);
  logger.info({ orderId }, 'Admin deleted payment order');
  return { success: true };
}

export async function getPaymentOptions() {
  const settings = await settingsService.getSettings();
  const packages = await coinsService.listPackages();

  return {
    packages: packages.map((coinPackage) => ({
      id: String(coinPackage._id),
      name: coinPackage.name,
      description: coinPackage.description,
      priceInPaise: coinPackage.priceInPaise,
      priceInRupees: coinPackage.priceInPaise / 100,
      coins: coinPackage.coins,
      bonusCoins: coinPackage.bonusCoins,
      totalCoins: coinPackage.coins + coinPackage.bonusCoins,
      badge: coinPackage.badge,
      isPopular: coinPackage.isPopular,
    })),
    methods: {
      cashfree: cashfreeGateway.isConfigured,
      razorpay: settings.payments.razorpayEnabled && razorpayGateway.isConfigured,
      manualUpi: settings.payments.manualUpiEnabled && Boolean(settings.payments.upiId),
    },
    cashfree: {
      isConfigured: cashfreeGateway.isConfigured,
      appId: env.CASHFREE_APP_ID,
      environment: cashfreeGateway.environment,
    },
    upi: {
      upiId: settings.payments.upiId,
      payeeName: settings.payments.upiPayeeName,
      qrImageUrl: settings.payments.upiQrImageUrl,
    },
    supportEmail: settings.payments.supportEmail,
  };
}

export const paymentService = {
  createCashfreeOrder,
  verifyCashfreePayment,
  handleCashfreeWebhook,
  handleCashfreeReturn,
  createRazorpayOrder,
  verifyRazorpayPayment,
  handleRazorpayWebhook,
  createManualUpiOrder,
  submitManualPaymentProof,
  approveManualPayment,
  rejectManualPayment,
  refundOrder,
  listMyOrders,
  listOrdersForAdmin,
  deleteOrder,
  generateAndSaveOrderInvoicePdf,
  getOrderInvoiceHtml,
  getPaymentOptions,
  createRedeemCode,
  listRedeemCodesForAdmin,
  deleteRedeemCode,
  redeemCode,
  validateCoupon,
};
