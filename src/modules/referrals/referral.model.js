import mongoose from 'mongoose';

/**
 * One document per successful referral event.
 *
 * Created when user B completes registration with user A's code.
 * `rewardCoins` is snapshotted from settings at the time of the event so
 * historical records remain accurate even when the admin changes the amounts.
 */
const referralSchema = new mongoose.Schema(
  {
    /** User A — the one who shared the code and earns coins. */
    referrerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    /** User B — the new registrant who used the code. */
    refereeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },

    /** The 8-char code that was used (for traceability). */
    referralCode: { type: String, required: true },

    /** Gender of referrer at event time. */
    referrerGender: { type: String, required: true },

    /** Gender of referee at event time. */
    refereeGender: { type: String, required: true },

    /** Coins credited to referrer — snapshot from settings at event time. */
    rewardCoins: { type: Number, required: true, default: 0 },

    /** completed = coins credited; failed = something went wrong (coins NOT credited). */
    status: { type: String, enum: ['completed', 'failed'], default: 'completed' },
  },
  { timestamps: true },
);

referralSchema.index({ referrerId: 1, createdAt: -1 });

export const ReferralModel = mongoose.model('Referral', referralSchema);
