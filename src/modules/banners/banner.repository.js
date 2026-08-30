import { BannerModel } from '#src/modules/banners/banner.model.js';

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

  async incrementTaps(bannerId) {
    return BannerModel.updateOne({ _id: bannerId }, { $inc: { taps: 1 } }).exec();
  }

  async countLive(placement) {
    return BannerModel.countDocuments({ placement, isActive: true }).exec();
  }
}

export const bannerRepository = new BannerRepository();
