import mongoose from 'mongoose';

/**
 * A purchasable coin bundle. Prices are stored in the smallest currency unit
 * (paise) because that is what Razorpay charges in — keeping rupees out of the
 * database avoids float rounding on every order.
 */
const coinPackageSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    description: { type: String, trim: true, maxlength: 160, default: '' },

    priceInPaise: { type: Number, required: true, min: 100 },
    currency: { type: String, default: 'INR', uppercase: true, maxlength: 3 },

    coins: { type: Number, required: true, min: 1 },
    /** Shown separately in the UI as "+N bonus"; credited together with `coins`. */
    bonusCoins: { type: Number, default: 0, min: 0 },

    badge: { type: String, trim: true, maxlength: 24, default: '' },
    isPopular: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true, index: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
);

coinPackageSchema.index({ isActive: 1, sortOrder: 1 });

coinPackageSchema.virtual('totalCoins').get(function totalCoins() {
  return this.coins + this.bonusCoins;
});

coinPackageSchema.set('toJSON', { virtuals: true });
coinPackageSchema.set('toObject', { virtuals: true });

export const CoinPackageModel = mongoose.model('CoinPackage', coinPackageSchema);
