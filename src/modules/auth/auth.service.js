import crypto from 'node:crypto';

import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  TooManyRequestsError,
  UnauthorizedError,
} from '#src/common/errors/index.js';
import { USER_ROLE, USER_STATUS } from '#src/common/constants/index.js';
import {
  generateNumericCode,
  hashPassword,
  sha256,
  safeCompare,
  verifyPassword,
} from '#src/common/utils/crypto.util.js';
import { addMinutes, parseDurationToMs } from '#src/common/utils/date.util.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '#src/common/utils/jwt.util.js';
import { env } from '#src/config/env.js';
import { logger } from '#src/config/logger.js';
import { emailService } from '#src/integrations/email/email.service.js';
import { coinsService } from '#src/modules/coins/coins.service.js';
import { settingsService } from '#src/modules/settings/settings.service.js';
import { themeService } from '#src/modules/theme/theme.service.js';
import { userRepository } from '#src/modules/users/user.repository.js';
import { generateAvatar } from '#src/modules/users/avatar.constants.js';
import { authRepository } from '#src/modules/auth/auth.repository.js';
import {
  OTP_LENGTH,
  OTP_MAX_ATTEMPTS,
  OTP_PURPOSE,
  OTP_RESEND_COOLDOWN_SECONDS,
  OTP_TTL_MINUTES,
} from '#src/modules/auth/auth.constants.js';

async function getAppName() {
  const theme = await themeService.getActiveTheme();
  return theme?.branding?.appName ?? 'Vibe';
}

function toAuthUser(user) {
  return {
    id: String(user._id),
    name: user.name,
    nickname: user.nickname,
    email: user.email,
    gender: user.gender,
    role: user.role,
    status: user.status,
    avatarUrl: user.avatarUrl ?? null,
    avatarEmoji: user.avatarEmoji ?? null,
    avatarColor: user.avatarColor ?? null,
    bio: user.bio ?? '',
    isEmailVerified: Boolean(user.emailVerifiedAt),
    createdAt: user.createdAt,
  };
}

async function issueSession({ user, userAgent = '', ipAddress = '' }) {
  const sessionId = crypto.randomUUID();
  const refreshToken = signRefreshToken({ userId: user._id, sessionId });

  await authRepository.createSession({
    userId: user._id,
    sessionId,
    tokenHash: sha256(refreshToken),
    expiresAt: new Date(Date.now() + parseDurationToMs(env.JWT_REFRESH_TTL)),
    userAgent: String(userAgent).slice(0, 300),
    ipAddress: String(ipAddress).slice(0, 64),
  });

  return {
    accessToken: signAccessToken({ userId: user._id, role: user.role, gender: user.gender }),
    refreshToken,
    expiresIn: Math.floor(parseDurationToMs(env.JWT_ACCESS_TTL) / 1000),
  };
}

/**
 * Issues a code, stores only its digest, and mails the clear-text copy.
 * The cooldown is enforced here rather than only by the HTTP rate limiter,
 * because the same path is reachable from login and password reset.
 */
async function issueOtp({ user, purpose }) {
  const existing = await authRepository.findLatestOtp({ userId: user._id, purpose });

  if (existing?.lastSentAt) {
    const elapsedSeconds = (Date.now() - new Date(existing.lastSentAt).getTime()) / 1000;
    if (elapsedSeconds < OTP_RESEND_COOLDOWN_SECONDS) {
      throw new TooManyRequestsError(
        `Please wait ${Math.ceil(OTP_RESEND_COOLDOWN_SECONDS - elapsedSeconds)} seconds before requesting another code`,
        'OTP_COOLDOWN',
        { retryAfterSeconds: Math.ceil(OTP_RESEND_COOLDOWN_SECONDS - elapsedSeconds) },
      );
    }
  }

  const code = generateNumericCode(OTP_LENGTH);

  await authRepository.upsertOtp({
    userId: user._id,
    email: user.email,
    purpose,
    codeHash: sha256(code),
    expiresAt: addMinutes(new Date(), OTP_TTL_MINUTES),
  });

  const appName = await getAppName();
  const payload = {
    to: user.email,
    name: user.name,
    code,
    expiresInMinutes: OTP_TTL_MINUTES,
    appName,
  };

  const result =
    purpose === OTP_PURPOSE.PASSWORD_RESET
      ? await emailService.sendPasswordResetCode(payload)
      : await emailService.sendVerificationCode(payload);

  return { delivered: result.delivered, expiresInMinutes: OTP_TTL_MINUTES };
}

