import crypto from 'node:crypto';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GENDER, USER_ROLE } from '#src/common/constants/index.js';
import { PAYMENT_PROVIDER } from '#src/integrations/payments/payment.gateway.js';
import { razorpayGateway } from '#src/integrations/payments/razorpay.gateway.js';
import { coinPackageRepository } from '#src/modules/coins/coin-package.repository.js';
import { walletRepository } from '#src/modules/coins/wallet.repository.js';
import { coinTransactionRepository } from '#src/modules/coins/coin-transaction.repository.js';
import { COIN_TRANSACTION_TYPE } from '#src/modules/coins/coins.constants.js';
import { paymentRepository } from '#src/modules/payments/payment.repository.js';
import { paymentService } from '#src/modules/payments/payment.service.js';
import { PAYMENT_STATUS } from '#src/modules/payments/payment.constants.js';
import { applySettings, createUser, resetDatabase, toRequestUser } from '../helpers/factories.js';

const WEBHOOK_SECRET = 'test-webhook-secret';

async function seedPackage() {
  return coinPackageRepository.create({
    name: 'Popular',
    priceInPaise: 5000,
    coins: 60,
    bonusCoins: 0,
    isActive: true,
  });
}

/** Creates a manual UPI order that is ready for admin approval. */
async function createPendingOrder(user, coinPackage) {
  return paymentRepository.create({
    userId: user._id,
    packageId: coinPackage._id,
    packageName: coinPackage.name,
    amountInPaise: coinPackage.priceInPaise,
    currency: 'INR',
    coins: coinPackage.coins,
    bonusCoins: coinPackage.bonusCoins,
    provider: PAYMENT_PROVIDER.MANUAL_UPI,
    status: PAYMENT_STATUS.AWAITING_VERIFICATION,
  });
}

