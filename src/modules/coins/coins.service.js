import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  PaymentRequiredError,
} from '#src/common/errors/index.js';
import { ONE_HOUR_MS } from '#src/common/utils/date.util.js';
import { resolvePagination, buildPaginationMeta } from '#src/common/utils/pagination.util.js';
import { logger } from '#src/config/logger.js';
import { emitToUser } from '#src/realtime/emitter.js';
import { SOCKET_EVENT } from '#src/realtime/events.js';
import { settingsService } from '#src/modules/settings/settings.service.js';
import {
  BILLING_OUTCOME,
  COIN_TRANSACTION_DIRECTION,
  COIN_TRANSACTION_TYPE,
} from '#src/modules/coins/coins.constants.js';
import { walletRepository } from '#src/modules/coins/wallet.repository.js';
import { coinTransactionRepository } from '#src/modules/coins/coin-transaction.repository.js';
import { coinPackageRepository } from '#src/modules/coins/coin-package.repository.js';

const CREDIT_TYPES = new Set([
  COIN_TRANSACTION_TYPE.PURCHASE,
  COIN_TRANSACTION_TYPE.DAILY_BONUS,
  COIN_TRANSACTION_TYPE.SIGNUP_BONUS,
  COIN_TRANSACTION_TYPE.GAME_REWARD,
  COIN_TRANSACTION_TYPE.CHAT_EARNING,
  COIN_TRANSACTION_TYPE.WITHDRAWAL_REFUND,
  COIN_TRANSACTION_TYPE.ADMIN_CREDIT,
  COIN_TRANSACTION_TYPE.REFUND,
]);

function directionFor(type) {
  return CREDIT_TYPES.has(type)
    ? COIN_TRANSACTION_DIRECTION.CREDIT
    : COIN_TRANSACTION_DIRECTION.DEBIT;
}

/** Girls chat free and unlimited: their gender is simply absent from `chargedGenders`. */
export function isChargedGender(gender, coinSettings) {
  return (coinSettings.chargedGenders ?? []).includes(gender);
}

function dailyBonusStatus({ wallet, coinSettings, gender, now = new Date() }) {
  const intervalMs = coinSettings.dailyBonusIntervalHours * ONE_HOUR_MS;
  const eligible = isChargedGender(gender, coinSettings) && coinSettings.dailyBonusCoins > 0;

  if (!eligible) {
    return { eligible: false, amount: 0, isAvailable: false, nextAvailableAt: null, msRemaining: 0 };
  }

  if (!wallet?.lastDailyBonusAt) {
    return {
      eligible: true,
      amount: coinSettings.dailyBonusCoins,
      isAvailable: true,
      nextAvailableAt: null,
      msRemaining: 0,
    };
  }

  const nextAvailableAt = new Date(new Date(wallet.lastDailyBonusAt).getTime() + intervalMs);
  const msRemaining = Math.max(0, nextAvailableAt.getTime() - now.getTime());

  return {
    eligible: true,
    amount: coinSettings.dailyBonusCoins,
    isAvailable: msRemaining === 0,
    nextAvailableAt,
    msRemaining,
  };
}

/**
 * The payload behind the coin counter in the app header. `estimatedMessagesRemaining`
 * is null for accounts that are never billed, which the UI renders as "unlimited".
 */