/**
 * Validates a submitted code. Wrong guesses are counted and the code is burned
 * once the limit is hit, so a 6-digit code cannot be brute forced.
 */
async function consumeOtp({ userId, purpose, code }) {
  const otp = await authRepository.findActiveOtp({ userId, purpose });

  if (!otp) {
    throw new BadRequestError('This code is no longer valid. Request a new one.', 'OTP_NOT_FOUND');
  }

  if (new Date(otp.expiresAt).getTime() <= Date.now()) {
    throw new BadRequestError('This code has expired. Request a new one.', 'OTP_EXPIRED');
  }

  if (otp.attempts >= OTP_MAX_ATTEMPTS) {
    await authRepository.consumeOtp(otp._id);
    throw new TooManyRequestsError('Too many incorrect codes. Request a new one.', 'OTP_ATTEMPTS_EXCEEDED');
  }

  if (!safeCompare(sha256(code), otp.codeHash)) {
    const updated = await authRepository.incrementOtpAttempts(otp._id);
    const remaining = Math.max(0, OTP_MAX_ATTEMPTS - (updated?.attempts ?? 0));
    throw new BadRequestError('That code is incorrect', 'OTP_INVALID', { attemptsRemaining: remaining });
  }

  const consumed = await authRepository.consumeOtp(otp._id);
  if (!consumed) {
    // Another request consumed the same code first.
    throw new BadRequestError('This code has already been used', 'OTP_ALREADY_USED');
  }

  return true;
}

/**
 * Creates the account and signs the user straight in.
 *
 * A session is issued before the email is verified, so signup lands on the app
 * rather than on a "check your inbox" wall. The code is still sent and the
 * account stays `pending_verification` until it is used — what that status
 * blocks is an admin decision (`chat.requireVerifiedEmail`), not a hard-coded
 * one. The trade is deliberate: fewer people abandon signup, at the cost of
 * throwaway accounts being cheaper to create.
 */
export async function register({ name, nickname, email, password, gender, userAgent, ipAddress }) {
  if (await userRepository.existsByEmail(email)) {
    throw new ConflictError('An account with this email already exists', 'EMAIL_TAKEN');
  }

  if (await userRepository.existsByNickname(nickname)) {
    throw new ConflictError('That nickname is taken, try another', 'NICKNAME_TAKEN');
  }

  // Everyone gets a face immediately; a real photo is an optional upgrade.
  const avatar = generateAvatar(gender);

  const user = await userRepository.create({
    name,
    nickname,
    email,
    gender,
    passwordHash: await hashPassword(password),
    role: USER_ROLE.USER,
    status: USER_STATUS.PENDING_VERIFICATION,
    avatarEmoji: avatar.emoji,
    avatarColor: avatar.color,
  });

  await coinsService.ensureWallet({ userId: user._id, gender: user.gender });

  // A failed send must not fail the signup — the user is already inside and can
  // ask for another code from the banner.
  const otp = await issueOtp({ user, purpose: OTP_PURPOSE.EMAIL_VERIFICATION }).catch((error) => {
    logger.warn({ err: error, userId: String(user._id) }, 'Verification email failed at signup');
    return { delivered: false, expiresInMinutes: OTP_TTL_MINUTES };
  });

  const tokens = await issueSession({ user, userAgent, ipAddress });

  logger.info({ userId: String(user._id), gender }, 'User registered');

  return {
    user: toAuthUser(user),
    tokens,
    verification: { required: true, pending: true, email: user.email, ...otp },
  };
}

