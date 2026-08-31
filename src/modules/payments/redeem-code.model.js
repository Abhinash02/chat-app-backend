import mongoose from 'mongoose';

const redemptionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    userEmail: { type: String, default: '' },
    userNickname: { type: String, default: '' },
    redeemedAt: { type: Date, default: Date.now },
    creditedCoins: { type: Number, default: 0 },
    discountApplied: { type: String, default: null },
  },
  { _id: false },
);

const redeemCodeSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      minlength: 3,
      maxlength: 30,
      index: true,
    },
    description: { type: String, trim: true, maxlength: 500, default: '' },
    rewardType: {
      type: String,
      enum: ['free_coins', 'discount_percent', 'discount_flat'],
      default: 'free_coins',
      index: true,
    },
    coins: { type: Number, default: 0, min: 0 },
    discountPercent: { type: Number, default: 0, min: 0, max: 100 },
    discountAmountInRupees: { type: Number, default: 0, min: 0 },
    targetType: {
      type: String,
      enum: ['all', 'male', 'female', 'single_user'],
      default: 'all',
      index: true,
    },
    targetUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    targetUserEmail: { type: String, default: null, lowercase: true, trim: true },
    maxUsesTotal: { type: Number, default: 1000, min: 1 },
    maxUsesPerUser: { type: Number, default: 1, min: 1 },
    usedCount: { type: Number, default: 0, min: 0 },
    expiresAt: { type: Date, default: null, index: true },
    isActive: { type: Boolean, default: true, index: true },
    redemptions: [redemptionSchema],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  {
    timestamps: true,
  },
);

export const RedeemCodeModel = mongoose.model('RedeemCode', redeemCodeSchema);
