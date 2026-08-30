import { GENDER, USER_STATUS } from '#src/common/constants/index.js';
import { hashPassword } from '#src/common/utils/crypto.util.js';
import { logger } from '#src/config/logger.js';
import { coinsService } from '#src/modules/coins/coins.service.js';
import { COIN_TRANSACTION_TYPE } from '#src/modules/coins/coins.constants.js';
import { generateAvatar } from '#src/modules/users/avatar.constants.js';
import { userRepository } from '#src/modules/users/user.repository.js';
import { UserModel } from '#src/modules/users/user.model.js';

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
  // Two boys, so you can sign in as one and still see the other side working.
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
    name: 'Arjun Mehta',
    nickname: 'arjun',
    email: 'arjun@demo.app',
    gender: GENDER.MALE,
    bio: 'Guitar, road trips, terrible jokes.',
    interests: ['music', 'travel'],
    coins: 60,
  },

  /*
   * Eight girls, because the discovery grid is two columns and a handful of
   * cards is the only way to see how it actually behaves — with two, you
   * cannot tell a working feed from a broken one.
   *
   * Girls are never charged, so a coin balance here would be meaningless.
   */
  {
    name: 'Priya Sharma',
    nickname: 'priya',
    email: 'priya@demo.app',
    gender: GENDER.FEMALE,
    bio: 'Dancer, reader, and terrible at chess.',
    interests: ['dance', 'books', 'movies'],
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
  {
    name: 'Aisha Khan',
    nickname: 'aisha',
    email: 'aisha@demo.app',
    gender: GENDER.FEMALE,
    bio: 'Painting, poetry and late-night playlists.',
    interests: ['art', 'music'],
    coins: 0,
  },
  {
    name: 'Sneha Reddy',
    nickname: 'sneha',
    email: 'sneha@demo.app',
    gender: GENDER.FEMALE,
    bio: 'Foodie. Will judge your biryani.',
    interests: ['food', 'travel'],
    coins: 0,
  },
  {
    name: 'Meera Nair',
    nickname: 'meera',
    email: 'meera@demo.app',
    gender: GENDER.FEMALE,
    bio: 'Runs at 5am. Regrets it by 6.',
    interests: ['fitness', 'books'],
    coins: 0,
  },
  {
    name: 'Kavya Iyer',
    nickname: 'kavya',
    email: 'kavya@demo.app',
    gender: GENDER.FEMALE,
    bio: 'Films, filter coffee, and long arguments about both.',
    interests: ['movies', 'coffee'],
    coins: 0,
  },
  {
    name: 'Ananya Bose',
    nickname: 'ananya',
    email: 'ananya@demo.app',
    gender: GENDER.FEMALE,
    bio: 'Designer by day, gamer by night.',
    interests: ['design', 'gaming'],
    coins: 0,
  },
  {
    name: 'Riya Malhotra',
    nickname: 'riya',
    email: 'riya@demo.app',
    gender: GENDER.FEMALE,
    bio: 'Dogs, dosas, and dramatic weather.',
    interests: ['pets', 'food'],
    coins: 0,
  },
];

/**
 * Marks demo accounts as online.
 *
 * Presence is normally reference-counted from live socket connections, and the
 * server clears it at boot — so this is a deliberate lie, and only worth
 * telling for accounts that exist to make the UI demonstrable. Restarting the
 * API resets it; re-run the seeder to set it again.
 *
 * It is scoped to `@demo.app` addresses so it can never touch a real account.
 */
async function markDemoAccountsOnline() {
  const result = await UserModel.updateMany(
    { email: { $regex: '@demo\\.app$' } },
    { $set: { isOnline: true, lastSeenAt: new Date() } },
  ).exec();

  return result.modifiedCount;
}

export async function seedDemoUsers({ markOnline = true } = {}) {
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

  const onlineCount = markOnline ? await markDemoAccountsOnline() : 0;

  logger.info({ count: created.length, onlineCount }, 'Demo accounts ready');
  return { users: created, password: DEMO_PASSWORD, onlineCount };
}

export { DEMO_PASSWORD, DEMO_USERS };
