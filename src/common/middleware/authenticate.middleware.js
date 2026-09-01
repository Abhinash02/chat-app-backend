import { UnauthorizedError, ForbiddenError } from '#src/common/errors/index.js';
import { USER_STATUS } from '#src/common/constants/index.js';
import { verifyAccessToken } from '#src/common/utils/jwt.util.js';
import { asyncHandler } from '#src/common/utils/async-handler.util.js';
import { UserModel } from '#src/modules/users/user.model.js';
import { settingsService } from '#src/modules/settings/settings.service.js';

function extractBearerToken(req) {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    const token = header.slice('Bearer '.length).trim();
    if (token) return token;
  }
  if (req.query?.token) {
    return String(req.query.token).trim() || null;
  }
  return null;
}

/**
 * Establishes `req.user` from the access token. The database is consulted on
 * every request so a suspended or deleted account loses access immediately
 * instead of at token expiry.
 */
export const authenticate = asyncHandler(async (req, _res, next) => {
  const token = extractBearerToken(req);
  if (!token) throw new UnauthorizedError('Authentication required');

  const payload = verifyAccessToken(token);

  const user = await UserModel.findById(payload.sub).select(
    'email role gender status nickname name avatarUrl avatarEmoji avatarColor tokensValidFrom',
  );

  if (!user) throw new UnauthorizedError('Account no longer exists', 'ACCOUNT_NOT_FOUND');

  if (user.status === USER_STATUS.SUSPENDED) {
    throw new ForbiddenError('Your account has been suspended', 'ACCOUNT_SUSPENDED');
  }

  if (user.status === USER_STATUS.DELETED) {
    throw new UnauthorizedError('Account no longer exists', 'ACCOUNT_NOT_FOUND');
  }

  // A password change or forced logout bumps `tokensValidFrom`, invalidating
  // access tokens minted before that moment.
  if (user.tokensValidFrom && payload.iat * 1000 < user.tokensValidFrom.getTime()) {
    throw new UnauthorizedError('Session expired, please sign in again', 'TOKEN_REVOKED');
  }

  req.user = {
    id: String(user._id),
    email: user.email,
    role: user.role,
    gender: user.gender,
    status: user.status,
    nickname: user.nickname,
    name: user.name,
    avatarUrl: user.avatarUrl,
    avatarEmoji: user.avatarEmoji,
    avatarColor: user.avatarColor,
  };

  next();
});

/**
 * Gate for accounts that have not completed email verification.
 *
 * Whether this blocks anything is an admin decision, not a hard-coded one:
 * signup issues a session immediately so people land in the app, and turning
 * `chat.requireVerifiedEmail` on is the lever to tighten that if throwaway
 * accounts become a problem.
 *
 * A suspended or deleted account is refused regardless — that check is not
 * about verification and is never optional.
 */
export const requireVerifiedAccount = asyncHandler(async (req, _res, next) => {
  const status = req.user?.status;

  if (status === USER_STATUS.ACTIVE) return next();

  if (status === USER_STATUS.SUSPENDED || status === USER_STATUS.DELETED) {
    throw new ForbiddenError('Your account is no longer active', 'ACCOUNT_INACTIVE');
  }

  const { chat } = await settingsService.getSettings();

  if (chat.requireVerifiedEmail) {
    throw new ForbiddenError('Please verify your email address to continue', 'EMAIL_NOT_VERIFIED');
  }

  return next();
});
