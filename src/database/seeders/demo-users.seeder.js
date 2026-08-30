import { GENDER, USER_STATUS } from '#src/common/constants/index.js';
import { hashPassword } from '#src/common/utils/crypto.util.js';
import { logger } from '#src/config/logger.js';
import { coinsService } from '#src/modules/coins/coins.service.js';
import { COIN_TRANSACTION_TYPE } from '#src/modules/coins/coins.constants.js';
import { generateAvatar } from '#src/modules/users/avatar.constants.js';
import { userRepository } from '#src/modules/users/user.repository.js';

const DEMO_PASSWORD = 'Demo@12345';

/**
 * Ready-to-use accounts for trying the app end to end.
 *
 * They are created already verified, which is the point: without working email
 * there is no way to get past the OTP screen, and a developer should not have
 * to read a code out of the server log every time they want to sign in.
 *
 * A boy and a girl, because the product only shows you the opposite gender —
 * one account alone can never demonstrate discovery or chat.
 */
const DEMO_USERS = [
  {
    name: 'Rahul Verma',
    nickname: 'rahul',
    email: 'rahul@demo.app',
    gender: GENDER.MALE,
    bio: 'Cricket, biryani and long conversations.',
    interests: ['cricket', 'music', 'travel'],
    // Enough to exercise the billing path without immediately running dry.
    coins: 200,
  },
  {
    name: 'Priya Sharma',
    nickname: 'priya',
    email: 'priya@demo.app',
    gender: GENDER.FEMALE,
    bio: 'Dancer, reader, and terrible at chess.',
    interests: ['dance', 'books', 'movies'],
    // Girls are never charged, so a balance here would be meaningless.
    coins: 0,
  },
  {
    name: 'Neha Kapoor',
    nickname: 'neha',
    email: 'neha@demo.app',
    gender: GENDER.FEMALE,
    bio: 'Coffee first, conversation second.',
    interests: ['coffee', 'photography'],
    coins: 0,
  },
];

export async function seedDemoUsers() {
  const created = [];

  for (const demo of DEMO_USERS) {
    const existing = await userRepository.findByEmail(demo.email);

    if (existing) {
      // Never overwrite a live account, but do make sure it is usable: a demo
      // account that drifted into `pending_verification` defeats the purpose.
      if (existing.status !== USER_STATUS.ACTIVE) {
        await userRepository.updateById(existing._id, {
          $set: { status: USER_STATUS.ACTIVE, emailVerifiedAt: new Date() },
        });
      }

      created.push({ ...demo, existed: true });
      continue;
    }

    const avatar = generateAvatar(demo.gender);

    const user = await userRepository.create({
      name: demo.name,
      nickname: demo.nickname,
      email: demo.email,
      gender: demo.gender,
      bio: demo.bio,
      interests: demo.interests,
      passwordHash: await hashPassword(DEMO_PASSWORD),
      status: USER_STATUS.ACTIVE,
      emailVerifiedAt: new Date(),
      avatarEmoji: avatar.emoji,
      avatarColor: avatar.color,
    });

    await coinsService.ensureWallet({ userId: user._id, gender: user.gender });

    if (demo.coins > 0) {
      await coinsService.creditCoins({
        userId: user._id,
        gender: user.gender,
        amount: demo.coins,
        type: COIN_TRANSACTION_TYPE.ADMIN_CREDIT,
        description: 'Demo account starting balance',
      });
    }

    created.push({ ...demo, existed: false });
  }

  logger.info({ count: created.length }, 'Demo accounts ready');
  return { users: created, password: DEMO_PASSWORD };
}

export { DEMO_PASSWORD, DEMO_USERS };