export function buildWalletSnapshot({
  wallet,
  coinSettings,
  earningsSettings = {},
  gender,
  billing = null,
}) {
  const charged = isChargedGender(gender, coinSettings);
  const { messagesPerBlock, coinsPerBlock } = coinSettings;

  const affordableBlocks = coinsPerBlock > 0 ? Math.floor(wallet.coinBalance / coinsPerBlock) : 0;
  const estimatedMessagesRemaining = charged
    ? wallet.messageCredits + affordableBlocks * messagesPerBlock
    : null;

  const coinsPerRupee = earningsSettings.coinsPerRupee || 25;
  const withdrawableRupees = ((wallet.coinBalance ?? 0) / coinsPerRupee).toFixed(2);

  return {
    coinBalance: wallet.coinBalance,
    messageCredits: wallet.messageCredits,
    freeTalkSecondsRemaining: wallet.freeTalkSecondsRemaining,
    isChargedAccount: charged,
    isUnlimited: !charged,
    pricing: { messagesPerBlock, coinsPerBlock },
    estimatedMessagesRemaining,
    earnings: {
      enabled: earningsSettings.enabled ?? true,
      messagesPerReward: earningsSettings.messagesPerReward ?? 25,
      rewardCoins: earningsSettings.rewardCoins ?? 1,
      coinsPerRupee,
      minWithdrawalCoins: earningsSettings.minWithdrawalCoins ?? 25,
      maxWithdrawalCoinsPerDay: earningsSettings.maxWithdrawalCoinsPerDay ?? 5000,
      currentProgress: wallet.girlChatMessagesCount ?? 0,
      totalEarnedCoins: wallet.totalEarnedCoins ?? 0,
      totalWithdrawnCoins: wallet.totalWithdrawnCoins ?? 0,
      totalWithdrawnRupees: wallet.totalWithdrawnRupees ?? 0,
      withdrawableRupees: Number(withdrawableRupees),
    },
    totals: {
      purchased: wallet.totalPurchasedCoins ?? 0,
      spent: wallet.totalSpentCoins ?? 0,
      bonus: wallet.totalBonusCoins ?? 0,
      earned: wallet.totalEarnedCoins ?? 0,
      withdrawnCoins: wallet.totalWithdrawnCoins ?? 0,
      withdrawnRupees: wallet.totalWithdrawnRupees ?? 0,
      billedMessages: wallet.lifetimeBilledMessages ?? 0,
    },
    dailyBonus: dailyBonusStatus({ wallet, coinSettings, gender }),
    lastBilling: billing,
  };
}

function pushWalletUpdate({ userId, snapshot }) {
  emitToUser(userId, SOCKET_EVENT.WALLET_UPDATED, snapshot);
}

/**
 * Creates the wallet on first use, seeding the introductory free-talk allowance
 * and any signup bonus. Safe to call repeatedly — the upsert only seeds once.
 */
export async function ensureWallet({ userId, gender }) {
  const coinSettings = await settingsService.getCoinSettings();
  const charged = isChargedGender(gender, coinSettings);

  const wallet = await walletRepository.findOrCreate(userId, {
    coinBalance: 0,
    messageCredits: 0,
    // Only billed accounts have anything to spend a free allowance on.
    freeTalkSecondsRemaining: charged ? coinSettings.freeTalkMinutes * 60 : 0,
  });

  if (charged && coinSettings.signupBonusCoins > 0 && (wallet.totalBonusCoins ?? 0) === 0) {
    return creditCoins({
      userId,
      gender,
      amount: coinSettings.signupBonusCoins,
      type: COIN_TRANSACTION_TYPE.SIGNUP_BONUS,
      description: 'Welcome bonus',
      referenceId: `signup:${userId}`,
      extra: { totalBonusCoins: coinSettings.signupBonusCoins },
    }).then((result) => result.wallet);
  }

  return wallet;
}

export async function getWalletSnapshot({ userId, gender }) {
  const [settings, wallet] = await Promise.all([
    settingsService.getSettings(),
    walletRepository.findOrCreate(userId, {}),
  ]);

  return buildWalletSnapshot({
    wallet,
    coinSettings: settings.coins,
    earningsSettings: settings.earnings,
    gender,
  });
}

/**
 * Records a message sent by a girl to a boy.
 * When the count reaches `messagesPerReward` (default 25), awards `rewardCoins` (default 1).
 */
