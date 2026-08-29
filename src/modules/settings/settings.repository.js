import { SettingsModel } from '#src/modules/settings/settings.model.js';
import { SETTINGS_SINGLETON_KEY } from '#src/modules/settings/settings.constants.js';

class SettingsRepository {
  /** Upsert keeps the singleton row present without a bootstrap migration. */
  async findOrCreate() {
    return SettingsModel.findOneAndUpdate(
      { key: SETTINGS_SINGLETON_KEY },
      { $setOnInsert: { key: SETTINGS_SINGLETON_KEY } },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    )
      .lean()
      .exec();
  }

  /** `update` arrives already flattened to dotted paths so untouched keys survive. */
  async update(update, adminId) {
    return SettingsModel.findOneAndUpdate(
      { key: SETTINGS_SINGLETON_KEY },
      { $set: { ...update, updatedByAdminId: adminId ?? null } },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
    )
      .lean()
      .exec();
  }
}

export const settingsRepository = new SettingsRepository();
