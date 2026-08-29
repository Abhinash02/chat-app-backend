import mongoose from 'mongoose';

import { PAYMENT_PROVIDER } from '#src/integrations/payments/payment.gateway.js';
import { PAYMENT_STATUS } from '#src/modules/payments/payment.constants.js';

const manualProofSchema = new mongoose.Schema(
  {
    /** UPI reference number the payer reads off their bank app. */
    utr: { type: String, trim: true, maxlength: 40, default: '' },
    note: { type: String, trim: true, maxlength: 200, default: '' },
    screenshotUrl: { type: String, default: null },
  },
  { _id: false },
);

const paymentOrderSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    packageId: { type: mongoose.Schema.Types.ObjectId, ref: 'CoinPackage', required: true },

    /**
     * Price and coins are snapshotted at order time. An admin changing the pack
     * afterwards must not change what an in-flight order is worth.
     */
    packageName: { type: String, required: true },
    amountInPaise: { type: Number, required: true, min: 100 },
    currency: { type: String, default: 'INR', uppercase: true },
    coins: { type: Number, required: true, min: 1 },
    bonusCoins: { type: Number, default: 0, min: 0 },

    provider: { type: String, enum: Object.values(PAYMENT_PROVIDER), required: true },
    status: {
      type: String,
      enum: Object.values(PAYMENT_STATUS),
      default: PAYMENT_STATUS.CREATED,
      index: true,
    },

    providerOrderId: { type: String, default: null, index: true },
    providerPaymentId: { type: String, default: null, index: true },
    providerSignature: { type: String, default: null },

    manualProof: { type: manualProofSchema, default: () => ({}) },
    verifiedByAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    rejectionReason: { type: String, default: null },

    /** Set exactly once, by the coin credit step — the idempotency anchor. */
    creditedAt: { type: Date, default: null },
    failureReason: { type: String, default: null },
    expiresAt: { type: Date, default: null },
  },
  { timestamps: true },
);

paymentOrderSchema.index({ userId: 1, createdAt: -1 });
paymentOrderSchema.index({ status: 1, createdAt: -1 });

paymentOrderSchema.virtual('totalCoins').get(function totalCoins() {
  return this.coins + this.bonusCoins;
});

paymentOrderSchema.set('toJSON', { virtuals: true });
paymentOrderSchema.set('toObject', { virtuals: true });

export const PaymentOrderModel = mongoose.model('PaymentOrder', paymentOrderSchema);