export async function recordGirlChatMessage({
  senderId,
  senderGender,
  recipientGender,
  conversationId,
}) {
  if (senderGender !== 'female' || recipientGender !== 'male') {
    return null;
  }

  const settings = await settingsService.getSettings();
  const earningsSettings = settings.earnings || {};

  if (earningsSettings.enabled === false) {
    return null;
  }

  const messagesPerReward = earningsSettings.messagesPerReward || 25;
  const rewardCoins = earningsSettings.rewardCoins || 1;

  // Increment message count
  const updatedWallet = await walletRepository.incrementGirlChatMessageCount(senderId, 1);
  const currentCount = updatedWallet.girlChatMessagesCount || 0;

  if (currentCount >= messagesPerReward) {
    // Reward threshold reached!
    const rewardedWallet = await walletRepository.awardGirlChatReward(senderId, {
      rewardCoins,
      messagesPerReward,
    });

    await coinTransactionRepository.create({
      userId: senderId,
      type: COIN_TRANSACTION_TYPE.CHAT_EARNING,
      direction: COIN_TRANSACTION_DIRECTION.CREDIT,
      amount: rewardCoins,
      balanceAfter: rewardedWallet.coinBalance,
      description: `Earned ${rewardCoins} coin for sending ${messagesPerReward} messages to boys`,
      referenceId: conversationId ? String(conversationId) : null,
      metadata: { messagesPerReward, rewardCoins },
    });

    const snapshot = buildWalletSnapshot({
      wallet: rewardedWallet,
      coinSettings: settings.coins,
      earningsSettings,
      gender: senderGender,
    });

    pushWalletUpdate({ userId: senderId, snapshot });

    emitToUser(senderId, 'coins:earned', {
      amount: rewardCoins,
      reason: `Earned ${rewardCoins} coin for ${messagesPerReward} messages with boys!`,
      wallet: snapshot,
    });

    logger.info(
      { userId: senderId, rewardCoins, messagesPerReward },
      'Female user earned coin reward from chatting with male user',
    );

    return { rewarded: true, rewardCoins, snapshot };
  }

  const snapshot = buildWalletSnapshot({
    wallet: updatedWallet,
    coinSettings: settings.coins,
    earningsSettings,
    gender: senderGender,
  });
  pushWalletUpdate({ userId: senderId, snapshot });

  return { rewarded: false, currentProgress: currentCount, messagesPerReward };
}

/**
 * Decides whether a message may be sent and charges for it.
 *
 * Order of precedence:
 *   1. gender is not billed          -> free forever
 *   2. free-talk allowance remaining -> free
 *   3. a prepaid message credit      -> free, one credit consumed
 *   4. enough coins                  -> buy one block, consume its first message
 *   5. otherwise                     -> 402 INSUFFICIENT_COINS
 *
 * Steps 3 and 4 are conditional atomic updates, so concurrent sends from two
 * devices can never spend the same coins twice.
 */