export async function verifyEmail({ email, code, userAgent, ipAddress }) {
  const user = await userRepository.findByEmail(email);
  if (!user) throw new BadRequestError('This code is no longer valid. Request a new one.', 'OTP_NOT_FOUND');

  if (user.status === USER_STATUS.SUSPENDED) {
    throw new ForbiddenError('Your account has been suspended', 'ACCOUNT_SUSPENDED');
  }

  if (user.emailVerifiedAt) {
    // Already verified: treat as success and hand back a session so a retried
    // request from a flaky network does not strand the user on the OTP screen.
    const tokens = await issueSession({ user, userAgent, ipAddress });
    return { user: toAuthUser(user), tokens, alreadyVerified: true };
  }

  await consumeOtp({ userId: user._id, purpose: OTP_PURPOSE.EMAIL_VERIFICATION, code });

  const verified = await userRepository.updateById(user._id, {
    $set: { status: USER_STATUS.ACTIVE, emailVerifiedAt: new Date(), lastLoginAt: new Date() },
  });

  await coinsService.ensureWallet({ userId: verified._id, gender: verified.gender });

  const [appName, coinSettings] = await Promise.all([getAppName(), settingsService.getCoinSettings()]);
  // Fire and forget: a failed welcome email must not fail verification.
  emailService
    .sendWelcome({
      to: verified.email,
      name: verified.name,
      appName,
      freeTalkMinutes: coinSettings.freeTalkMinutes,
    })
    .catch((error) => logger.warn({ err: error }, 'Welcome email failed'));

  const tokens = await issueSession({ user: verified, userAgent, ipAddress });
  logger.info({ userId: String(verified._id) }, 'Email verified');

  return { user: toAuthUser(verified), tokens, alreadyVerified: false };
}

export async function resendVerificationCode({ email }) {
  const user = await userRepository.findByEmail(email);

  // Never reveal whether the address is registered.
  if (!user || user.emailVerifiedAt) {
    return { sent: true, expiresInMinutes: OTP_TTL_MINUTES };
  }

  const otp = await issueOtp({ user, purpose: OTP_PURPOSE.EMAIL_VERIFICATION });
  return { sent: true, ...otp };
}

export async function login({ email, password, userAgent, ipAddress }) {
  const user = await userRepository.findByEmail(email, { includePassword: true });

  // Same generic message whether the email is unknown or the password is wrong.
  const invalidCredentials = new UnauthorizedError('Email or password is incorrect', 'INVALID_CREDENTIALS');
  if (!user) throw invalidCredentials;

  const passwordMatches = await verifyPassword(password, user.passwordHash);
  if (!passwordMatches) throw invalidCredentials;

  if (user.status === USER_STATUS.SUSPENDED) {
    throw new ForbiddenError(
      user.suspendedReason || 'Your account has been suspended',
      'ACCOUNT_SUSPENDED',
    );
  }

  if (user.status === USER_STATUS.DELETED) throw invalidCredentials;

  if (!user.emailVerifiedAt) {
    // Re-send the code so the app can go straight to the OTP screen. The
    // cooldown may reject it, which is fine — the client shows "check inbox".
    await issueOtp({ user, purpose: OTP_PURPOSE.EMAIL_VERIFICATION }).catch(() => undefined);
    throw new ForbiddenError('Please verify your email address to continue', 'EMAIL_NOT_VERIFIED', {
      email: user.email,
    });
  }

  await coinsService.ensureWallet({ userId: user._id, gender: user.gender });
  await userRepository.updateById(user._id, { $set: { lastLoginAt: new Date() } });

  const tokens = await issueSession({ user, userAgent, ipAddress });
  return { user: toAuthUser(user), tokens };
}

/**
 * Rotates the refresh token. Presenting an already-revoked token is treated as
 * theft: every session for that account is dropped.
 */
export async function refreshSession({ refreshToken, userAgent, ipAddress }) {
  const payload = verifyRefreshToken(refreshToken);
  const session = await authRepository.findSession(payload.sid);

  if (!session) throw new UnauthorizedError('Session expired, please sign in again', 'SESSION_NOT_FOUND');

  if (session.revokedAt) {
    await authRepository.revokeAllSessionsForUser(session.userId);
    logger.warn({ userId: String(session.userId) }, 'Reused refresh token detected; all sessions revoked');
    throw new UnauthorizedError('Session expired, please sign in again', 'SESSION_REVOKED');
  }

  if (!safeCompare(sha256(refreshToken), session.tokenHash)) {
    throw new UnauthorizedError('Session expired, please sign in again', 'SESSION_INVALID');
  }

  const user = await userRepository.findById(session.userId);
  if (!user || user.status === USER_STATUS.DELETED) {
    throw new UnauthorizedError('Account no longer exists', 'ACCOUNT_NOT_FOUND');
  }

  if (user.status === USER_STATUS.SUSPENDED) {
    throw new ForbiddenError('Your account has been suspended', 'ACCOUNT_SUSPENDED');
  }

  const tokens = await issueSession({ user, userAgent, ipAddress });
  const newSessionId = verifyRefreshToken(tokens.refreshToken).sid;
  await authRepository.revokeSession(session.sessionId, { replacedBySessionId: newSessionId });

  return { user: toAuthUser(user), tokens };
}