describe('payments', () => {
  beforeEach(async () => {
    await resetDatabase();
    vi.restoreAllMocks();
  });

  describe('manual UPI approval', () => {
    it('should credit the coins once an admin approves the transfer', async () => {
      const user = await createUser({ gender: GENDER.MALE });
      const admin = await createUser({ role: USER_ROLE.ADMIN });
      const coinPackage = await seedPackage();
      const order = await createPendingOrder(user, coinPackage);

      const result = await paymentService.approveManualPayment({
        orderId: order._id,
        adminId: admin._id,
      });

      expect(result.alreadyCredited).toBe(false);
      expect(result.order.status).toBe(PAYMENT_STATUS.PAID);

      const wallet = await walletRepository.findByUserId(user._id);
      expect(wallet.coinBalance).toBe(60);
      expect(wallet.totalPurchasedCoins).toBe(60);
    });

    it('should credit the bonus coins together with the paid coins', async () => {
      const user = await createUser({ gender: GENDER.MALE });
      const admin = await createUser({ role: USER_ROLE.ADMIN });
      const coinPackage = await coinPackageRepository.create({
        name: 'Plus',
        priceInPaise: 10000,
        coins: 125,
        bonusCoins: 15,
      });
      const order = await createPendingOrder(user, coinPackage);

      await paymentService.approveManualPayment({ orderId: order._id, adminId: admin._id });

      const wallet = await walletRepository.findByUserId(user._id);
      expect(wallet.coinBalance).toBe(140);
    });

    it('should not credit twice when approve is clicked again', async () => {
      const user = await createUser({ gender: GENDER.MALE });
      const admin = await createUser({ role: USER_ROLE.ADMIN });
      const coinPackage = await seedPackage();
      const order = await createPendingOrder(user, coinPackage);

      await paymentService.approveManualPayment({ orderId: order._id, adminId: admin._id });
      const second = await paymentService.approveManualPayment({
        orderId: order._id,
        adminId: admin._id,
      });

      expect(second.alreadyCredited).toBe(true);

      const wallet = await walletRepository.findByUserId(user._id);
      expect(wallet.coinBalance).toBe(60);

      const { items } = await coinTransactionRepository.listByUser({
        userId: user._id,
        type: COIN_TRANSACTION_TYPE.PURCHASE,
      });
      expect(items).toHaveLength(1);
    });

    it('should not credit twice when two admins approve at the same moment', async () => {
      const user = await createUser({ gender: GENDER.MALE });
      const admin = await createUser({ role: USER_ROLE.ADMIN });
      const coinPackage = await seedPackage();
      const order = await createPendingOrder(user, coinPackage);

      await Promise.all([
        paymentService.approveManualPayment({ orderId: order._id, adminId: admin._id }),
        paymentService.approveManualPayment({ orderId: order._id, adminId: admin._id }),
      ]);

      const wallet = await walletRepository.findByUserId(user._id);
      expect(wallet.coinBalance).toBe(60);
    });

    it('should refuse to reject an order whose coins were already credited', async () => {
      const user = await createUser({ gender: GENDER.MALE });
      const admin = await createUser({ role: USER_ROLE.ADMIN });
      const coinPackage = await seedPackage();
      const order = await createPendingOrder(user, coinPackage);

      await paymentService.approveManualPayment({ orderId: order._id, adminId: admin._id });

      await expect(
        paymentService.rejectManualPayment({
          orderId: order._id,
          adminId: admin._id,
          reason: 'No transfer found',
        }),
      ).rejects.toMatchObject({ code: 'ORDER_ALREADY_CREDITED' });
    });

    it('should leave the wallet untouched when an order is rejected', async () => {
      const user = await createUser({ gender: GENDER.MALE });
      const admin = await createUser({ role: USER_ROLE.ADMIN });
      const coinPackage = await seedPackage();
      const order = await createPendingOrder(user, coinPackage);

      await paymentService.rejectManualPayment({
        orderId: order._id,
        adminId: admin._id,
        reason: 'UTR does not match any transfer',
      });

      const wallet = await walletRepository.findByUserId(user._id);
      expect(wallet?.coinBalance ?? 0).toBe(0);
    });

    it('should snapshot the price so a later admin edit does not change the order', async () => {
      const user = await createUser({ gender: GENDER.MALE });
      const admin = await createUser({ role: USER_ROLE.ADMIN });
      const coinPackage = await seedPackage();
      const order = await createPendingOrder(user, coinPackage);

      // The pack becomes much more generous after the order was placed.
      await coinPackageRepository.updateById(coinPackage._id, { $set: { coins: 5000 } });

      await paymentService.approveManualPayment({ orderId: order._id, adminId: admin._id });

      const wallet = await walletRepository.findByUserId(user._id);
      expect(wallet.coinBalance).toBe(60);
    });

    it('should require a UPI id to be configured before offering a transfer', async () => {
      const user = await createUser({ gender: GENDER.MALE });
      const coinPackage = await seedPackage();
      await applySettings({ payments: { manualUpiEnabled: true, upiId: '' } });

      await expect(
        paymentService.createManualUpiOrder({
          user: toRequestUser(user),
          packageId: coinPackage._id,
        }),
      ).rejects.toMatchObject({ code: 'UPI_NOT_CONFIGURED' });
    });

    it('should build a UPI intent link any payment app can open', async () => {
      const user = await createUser({ gender: GENDER.MALE });
      const coinPackage = await seedPackage();
      await applySettings({
        payments: { manualUpiEnabled: true, upiId: 'vibe@upi', upiPayeeName: 'Vibe Chat' },
      });

      const result = await paymentService.createManualUpiOrder({
        user: toRequestUser(user),
        packageId: coinPackage._id,
      });

      expect(result.upi.intentUrl).toContain('upi://pay?');
      expect(result.upi.intentUrl).toContain('pa=vibe%40upi');
      expect(result.upi.intentUrl).toContain('am=50.00');
    });
  });

  describe('Razorpay webhook', () => {
    function signWebhook(body) {
      return crypto.createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex');
    }

    function webhookBody(providerOrderId) {
      return Buffer.from(
        JSON.stringify({
          event: 'payment.captured',
          payload: {
            payment: { entity: { id: 'pay_test_123', order_id: providerOrderId } },
          },
        }),
      );
    }

    async function createRazorpayOrder(user, coinPackage, providerOrderId) {
      return paymentRepository.create({
        userId: user._id,
        packageId: coinPackage._id,
        packageName: coinPackage.name,
        amountInPaise: coinPackage.priceInPaise,
        currency: 'INR',
        coins: coinPackage.coins,
        bonusCoins: coinPackage.bonusCoins,
        provider: PAYMENT_PROVIDER.RAZORPAY,
        status: PAYMENT_STATUS.CREATED,
        providerOrderId,
      });
    }

    it('should credit coins on a correctly signed webhook', async () => {
      const user = await createUser({ gender: GENDER.MALE });
      const coinPackage = await seedPackage();
      await createRazorpayOrder(user, coinPackage, 'order_test_1');

      vi.spyOn(razorpayGateway, 'verifyWebhookSignature').mockReturnValue(true);

      const result = await paymentService.handleRazorpayWebhook({
        rawBody: webhookBody('order_test_1'),
        signature: 'ignored-because-verification-is-stubbed',
      });

      expect(result.handled).toBe(true);
      expect((await walletRepository.findByUserId(user._id)).coinBalance).toBe(60);
    });

    it('should reject a webhook whose signature does not match', async () => {
      const user = await createUser({ gender: GENDER.MALE });
      const coinPackage = await seedPackage();
      await createRazorpayOrder(user, coinPackage, 'order_test_2');

      vi.spyOn(razorpayGateway, 'verifyWebhookSignature').mockReturnValue(false);

      await expect(
        paymentService.handleRazorpayWebhook({
          rawBody: webhookBody('order_test_2'),
          signature: 'forged',
        }),
      ).rejects.toMatchObject({ code: 'WEBHOOK_SIGNATURE_INVALID' });

      expect((await walletRepository.findByUserId(user._id))?.coinBalance ?? 0).toBe(0);
    });

    it('should credit only once when the same webhook is replayed', async () => {
      const user = await createUser({ gender: GENDER.MALE });
      const coinPackage = await seedPackage();
      await createRazorpayOrder(user, coinPackage, 'order_test_3');

      vi.spyOn(razorpayGateway, 'verifyWebhookSignature').mockReturnValue(true);

      await paymentService.handleRazorpayWebhook({ rawBody: webhookBody('order_test_3'), signature: 'x' });
      const replay = await paymentService.handleRazorpayWebhook({
        rawBody: webhookBody('order_test_3'),
        signature: 'x',
      });

      expect(replay.alreadyCredited).toBe(true);
      expect((await walletRepository.findByUserId(user._id)).coinBalance).toBe(60);
    });

    it('should ignore an event type it does not handle', async () => {
      vi.spyOn(razorpayGateway, 'verifyWebhookSignature').mockReturnValue(true);

      const result = await paymentService.handleRazorpayWebhook({
        rawBody: Buffer.from(JSON.stringify({ event: 'payment.failed', payload: {} })),
        signature: 'x',
      });

      expect(result.handled).toBe(false);
    });

    it('should compute the signature over the exact raw bytes', () => {
      process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;
      const body = webhookBody('order_sig');

      // Proves the HMAC is over the untouched request body: re-serialising the
      // JSON would produce a different digest and fail verification.
      expect(signWebhook(body)).toBe(signWebhook(Buffer.from(body)));
      expect(signWebhook(body)).not.toBe(signWebhook(Buffer.from(`${body.toString()} `)));
    });
  });

  describe('payment options', () => {
    it('should report which payment methods are actually usable', async () => {
      await seedPackage();
      await applySettings({
        payments: { razorpayEnabled: true, manualUpiEnabled: true, upiId: 'vibe@upi' },
      });

      const options = await paymentService.getPaymentOptions();

      // Razorpay is reported as available only when configured with API keys
      expect(options.methods.razorpay).toBe(razorpayGateway.isConfigured);
      expect(options.methods.manualUpi).toBe(true);
      expect(options.packages[0]).toMatchObject({ priceInRupees: 50, totalCoins: 60 });
    });
  });
});
