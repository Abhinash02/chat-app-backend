import mongoose from 'mongoose';

import { GENDER, USER_ROLE, USER_STATUS } from '#src/common/constants/index.js';
import { hashPassword } from '#src/common/utils/crypto.util.js';
import { UserModel } from '#src/modules/users/user.model.js';
import { settingsService } from '#src/modules/settings/settings.service.js';
import { themeService } from '#src/modules/theme/theme.service.js';

let counter = 0;

function nextSuffix() {
  counter += 1;
  return `${Date.now().toString(36)}${counter}`;
}

export const TEST_PASSWORD = 'Str0ngPass1';

export async function createUser({
  gender = GENDER.MALE,
  status = USER_STATUS.ACTIVE,
  role = USER_ROLE.USER,
  password = TEST_PASSWORD,
  ...overrides
} = {}) {
  const suffix = nextSuffix();

  return UserModel.create({
    name: overrides.name ?? `Test ${suffix}`,
    nickname: overrides.nickname ?? `user${suffix}`,
    email: overrides.email ?? `user${suffix}@example.com`,
    passwordHash: await hashPassword(password),
    gender,
    role,
    status,
    emailVerifiedAt: status === USER_STATUS.ACTIVE ? new Date() : null,
    ...overrides,
  });
}

/** Shape the auth middleware and services expect on `req.user`. */
export function toRequestUser(user) {
  return {
    id: String(user._id),
    email: user.email,
    role: user.role,
    gender: user.gender,
    status: user.status,
    nickname: user.nickname,
    name: user.name,
    avatarUrl: user.avatarUrl ?? null,
  };
}

/** Wipes every collection so each test file starts from a known empty state. */
export async function resetDatabase() {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((collection) => collection.deleteMany({})));
  settingsService.invalidateSettingsCache();
  themeService.invalidateThemeCache();
}

export async function applySettings(patch) {
  return settingsService.updateSettings(patch, null);
}

/**
 * Plants a known one-time code for a user.
 *
 * OTPs are stored as digests and mailed in clear text, so a test cannot read
 * one back. Writing a code we already know is the honest way to exercise the
 * verification path without weakening the production flow.
 */
export async function setKnownOtp({ userId, purpose, code, email }) {
  const { OtpModel } = await import('#src/modules/auth/otp.model.js');
  const { sha256 } = await import('#src/common/utils/crypto.util.js');

  return OtpModel.findOneAndUpdate(
    { userId, purpose },
    {
      $set: {
        email,
        codeHash: sha256(code),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        attempts: 0,
        consumedAt: null,
        lastSentAt: new Date(),
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  )
    .lean()
    .exec();
}
