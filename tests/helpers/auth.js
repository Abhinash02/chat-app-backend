import { signAccessToken } from '#src/common/utils/jwt.util.js';

/**
 * Mints an access token for an existing user document.
 *
 * The full register/verify/login dance is covered by the auth e2e suite; other
 * suites should not have to repeat it just to reach an authenticated endpoint.
 * The token is produced by the same signer the application uses, so the
 * authentication middleware is still genuinely exercised.
 */
export function authHeaderFor(user) {
  const token = signAccessToken({ userId: user._id, role: user.role, gender: user.gender });
  return { Authorization: `Bearer ${token}` };
}