export async function authorizeMessage({ userId, gender, conversationId }) {
  const coinSettings = await settingsService.getCoinSettings();

  if (!isChargedGender(gender, coinSettings)) {
    const wallet = await walletRepository.findOrCreate(userId, {});
    return {
      allowed: true,
      outcome: BILLING_OUTCOME.FREE_GENDER,
      coinsCharged: 0,
      snapshot: buildWalletSnapshot({ wallet, coinSettings, gender }),
    };
  }

  const currentWallet = await walletRepository.findOrCreate(userId, {});

  if (currentWallet.freeTalkSecondsRemaining > 0) {
    return {
      allowed: true,
      outcome: BILLING_OUTCOME.FREE_TALK,
      coinsCharged: 0,
      snapshot: buildWalletSnapshot({
        wallet: currentWallet,
        coinSettings,
        gender,
        billing: { outcome: BILLING_OUTCOME.FREE_TALK, coinsCharged: 0 },
      }),
    };
  }

  const prepaid = await walletRepository.consumeMessageCredit(userId);
  if (prepaid) {
    const snapshot = buildWalletSnapshot({
      wallet: prepaid,
      coinSettings,
      gender,
      billing: { outcome: BILLING_OUTCOME.PREPAID_BLOCK, coinsCharged: 0 },
    });
    pushWalletUpdate({ userId, snapshot });
    return { allowed: true, outcome: BILLING_OUTCOME.PREPAID_BLOCK, coinsCharged: 0, snapshot };
  }

  const cost = coinSettings.coinsPerBlock;
  const charged = await walletRepository.purchaseMessageBlock(userId, {
    cost,
    messagesPerBlock: coinSettings.messagesPerBlock,
  });

  if (!charged) {
    throw new PaymentRequiredError(
      `You need ${cost} coins to send the next ${coinSettings.messagesPerBlock} messages`,
      'INSUFFICIENT_COINS',
      {
        required: cost,
        available: currentWallet.coinBalance,
        messagesPerBlock: coinSettings.messagesPerBlock,
      },
    );
  }

  await coinTransactionRepository.create({
    userId,
    type: COIN_TRANSACTION_TYPE.MESSAGE_CHARGE,
    direction: COIN_TRANSACTION_DIRECTION.DEBIT,
    amount: cost,
    balanceAfter: charged.coinBalance,
    description: `${coinSettings.messagesPerBlock} messages`,
    referenceId: conversationId ? String(conversationId) : null,
    metadata: { messagesPerBlock: coinSettings.messagesPerBlock },
  });

  const snapshot = buildWalletSnapshot({
    wallet: charged,
    coinSettings,
    gender,
    billing: { outcome: BILLING_OUTCOME.BLOCK_PURCHASED, coinsCharged: cost },
  });
  pushWalletUpdate({ userId, snapshot });

  return { allowed: true, outcome: BILLING_OUTCOME.BLOCK_PURCHASED, coinsCharged: cost, snapshot };
}

/**
 * Burns the introductory allowance while a chat screen is open. Called from the
 * socket heartbeat; the server decides how much to burn, never the client.
 */
export async function consumeFreeTalk({ userId, gender, seconds }) {
  const coinSettings = await settingsService.getCoinSettings();
  if (!isChargedGender(gender, coinSettings)) return null;

  const wallet = await walletRepository.consumeFreeTalkSeconds(userId, seconds);
  if (!wallet) return null;

  const snapshot = buildWalletSnapshot({ wallet, coinSettings, gender });

  emitToUser(userId, SOCKET_EVENT.FREE_TALK_TICK, {
    freeTalkSecondsRemaining: wallet.freeTalkSecondsRemaining,
    coinBalance: wallet.coinBalance,
  });

  if (wallet.freeTalkSecondsRemaining === 0) {
    emitToUser(userId, SOCKET_EVENT.FREE_TALK_EXHAUSTED, {
      messagesPerBlock: coinSettings.messagesPerBlock,
      coinsPerBlock: coinSettings.coinsPerBlock,
      coinBalance: wallet.coinBalance,
    });
    pushWalletUpdate({ userId, snapshot });
  }

  return snapshot;
}

/** Shared credit path — every coin that enters a wallet writes a ledger row. */
export async function creditCoins({
  userId,
  gender,
  amount,
  type,
  description = '',
  referenceId = null,
  metadata = {},
  extra = {},
  adminId = null,
}) {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new BadRequestError('Coin amount must be a positive whole number', 'INVALID_COIN_AMOUNT');
  }

  const wallet = await walletRepository.creditCoins(userId, { amount, extra });

  await coinTransactionRepository.create({
    userId,
    type,
    direction: directionFor(type),
    amount,
    balanceAfter: wallet.coinBalance,
    description,
    referenceId,
    metadata,
    performedByAdminId: adminId,
  });

  const coinSettings = await settingsService.getCoinSettings();
  const snapshot = buildWalletSnapshot({ wallet, coinSettings, gender });
  pushWalletUpdate({ userId, snapshot });

  return { wallet, snapshot };
}

