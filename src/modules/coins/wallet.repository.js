import { WalletModel } from '#src/modules/coins/wallet.model.js';

/**
 * Every mutation here is a single conditional `findOneAndUpdate`. Two devices
 * sending messages at the same instant therefore cannot both spend the same
 * coins: the loser's filter simply does not match and the service falls
 * through to the next billing option.
 */
class WalletRepository {
  async findByUserId(userId) {
    return WalletModel.findOne({ userId }).lean().exec();
  }

  async findOrCreate(userId, defaults = {}, { session } = {}) {
    return WalletModel.findOneAndUpdate(
      { userId },
      { $setOnInsert: { userId, ...defaults } },
      { new: true, upsert: true, setDefaultsOnInsert: true, session },
    )
      .lean()
      .exec();
  }

  /** Consumes one already-paid message. Returns null when no credits remain. */
  async consumeMessageCredit(userId) {
    return WalletModel.findOneAndUpdate(
      { userId, messageCredits: { $gt: 0 } },
      { $inc: { messageCredits: -1, lifetimeBilledMessages: 1 } },
      { new: true },
    )
      .lean()
      .exec();
  }

  /**
   * Buys one block and immediately consumes its first message.
   * Returns null when the balance is short — the caller turns that into a 402.
   */
  async purchaseMessageBlock(userId, { cost, messagesPerBlock }) {
    return WalletModel.findOneAndUpdate(
      { userId, coinBalance: { $gte: cost } },
      {
        $inc: { coinBalance: -cost, totalSpentCoins: cost, lifetimeBilledMessages: 1 },
        $set: { messageCredits: Math.max(0, messagesPerBlock - 1) },
      },
      { new: true },
    )
      .lean()
      .exec();
  }

  /**
   * Burns free-talk seconds, clamped at zero by an aggregation-pipeline update
   * so a long tick can never drive the balance negative.
   */
  async consumeFreeTalkSeconds(userId, seconds) {
    return WalletModel.findOneAndUpdate(
      { userId, freeTalkSecondsRemaining: { $gt: 0 } },
      [
        {
          $set: {
            freeTalkSecondsRemaining: {
              $max: [0, { $subtract: ['$freeTalkSecondsRemaining', seconds] }],
            },
            freeTalkStartedAt: { $ifNull: ['$freeTalkStartedAt', '$$NOW'] },
          },
        },
      ],
      { new: true },
    )
      .lean()
      .exec();
  }

  async creditCoins(userId, { amount, extra = {} }) {
    return WalletModel.findOneAndUpdate(
      { userId },
      { $inc: { coinBalance: amount, ...extra } },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    )
      .lean()
      .exec();
  }

  /** Debit that refuses to overdraw: returns null instead of a negative balance. */
  async debitCoins(userId, { amount, extra = {} }) {
    return WalletModel.findOneAndUpdate(
      { userId, coinBalance: { $gte: amount } },
      { $inc: { coinBalance: -amount, ...extra } },
      { new: true },
    )
      .lean()
      .exec();
  }

  /**
   * Claims the recurring bonus. The `lastDailyBonusAt` guard is part of the
   * filter, so two concurrent claims can never both succeed.
   */
  async claimDailyBonus(userId, { amount, eligibleBefore, now }) {
    return WalletModel.findOneAndUpdate(
      {
        userId,
        $or: [{ lastDailyBonusAt: null }, { lastDailyBonusAt: { $lte: eligibleBefore } }],
      },
      {
        $inc: { coinBalance: amount, totalBonusCoins: amount },
        $set: { lastDailyBonusAt: now },
      },
      { new: true },
    )
      .lean()
      .exec();
  }

  async setFreeTalkSeconds(userId, seconds) {
    return WalletModel.findOneAndUpdate(
      { userId },
      { $set: { freeTalkSecondsRemaining: seconds } },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    )
      .lean()
      .exec();
  }

  async findDueForDailyBonus({ eligibleBefore, userIds, limit = 500 }) {
    const filter = {
      $or: [{ lastDailyBonusAt: null }, { lastDailyBonusAt: { $lte: eligibleBefore } }],
    };
    if (userIds) filter.userId = { $in: userIds };

    return WalletModel.find(filter).select('userId lastDailyBonusAt').limit(limit).lean().exec();
  }

  async aggregateTotals() {
    const [totals] = await WalletModel.aggregate([
      {
        $group: {
          _id: null,
          totalCoinsInCirculation: { $sum: '$coinBalance' },
          totalPurchasedCoins: { $sum: '$totalPurchasedCoins' },
          totalSpentCoins: { $sum: '$totalSpentCoins' },
          totalBonusCoins: { $sum: '$totalBonusCoins' },
          walletCount: { $sum: 1 },
        },
      },
    ]).exec();

    return (
      totals ?? {
        totalCoinsInCirculation: 0,
        totalPurchasedCoins: 0,
        totalSpentCoins: 0,
        totalBonusCoins: 0,
        walletCount: 0,
      }
    );
  }
}

export const walletRepository = new WalletRepository();
