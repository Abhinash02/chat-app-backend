import { ThemeModel } from '#src/modules/theme/theme.model.js';

class ThemeRepository {
  async findActive() {
    return ThemeModel.findOne({ isActive: true }).lean().exec();
  }

  async findBySlug(slug) {
    return ThemeModel.findOne({ slug }).lean().exec();
  }

  async findById(id) {
    return ThemeModel.findById(id).lean().exec();
  }

  async list() {
    return ThemeModel.find().sort({ isPreset: -1, name: 1 }).lean().exec();
  }

  async create(data) {
    const theme = await ThemeModel.create(data);
    return theme.toObject();
  }

  async updateById(id, update, { session } = {}) {
    return ThemeModel.findByIdAndUpdate(id, update, { new: true, runValidators: true, session })
      .lean()
      .exec();
  }

  async deleteById(id) {
    return ThemeModel.findByIdAndDelete(id).lean().exec();
  }

  async deactivateAllExcept(id, { session } = {}) {
    return ThemeModel.updateMany({ _id: { $ne: id }, isActive: true }, { $set: { isActive: false } }, { session }).exec();
  }

  async upsertPreset(preset) {
    return ThemeModel.findOneAndUpdate(
      { slug: preset.slug },
      { $setOnInsert: { ...preset, isPreset: true } },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    )
      .lean()
      .exec();
  }

  async count() {
    return ThemeModel.countDocuments().exec();
  }

  /** A scheduled theme whose window has opened but which is not live yet. */
  async findDueToActivate(now = new Date()) {
    return ThemeModel.findOne({
      isActive: false,
      scheduledFrom: { $ne: null, $lte: now },
      $or: [{ scheduledUntil: null }, { scheduledUntil: { $gte: now } }],
    })
      .sort({ scheduledFrom: -1 })
      .lean()
      .exec();
  }

  /** The live theme, if its scheduled window has closed. */
  async findExpiredActive(now = new Date()) {
    return ThemeModel.findOne({
      isActive: true,
      scheduledUntil: { $ne: null, $lt: now },
    })
      .lean()
      .exec();
  }
}

export const themeRepository = new ThemeRepository();
