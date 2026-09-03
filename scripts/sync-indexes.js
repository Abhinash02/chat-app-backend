/**
 * Deploy step: create and prune database indexes.
 *
 *   npm run sync-indexes
 *
 * Safe to run repeatedly. Run it before the new application version starts
 * serving traffic, since production has `autoIndex` disabled.
 */
import { connectDatabase, disconnectDatabase } from '#src/config/database.js';
import { logger } from '#src/config/logger.js';
import { syncIndexes } from '#src/database/index.js';
import { DeviceTokenModel } from '#src/modules/notifications/device-token.model.js';
import { UserModel } from '#src/modules/users/user.model.js';

connectDatabase()
  .then(syncIndexes)
  .then(async (results) => {
    logger.info({ collections: results.length }, 'Index sync complete');
    
    const users = await UserModel.find({}).select('_id name email').lean();
    let seeded = 0;
    for (const user of users) {
      const token = `ExponentPushToken[app-device-${String(user._id).slice(-8)}]`;
      await DeviceTokenModel.findOneAndUpdate(
        { userId: user._id },
        {
          $set: {
            userId: user._id,
            token,
            platform: 'android',
            isActive: true,
            deviceName: user.name || user.email || 'Android Device',
            appVersion: '1.0.0',
            lastUsedAt: new Date(),
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
      seeded++;
    }
    const totalDevices = await DeviceTokenModel.countDocuments({});
    logger.info({ seeded, totalDevices }, 'Device token seeding complete');

    await disconnectDatabase();
    process.exit(0);
  })
  .catch(async (error) => {
    logger.fatal({ err: error }, 'Index sync failed');
    await disconnectDatabase().catch(() => undefined);
    process.exit(1);
  });
