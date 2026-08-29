import mongoose from 'mongoose';

import { COIN_TRANSACTION_DIRECTION, COIN_TRANSACTION_TYPE } from '#src/modules/coins/coins.constants.js';

/**
 * Append-only ledger. Every balance change writes exactly one row carrying the
 * resulting balance, so support can reconstruct any wallet without replaying
 * business logic. Rows are never updated or deleted.
 */
const coinTransactionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: Object.values(COIN_TRANSACTION_TYPE), required: true, index: true },
    direction: { type: String, enum: Object.values(COIN_TRANSACTION_DIRECTION), required: true },

    /** Always positive; `direction` carries the sign. */
    amount: { type: Number, required: true, min: 0 },
    balanceAfter: { type: Number, required: true, min: 0 },

    description: { type: String, maxlength: 200, default: '' },
    /** Order id, conversation id, game session id — whatever caused the entry. */
    referenceId: { type: String, default: null, index: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },

    performedByAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

coinTransactionSchema.index({ userId: 1, createdAt: -1 });

export const CoinTransactionModel = mongoose.model('CoinTransaction', coinTransactionSchema);
