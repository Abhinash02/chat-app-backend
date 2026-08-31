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
import { emitToAdmin } from '#src/realtime/emitter.js';
import { SOCKET_EVENT } from '#src/realtime/events.js';

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
  refundOrder,
  listMyOrders,
  listOrdersForAdmin,
  getPaymentOptions,
  createRedeemCode,
  listRedeemCodesForAdmin,
  deleteRedeemCode,
  redeemCode,
  validateCoupon,
};