export async function logout({ refreshToken }) {
  if (!refreshToken) return { loggedOut: true };

  try {
    const payload = verifyRefreshToken(refreshToken);
    await authRepository.revokeSession(payload.sid);
  } catch {
    // An expired or malformed token is already unusable; nothing to revoke.
  }

  return { loggedOut: true };
}

export async function logoutAllDevices({ userId }) {
  await authRepository.revokeAllSessionsForUser(userId);
  await userRepository.updateById(userId, { $set: { tokensValidFrom: new Date() } });
  return { loggedOut: true };
}

export async function listSessions({ userId }) {
  return authRepository.listActiveSessions(userId);
}

export async function requestPasswordReset({ email }) {
  const user = await userRepository.findByEmail(email);

  // Always the same answer, so this endpoint cannot enumerate accounts.
  if (!user || user.status === USER_STATUS.DELETED) {
    return { sent: true, expiresInMinutes: OTP_TTL_MINUTES };
  }

  try {
    const otp = await issueOtp({ user, purpose: OTP_PURPOSE.PASSWORD_RESET });
    return { sent: true, ...otp };
  } catch (error) {
    // A cooldown must not leak that the address exists either.
    if (error.code === 'OTP_COOLDOWN') return { sent: true, expiresInMinutes: OTP_TTL_MINUTES };
    throw error;
  }
}

export async function resetPassword({ email, code, newPassword }) {
  const user = await userRepository.findByEmail(email);
  if (!user) throw new BadRequestError('This code is no longer valid. Request a new one.', 'OTP_NOT_FOUND');

  await consumeOtp({ userId: user._id, purpose: OTP_PURPOSE.PASSWORD_RESET, code });

  await userRepository.updateById(user._id, {
    $set: {
      passwordHash: await hashPassword(newPassword),
      // Invalidates every access token minted before this moment.
      tokensValidFrom: new Date(),
      // A reset also proves ownership of the mailbox.
      ...(user.emailVerifiedAt ? {} : { emailVerifiedAt: new Date(), status: USER_STATUS.ACTIVE }),
    },
  });

  await authRepository.revokeAllSessionsForUser(user._id);
  logger.info({ userId: String(user._id) }, 'Password reset completed');

  return { reset: true };
}

export async function changePassword({ userId, currentPassword, newPassword }) {
  const user = await userRepository.findById(userId, { includePassword: true });
  if (!user) throw new UnauthorizedError('Account no longer exists', 'ACCOUNT_NOT_FOUND');

  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    throw new BadRequestError('Your current password is incorrect', 'INVALID_CURRENT_PASSWORD');
  }

  if (await verifyPassword(newPassword, user.passwordHash)) {
    throw new BadRequestError('Choose a password you have not used before', 'PASSWORD_REUSED');
  }

  await userRepository.updateById(user._id, {
    $set: { passwordHash: await hashPassword(newPassword), tokensValidFrom: new Date() },
  });

  await authRepository.revokeAllSessionsForUser(user._id);
  return { changed: true };
}

export async function getCurrentUser({ userId }) {
  const user = await userRepository.findById(userId);
  if (!user) throw new UnauthorizedError('Account no longer exists', 'ACCOUNT_NOT_FOUND');
  return toAuthUser(user);
}

export const authService = {
  register,
  verifyEmail,
  resendVerificationCode,
  login,
  refreshSession,
  logout,
  logoutAllDevices,
  listSessions,
  requestPasswordReset,
  resetPassword,
  changePassword,
  getCurrentUser,
};
