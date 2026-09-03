import { BannerModel } from '#src/modules/banners/banner.model.js';
import { BannerClickModel } from '#src/modules/banners/banner-click.model.js';

class BannerRepository {
  /**
   * Banners the app should show right now: active, in their run window, in
   * display order. The date comparison is done in the query rather than in
   * JavaScript so a banner expires on the server's clock, not the phone's.
   */
  async findLive({ placement, now = new Date() }) {
    return BannerModel.find({
      placement,
      isActive: true,
      $and: [
        { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
        { $or: [{ endsAt: null }, { endsAt: { $gte: now } }] },
      ],
    })
      .sort({ sortOrder: 1, createdAt: -1 })
      .lean()
      .exec();
  }

  async listAll() {
    return BannerModel.find().sort({ sortOrder: 1, createdAt: -1 }).lean().exec();
  }

  async findById(bannerId, { includeStorageKey = false } = {}) {
    const query = BannerModel.findById(bannerId);
    if (includeStorageKey) query.select('+imageStorageKey');
    return query.lean().exec();
  }

  async create(data) {
    const banner = await BannerModel.create(data);
    return banner.toObject();
  }

  async updateById(bannerId, update) {
    return BannerModel.findByIdAndUpdate(bannerId, update, { new: true, runValidators: true })
      .lean()
      .exec();
  }

  async deleteById(bannerId) {
    await BannerClickModel.deleteMany({ bannerId }).catch(() => undefined);
    return BannerModel.findByIdAndDelete(bannerId).select('+imageStorageKey').lean().exec();
  }

  /**
   * Fire-and-forget counters. `updateOne` without waiting keeps a metric from
   * ever slowing down the feed that reports it.
   */
  async incrementImpressions(bannerIds) {
    if (!bannerIds?.length) return null;
    return BannerModel.updateMany({ _id: { $in: bannerIds } }, { $inc: { impressions: 1 } }).exec();
  }

  async recordTap({ bannerId, userId, action, actionTarget, ip, userAgent }) {
    await BannerModel.updateOne({ _id: bannerId }, { $inc: { taps: 1 } }).exec();
    if (userId) {
      await BannerClickModel.create({
        bannerId,
        userId,
        action: action || '',
        actionTarget: actionTarget || '',
        ip: ip || null,
        userAgent: userAgent || null,
      }).catch(() => undefined);
    }
  }

  async getBannerClicks(bannerId, { limit = 100 } = {}) {
    const [clicks, totalClicks, uniqueUsers] = await Promise.all([
      BannerClickModel.find({ bannerId })
        .sort({ clickedAt: -1 })
        .limit(limit)
        .populate('userId', 'name nickname email avatarUrl phone role createdAt')
        .lean()
        .exec(),
      BannerClickModel.countDocuments({ bannerId }),
      BannerClickModel.distinct('userId', { bannerId }),
    ]);

    return {
      totalClicks,
      uniqueUsersCount: uniqueUsers.length,
      clicks: clicks.map((c) => ({
        id: String(c._id),
        userId: c.userId ? String(c.userId._id) : 'Unknown',
        name: c.userId?.name || c.userId?.nickname || 'App User',
        nickname: c.userId?.nickname || '',
        email: c.userId?.email || 'N/A',
        avatarUrl: c.userId?.avatarUrl || null,
        phone: c.userId?.phone || null,
        role: c.userId?.role || 'user',
        action: c.action,
        actionTarget: c.actionTarget,
        clickedAt: c.clickedAt,
      })),
    };
  }

  async getClickerUserIds(bannerId) {
    return BannerClickModel.distinct('userId', { bannerId });
  }

  async countLive(placement) {
    return BannerModel.countDocuments({ placement, isActive: true }).exec();
  }
}

export const bannerRepository = new BannerRepository();
