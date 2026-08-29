import { connectDatabase, disconnectDatabase } from '#src/config/database.js';
import { logger } from '#src/config/logger.js';
import { settingsService } from '#src/modules/settings/settings.service.js';
import { campaignService } from '#src/modules/notifications/campaign.service.js';
import { themeService } from '#src/modules/theme/theme.service.js';
import { seedAdminUser } from '#src/database/seeders/admin.seeder.js';
import { seedCoinPackages } from '#src/database/seeders/coin-package.seeder.js';

/**
 * Brings an empty database up to a usable state: settings row, theme presets,
 * coin packs and one administrator. Safe to run more than once.
 */
export async function runSeeders() {
  await settingsService.getSettings({ forceRefresh: true });
  await themeService.ensurePresetsSeeded();
  await campaignService.ensureSystemTemplatesSeeded();
  await seedCoinPackages();
  await seedAdminUser();
}

const isDirectRun = process.argv[1]?.endsWith('seeders/index.js');

if (isDirectRun) {
  connectDatabase()
    .then(runSeeders)
    .then(async () => {
      logger.info('Seeding complete');
      await disconnectDatabase();
      process.exit(0);
    })
    .catch(async (error) => {
      logger.fatal({ err: error }, 'Seeding failed');
      await disconnectDatabase().catch(() => undefined);
      process.exit(1);
    });
}
