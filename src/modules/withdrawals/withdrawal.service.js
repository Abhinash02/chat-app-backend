import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
  PaymentRequiredError,
} from '#src/common/errors/index.js';
import { logger } from '#src/config/logger.js';
import { emitToUser } from '#src/realtime/emitter.js';
import { settingsService } from '#src/modules/settings/settings.service.js';
import { coinsService } from '#src/modules/coins/coins.service.js';
import { walletRepository } from '#src/modules/coins/wallet.repository.js';
import { COIN_TRANSACTION_TYPE } from '#src/modules/coins/coins.constants.js';
import { notificationService } from '#src/modules/notifications/notification.service.js';
import { cashfreePayoutGateway } from '#src/integrations/payments/cashfree-payout.gateway.js';
import { PAYOUT_METHOD, WITHDRAWAL_STATUS } from '#src/modules/withdrawals/withdrawal.constants.js';
import { withdrawalRepository } from '#src/modules/withdrawals/withdrawal.repository.js';

/**
 * Handles girl-to-rupee conversion and withdrawal request creation.
 */
export async function requestWithdrawal({ user, coins, payoutMethod, upiId, bankDetails }) {
  if (user.gender !== 'female') {
    throw new ForbiddenError('Coin conversion to rupees is only available for female accounts', 'FORBIDDEN_GENDER');
  }

  const settings = await settingsService.getSettings();
  const earnings = settings.earnings || {};

  if (earnings.enabled === false) {
    throw new BadRequestError('Coin conversion and withdrawals are currently disabled by admin', 'EARNINGS_DISABLED');
  }

  const minCoins = earnings.minWithdrawalCoins || 25;
  if (coins < minCoins) {
    throw new BadRequestError(`Minimum withdrawal is ${minCoins} coins`, 'MIN_WITHDRAWAL_NOT_MET');
  }

  const coinsPerRupee = earnings.coinsPerRupee || 25;
  const amountInRupees = Number((coins / coinsPerRupee).toFixed(2));
  const amountInPaise = Math.round(amountInRupees * 100);

  if (amountInRupees <= 0) {
    throw new BadRequestError('Invalid withdrawal conversion amount', 'INVALID_AMOUNT');
  }

  // Check user coin balance
  const wallet = await walletRepository.findByUserId(user.id);
  if (!wallet || wallet.coinBalance < coins) {
    throw new PaymentRequiredError(
      `You need at least ${coins} coins. Your current balance is ${wallet?.coinBalance || 0} coins.`,
      'INSUFFICIENT_COINS',
      { required: coins, available: wallet?.coinBalance || 0 },
    );
  }

  // Debit coins from wallet into escrow
  const { snapshot } = await coinsService.debitCoins({
    userId: user.id,
    gender: user.gender,
    amount: coins,
    type: COIN_TRANSACTION_TYPE.WITHDRAWAL,
    description: `Withdrawal request for ₹${amountInRupees} (${coins} coins)`,
    referenceId: `withdr_${Date.now()}`,
    metadata: { coins, amountInRupees, payoutMethod },
  });

  const withdrawal = await withdrawalRepository.create({
    userId: user.id,
    coins,
    amountInRupees,
    amountInPaise,
    coinsPerRupeeRate: coinsPerRupee,
    payoutMethod,
    upiId: payoutMethod === PAYOUT_METHOD.UPI ? upiId : null,
    bankDetails: payoutMethod === PAYOUT_METHOD.BANK_TRANSFER ? bankDetails : null,
    status: WITHDRAWAL_STATUS.PENDING,
  });

  logger.info(
    { userId: user.id, withdrawalId: withdrawal._id, coins, amountInRupees },
    'Female user submitted withdrawal conversion request',
  );

  return {
    withdrawal,
    wallet: snapshot,
    message: `Withdrawal request for ₹${amountInRupees} submitted! It will be credited once approved by admin.`,
  };
}

export async function getMyWithdrawals({ userId, page = 1, limit = 20 }) {
  return withdrawalRepository.findByUserId(userId, { page, limit });
}

export async function getEarningsStatus({ user }) {
  const [snapshot, history] = await Promise.all([
    coinsService.getWalletSnapshot({ userId: user.id, gender: user.gender }),
    withdrawalRepository.findByUserId(user.id, { page: 1, limit: 5 }),
  ]);

  return {
    wallet: snapshot,
    recentWithdrawals: history.items,
  };
}

export async function listAdminWithdrawals({ status, search, page = 1, limit = 20 }) {
  const [data, stats] = await Promise.all([
    withdrawalRepository.listAdmin({ status, search, page, limit }),
    withdrawalRepository.aggregateStats(),
  ]);

  return {
    ...data,
    stats,
  };
}

/**
 * Admin approves withdrawal request.
 * If mode is 'cashfree', initiates Cashfree Payout transfer.
 */