export async function debitCoins({
  userId,
  gender,
  amount,
  type,
  description = '',
  referenceId = null,
  metadata = {},
  extra = {},
  adminId = null,
}) {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new BadRequestError('Coin amount must be a positive whole number', 'INVALID_COIN_AMOUNT');
  }

  const wallet = await walletRepository.debitCoins(userId, { amount, extra });
  if (!wallet) {
    throw new PaymentRequiredError('Not enough coins for this action', 'INSUFFICIENT_COINS', {
      required: amount,
    });
  }

  await coinTransactionRepository.create({
    userId,
    type,
    direction: directionFor(type),
    amount,
    balanceAfter: wallet.coinBalance,
    description,
    referenceId,
    metadata,
    performedByAdminId: adminId,
  });

  const coinSettings = await settingsService.getCoinSettings();
  const snapshot = buildWalletSnapshot({ wallet, coinSettings, gender });
  pushWalletUpdate({ userId, snapshot });

  return { wallet, snapshot };
}

/**
 * Credits the coins bought through a payment. Idempotent on `referenceId`, so a
 * replayed webhook or a retried client callback cannot double-credit.
 */
export async function creditPurchase({ userId, gender, coins, orderId, metadata = {} }) {
  const alreadyCredited = await coinTransactionRepository.existsByReference(
    String(orderId),
    COIN_TRANSACTION_TYPE.PURCHASE,
  );

  if (alreadyCredited) {
    logger.info({ orderId }, 'Purchase already credited; ignoring duplicate');
    const wallet = await walletRepository.findOrCreate(userId, {});
    const coinSettings = await settingsService.getCoinSettings();
    return { alreadyCredited: true, snapshot: buildWalletSnapshot({ wallet, coinSettings, gender }) };
  }

  const { snapshot } = await creditCoins({
    userId,
    gender,
    amount: coins,
    type: COIN_TRANSACTION_TYPE.PURCHASE,
    description: `${coins} coins purchased`,
    referenceId: String(orderId),
    metadata,
    extra: { totalPurchasedCoins: coins },
  });

  return { alreadyCredited: false, snapshot };
}

export async function getDailyBonusState({ userId, gender }) {
  const [coinSettings, wallet] = await Promise.all([
    settingsService.getCoinSettings(),
    walletRepository.findOrCreate(userId, {}),
  ]);

  return dailyBonusStatus({ wallet, coinSettings, gender });
}

export async function claimDailyBonus({ userId, gender }) {
  const coinSettings = await settingsService.getCoinSettings();

  if (!isChargedGender(gender, coinSettings)) {
    throw new BadRequestError('Your account already has unlimited chatting', 'DAILY_BONUS_NOT_APPLICABLE');
  }

  if (coinSettings.dailyBonusCoins <= 0) {
    throw new BadRequestError('The daily bonus is currently disabled', 'DAILY_BONUS_DISABLED');
  }

  // The claim update is conditional and does not upsert, so the row has to
  // exist first. It normally does (created at signup), but a wallet must never
  // be the reason a legitimate claim is refused.
  await walletRepository.findOrCreate(userId, {});

  const now = new Date();
  const eligibleBefore = new Date(now.getTime() - coinSettings.dailyBonusIntervalHours * ONE_HOUR_MS);

  const wallet = await walletRepository.claimDailyBonus(userId, {
    amount: coinSettings.dailyBonusCoins,
    eligibleBefore,
    now,
  });

  if (!wallet) {
    const current = await walletRepository.findOrCreate(userId, {});
    const status = dailyBonusStatus({ wallet: current, coinSettings, gender, now });
    throw new ConflictError('Your next bonus is not ready yet', 'DAILY_BONUS_NOT_READY', status);
  }

  await coinTransactionRepository.create({
    userId,
    type: COIN_TRANSACTION_TYPE.DAILY_BONUS,
    direction: COIN_TRANSACTION_DIRECTION.CREDIT,
    amount: coinSettings.dailyBonusCoins,
    balanceAfter: wallet.coinBalance,
    description: 'Daily coin bonus',
    referenceId: `daily:${userId}:${now.toISOString().slice(0, 10)}`,
  });

  const snapshot = buildWalletSnapshot({ wallet, coinSettings, gender });
  pushWalletUpdate({ userId, snapshot });

  return { credited: coinSettings.dailyBonusCoins, snapshot };
}

