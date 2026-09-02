import mongoose from 'mongoose';

import { PAYOUT_METHOD, WITHDRAWAL_STATUS } from '#src/modules/withdrawals/withdrawal.constants.js';

const bankDetailsSchema = new mongoose.Schema(
  {
    accountNumber: { type: String, trim: true },
    ifsc: { type: String, trim: true, uppercase: true },
    accountHolderName: { type: String, trim: true },
    bankName: { type: String, trim: true },
    phone: { type: String, trim: true },
  },
  { _id: false },
);

const withdrawalSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    coins: { type: Number, required: true, min: 1 },
    amountInRupees: { type: Number, required: true, min: 0.01 },
    amountInPaise: { type: Number, required: true, min: 1 },
    coinsPerRupeeRate: { type: Number, required: true, min: 1 },

    payoutMethod: {
      type: String,
      enum: Object.values(PAYOUT_METHOD),
      required: true,
      default: PAYOUT_METHOD.UPI,
    },

    upiId: { type: String, trim: true, lowercase: true, default: null },
    bankDetails: { type: bankDetailsSchema, default: null },

    status: {
      type: String,
      enum: Object.values(WITHDRAWAL_STATUS),
      default: WITHDRAWAL_STATUS.PENDING,
      index: true,
    },

    rejectionReason: { type: String, default: null },
    adminNotes: { type: String, default: null },

    processedByAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    processedAt: { type: Date, default: null },

    provider: { type: String, default: 'cashfree' },
    cashfreeTransferId: { type: String, default: null },
    cashfreeReferenceId: { type: String, default: null },
    cashfreeUtr: { type: String, default: null },
    rawProviderResponse: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true },
);

withdrawalSchema.index({ status: 1, createdAt: -1 });
withdrawalSchema.index({ userId: 1, createdAt: -1 });

export const WithdrawalModel = mongoose.model('Withdrawal', withdrawalSchema);
