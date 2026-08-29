import { GENDER, USER_ROLE, USER_STATUS } from '#src/common/constants/index.js';
import { hashPassword } from '#src/common/utils/crypto.util.js';
import { env } from '#src/config/env.js';
import { logger } from '#src/config/logger.js';
import { userRepository } from '#src/modules/users/user.repository.js';

/**
 * Creates the bootstrap administrator. Idempotent, and it never overwrites an
 * existing account — so re-running the seeder cannot reset a live admin's
 * password back to the value in `.env`.
 */
export async function seedAdminUser() {
  const existing = await userRepository.findByEmail(env.SEED_ADMIN_EMAIL);

  if (existing) {
    logger.info({ email: env.SEED_ADMIN_EMAIL }, 'Admin account already exists; skipping');
    return existing;
  }

  const admin = await userRepository.create({
    name: 'Administrator',
    nickname: 'admin',
    email: env.SEED_ADMIN_EMAIL,
    passwordHash: await hashPassword(env.SEED_ADMIN_PASSWORD),
    // The admin never appears in discovery, but the field is required.
    gender: GENDER.MALE,
    role: USER_ROLE.SUPER_ADMIN,
    status: USER_STATUS.ACTIVE,
    emailVerifiedAt: new Date(),
  });

  logger.warn(
    { email: env.SEED_ADMIN_EMAIL },
    'Seeded the bootstrap admin account. Change this password before going live.',
  );

  return admin;
}
