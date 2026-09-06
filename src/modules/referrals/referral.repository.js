import mongoose from 'mongoose';

import { ReferralModel } from '#src/modules/referrals/referral.model.js';

export const referralRepository = {
  /**
   * Record a completed referral event.
   */
  create({ referrerId, refereeId, referralCode, referrerGender, refereeGender, rewardCoins, status = 'completed' }) {
    return ReferralModel.create({
      referrerId,
      refereeId,
      referralCode,
      referrerGender,
      refereeGender,
      rewardCoins,
      status,
    });
  },

  /**
   * Has this user already been referred by someone? (refereeId is unique)
   */
  existsByReferee(refereeId) {
    return ReferralModel.exists({ refereeId });
  },

  /**
   * All referrals made by a particular referrer, newest first.
   */
  async findByReferrer(referrerId, { skip = 0, limit = 20 } = {}) {
    const [docs, total] = await Promise.all([
      ReferralModel.find({ referrerId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('refereeId', 'name nickname avatarEmoji avatarColor avatarUrl gender')
        .lean(),
      ReferralModel.countDocuments({ referrerId }),
    ]);
    return { docs, total };
  },

  /**
   * Aggregate stats for a referrer.
   */
  async statsByReferrer(referrerId) {
    /*
     * The id has to be cast by hand.
     *
     * `find()` casts a string id against the schema for you; an aggregation
     * pipeline does not — `$match` is handed to the server as written. So a
     * string here was compared against stored ObjectIds, matched nothing, and
     * this returned a confident zero no matter how many referrals existed. The
     * refer screen showed "0 referrals, 0 coins" to people who had both.
     */
    const result = await ReferralModel.aggregate([
      {
        $match: {
          referrerId: new mongoose.Types.ObjectId(String(referrerId)),
          status: 'completed',
        },
      },
      {
        $group: {
          _id: null,
          totalReferrals: { $sum: 1 },
          totalCoinsEarned: { $sum: '$rewardCoins' },
        },
      },
    ]);
    return result[0] ?? { totalReferrals: 0, totalCoinsEarned: 0 };
  },

  /**
   * Admin: list all referrals across the platform.
   */
  async findAll({ skip = 0, limit = 30 } = {}) {
    const [docs, total] = await Promise.all([
      ReferralModel.find()
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('referrerId', 'name nickname gender')
        .populate('refereeId', 'name nickname gender')
        .lean(),
      ReferralModel.countDocuments(),
    ]);
    return { docs, total };
  },

  /**
   * Admin: platform-wide totals.
   */
  async globalStats() {
    const result = await ReferralModel.aggregate([
      { $match: { status: 'completed' } },
      {
        $group: {
          _id: null,
          totalReferrals: { $sum: 1 },
          totalCoinsAwarded: { $sum: '$rewardCoins' },
        },
      },
    ]);
    return result[0] ?? { totalReferrals: 0, totalCoinsAwarded: 0 };
  },
};
