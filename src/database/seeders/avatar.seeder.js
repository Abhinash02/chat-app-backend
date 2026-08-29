import { logger } from '#src/config/logger.js';
import { UserModel } from '#src/modules/users/user.model.js';
import { generateAvatar } from '#src/modules/users/avatar.constants.js';

/**
 * Gives a generated avatar to accounts created before avatars existed.
 *
 * Idempotent — it only touches rows where `avatarEmoji` is missing, so running
 * it repeatedly is harmless and it will not overwrite anyone's assigned emoji.
 * Each user is updated individually because the emoji is randomised per
 * account; a bulk update would give everyone the same one.
 */
export async function backfillAvatars() {
  const users = await UserModel.find({
    $or: [{ avatarEmoji: null }, { avatarEmoji: { $exists: false } }],
  })
    .select('_id gender')
    .lean()
    .exec();

  if (users.length === 0) {
    logger.info('Every account already has an avatar');
    return 0;
  }

  const operations = users.map((user) => {
    const avatar = generateAvatar(user.gender);

    return {
      updateOne: {
        filter: { _id: user._id },
        update: { $set: { avatarEmoji: avatar.emoji, avatarColor: avatar.color } },
      },
    };
  });

  await UserModel.bulkWrite(operations, { ordered: false });
  logger.info({ count: users.length }, 'Backfilled avatars');

  return users.length;
}
