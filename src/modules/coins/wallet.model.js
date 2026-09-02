import mongoose from 'mongoose';

const walletSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },

    coinBalance: { type: Number, required: true, default: 0, min: 0 },

    /**
     * Messages already paid for in the current block. Buying a block sets this
     * to `messagesPerBlock`; each billed message decrements it. This is what
     * makes "7 messages = 10 coins" hold exactly.
     */
    messageCredits: { type: Number, required: true, default: 0, min: 0 },

    /** Introductory free-chat allowance, consumed by chat heartbeats. */
    freeTalkSecondsRemaining: { type: Number, required: true, default: 0, min: 0 },
    freeTalkStartedAt: { type: Date, default: null },

    lastDailyBonusAt: { type: Date, default: null },

    totalPurchasedCoins: { type: Number, default: 0, min: 0 },
    totalSpentCoins: { type: Number, default: 0, min: 0 },
    totalBonusCoins: { type: Number, default: 0, min: 0 },
    lifetimeBilledMessages: { type: Number, default: 0, min: 0 },

    /** Messages sent by girl to boys towards next coin reward */
    girlChatMessagesCount: { type: Number, default: 0, min: 0 },
    totalEarnedCoins: { type: Number, default: 0, min: 0 },
    totalWithdrawnCoins: { type: Number, default: 0, min: 0 },
    totalWithdrawnRupees: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

walletSchema.index({ lastDailyBonusAt: 1 });

export const WalletModel = mongoose.model('Wallet', walletSchema);
