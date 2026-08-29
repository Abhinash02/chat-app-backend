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
import { PAYMENT_PROVIDER } from '#src/integrations/payments/payment.gateway.js';
import { coinsService } from '#src/modules/coins/coins.service.js';
import { settingsService } from '#src/modules/settings/settings.service.js';
import { userRepository } from '#src/modules/users/user.repository.js';
import { paymentRepository } from '#src/modules/payments/payment.repository.js';
import { ORDER_EXPIRY_MINUTES, PAYMENT_STATUS } from '#src/modules/payments/payment.constants.js';

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
    creditedAt: order.creditedAt,
    rejectionReason: order.rejectionReason,
    createdAt: order.createdAt,
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
      'manualProof.utr': utr,
      'manualProof.note': note ?? '',
    },
  });

  logger.info({ orderId: String(order._id) }, 'Manual UPI proof submitted');
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
  return toOrderDto(updated);
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
      razorpay: settings.payments.razorpayEnabled && razorpayGateway.isConfigured,
      manualUpi: settings.payments.manualUpiEnabled && Boolean(settings.payments.upiId),
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
  createRazorpayOrder,
  verifyRazorpayPayment,
  handleRazorpayWebhook,
  createManualUpiOrder,
  submitManualPaymentProof,
  approveManualPayment,
  rejectManualPayment,
  listMyOrders,
  listOrdersForAdmin,
  getPaymentOptions,
};