export async function listTransactions({ userId, page, limit, type }) {
  const { skip, page: safePage, limit: safeLimit } = resolvePagination({ page, limit });
  const { items, total } = await coinTransactionRepository.listByUser({
    userId,
    skip,
    limit: safeLimit,
    type,
  });

  return { items, meta: buildPaginationMeta({ page: safePage, limit: safeLimit, total }) };
}

export async function listPackages({ includeInactive = false } = {}) {
  return includeInactive ? coinPackageRepository.listAll() : coinPackageRepository.listActive();
}

export async function getPurchasablePackage(packageId) {
  const coinPackage = await coinPackageRepository.findActiveById(packageId);
  if (!coinPackage) throw new NotFoundError('Coin pack not available', 'COIN_PACKAGE_NOT_FOUND');
  return coinPackage;
}

export async function createPackage(data) {
  return coinPackageRepository.create(data);
}

export async function updatePackage(packageId, patch) {
  const updated = await coinPackageRepository.updateById(packageId, { $set: patch });
  if (!updated) throw new NotFoundError('Coin pack not found', 'COIN_PACKAGE_NOT_FOUND');
  return updated;
}

export async function deletePackage(packageId) {
  const deleted = await coinPackageRepository.deleteById(packageId);
  if (!deleted) throw new NotFoundError('Coin pack not found', 'COIN_PACKAGE_NOT_FOUND');
  return { deleted: true };
}

/** Admin manual correction. Always attributed to the acting admin in the ledger. */
export async function adjustBalance({ userId, gender, amount, reason, adminId }) {
  const isCredit = amount > 0;
  const absolute = Math.abs(amount);

  const operation = isCredit ? creditCoins : debitCoins;
  const { snapshot } = await operation({
    userId,
    gender,
    amount: absolute,
    type: isCredit ? COIN_TRANSACTION_TYPE.ADMIN_CREDIT : COIN_TRANSACTION_TYPE.ADMIN_DEBIT,
    description: reason,
    referenceId: `admin:${adminId}:${Date.now()}`,
    adminId,
  });

  logger.info({ userId, amount, adminId }, 'Admin adjusted coin balance');
  return snapshot;
}

/** Restores the introductory allowance — used by support for goodwill. */
export async function resetFreeTalk({ userId, gender }) {
  const coinSettings = await settingsService.getCoinSettings();
  const seconds = isChargedGender(gender, coinSettings) ? coinSettings.freeTalkMinutes * 60 : 0;
  const wallet = await walletRepository.setFreeTalkSeconds(userId, seconds);

  const snapshot = buildWalletSnapshot({ wallet, coinSettings, gender });
  pushWalletUpdate({ userId, snapshot });
  return snapshot;
}

export const coinsService = {
  ensureWallet,
  getWalletSnapshot,
  authorizeMessage,
  recordGirlChatMessage,
  consumeFreeTalk,
  creditCoins,
  debitCoins,
  creditPurchase,
  getDailyBonusState,
  claimDailyBonus,
  listTransactions,
  listPackages,
  getPurchasablePackage,
  createPackage,
  updatePackage,
  deletePackage,
  adjustBalance,
  resetFreeTalk,
  buildWalletSnapshot,
  isChargedGender,
};