export async function approveWithdrawal({ withdrawalId, adminUser, mode = 'cashfree', adminNotes, utr }) {
  const withdrawal = await withdrawalRepository.findById(withdrawalId);
  if (!withdrawal) {
    throw new NotFoundError('Withdrawal request not found', 'WITHDRAWAL_NOT_FOUND');
  }

  if (withdrawal.status !== WITHDRAWAL_STATUS.PENDING) {
    throw new BadRequestError(`Cannot approve a withdrawal with status "${withdrawal.status}"`, 'INVALID_STATUS');
  }

  let providerResponse = null;
  let cashfreeTransferId = null;
  let finalStatus = WITHDRAWAL_STATUS.SUCCESS;
  let referenceId = utr || null;

  if (mode === 'cashfree') {
    cashfreeTransferId = `payout_${withdrawal._id}_${Date.now()}`;

    try {
      providerResponse = await cashfreePayoutGateway.initiateTransfer({
        transferId: cashfreeTransferId,
        amountInRupees: withdrawal.amountInRupees,
        payoutMethod: withdrawal.payoutMethod,
        upiId: withdrawal.upiId,
        bankDetails: withdrawal.bankDetails || {},
        user: withdrawal.userId,
        remarks: `Vibe Chat ₹${withdrawal.amountInRupees} Withdrawal`,
      });

      referenceId = providerResponse.referenceId || providerResponse.utr || cashfreeTransferId;
      finalStatus = providerResponse.status === 'ERROR' ? WITHDRAWAL_STATUS.FAILED : WITHDRAWAL_STATUS.SUCCESS;
    } catch (error) {
      logger.error({ err: error, withdrawalId }, 'Cashfree Payout initiation failed');
      throw new BadRequestError(
        `Cashfree Transfer Failed: ${error.message}. You can also use "Manual Mode" if you transferred directly.`,
        'CASHFREE_PAYOUT_FAILED',
      );
    }
  }

  const updated = await withdrawalRepository.updateById(withdrawalId, {
    status: finalStatus,
    adminNotes: adminNotes || (mode === 'manual' ? 'Manually processed by admin' : 'Processed via Cashfree Payout'),
    processedByAdminId: adminUser.id,
    processedAt: new Date(),
    provider: mode === 'cashfree' ? 'cashfree' : 'manual',
    cashfreeTransferId,
    cashfreeReferenceId: referenceId,
    cashfreeUtr: utr || providerResponse?.utr || null,
    rawProviderResponse: providerResponse,
  });

  // Record stats in wallet
  await walletRepository.recordWithdrawalSuccess(withdrawal.userId._id || withdrawal.userId, {
    coins: withdrawal.coins,
    amountInRupees: withdrawal.amountInRupees,
  });

  // Notify user
  emitToUser(withdrawal.userId._id || withdrawal.userId, 'withdrawal:approved', {
    withdrawalId: withdrawal._id,
    amountInRupees: withdrawal.amountInRupees,
    coins: withdrawal.coins,
    utr: referenceId,
  });

  notificationService
    .sendToUser({
      userId: withdrawal.userId._id || withdrawal.userId,
      title: '🎉 Payment Successful!',
      body: `Your withdrawal of ₹${withdrawal.amountInRupees} has been approved and transferred to your account!`,
      data: { type: 'withdrawal', id: String(withdrawal._id) },
    })
    .catch((err) => logger.warn({ err }, 'Withdrawal approval notification failed'));

  logger.info(
    { withdrawalId, adminId: adminUser.id, amountInRupees: withdrawal.amountInRupees, mode },
    'Admin approved and completed withdrawal',
  );

  return updated;
}

/**
 * Admin rejects withdrawal request with a reason.
 * Automatically refunds the debited coins back to the girl's wallet.
 */
export async function rejectWithdrawal({ withdrawalId, adminUser, reason, adminNotes }) {
  const withdrawal = await withdrawalRepository.findById(withdrawalId);
  if (!withdrawal) {
    throw new NotFoundError('Withdrawal request not found', 'WITHDRAWAL_NOT_FOUND');
  }

  if (withdrawal.status !== WITHDRAWAL_STATUS.PENDING) {
    throw new BadRequestError(`Cannot reject a withdrawal with status "${withdrawal.status}"`, 'INVALID_STATUS');
  }

  const updated = await withdrawalRepository.updateById(withdrawalId, {
    status: WITHDRAWAL_STATUS.REJECTED,
    rejectionReason: reason,
    adminNotes: adminNotes || null,
    processedByAdminId: adminUser.id,
    processedAt: new Date(),
  });

  // Automatically refund coins to girl's wallet
  await coinsService.creditCoins({
    userId: withdrawal.userId._id || withdrawal.userId,
    gender: 'female',
    amount: withdrawal.coins,
    type: COIN_TRANSACTION_TYPE.WITHDRAWAL_REFUND,
    description: `Refund for rejected withdrawal: ${reason}`,
    referenceId: `refund_${withdrawal._id}`,
    metadata: { withdrawalId: withdrawal._id, reason },
  });

  // Notify user
  emitToUser(withdrawal.userId._id || withdrawal.userId, 'withdrawal:rejected', {
    withdrawalId: withdrawal._id,
    reason,
    coinsRefunded: withdrawal.coins,
  });

  notificationService
    .sendToUser({
      userId: withdrawal.userId._id || withdrawal.userId,
      title: '⚠️ Withdrawal Request Update',
      body: `Your withdrawal of ₹${withdrawal.amountInRupees} could not be processed: ${reason}. Your ${withdrawal.coins} coins have been refunded.`,
      data: { type: 'withdrawal', id: String(withdrawal._id) },
    })
    .catch((err) => logger.warn({ err }, 'Withdrawal rejection notification failed'));

  logger.info(
    { withdrawalId, adminId: adminUser.id, reason },
    'Admin rejected withdrawal and refunded coins',
  );

  return updated;
}

export const withdrawalService = {
  requestWithdrawal,
  getMyWithdrawals,
  getEarningsStatus,
  listAdminWithdrawals,
  approveWithdrawal,
  rejectWithdrawal,
};
