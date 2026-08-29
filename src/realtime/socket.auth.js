import { USER_STATUS } from '#src/common/constants/index.js';
import { verifyAccessToken } from '#src/common/utils/jwt.util.js';
import { logger } from '#src/config/logger.js';
import { UserModel } from '#src/modules/users/user.model.js';

/**
 * Socket handshake authentication.
 *
 * The token is read from `handshake.auth.token` rather than a query string, so
 * it does not end up in proxy or access logs. The account is re-read from the
 * database here for the same reason the HTTP middleware does it: a suspended
 * user must lose their connection without waiting for the token to expire.
 */
export async function authenticateSocket(socket, next) {
  try {
    const rawToken = socket.handshake.auth?.token ?? socket.handshake.headers?.authorization;
    const token =
      typeof rawToken === 'string' && rawToken.startsWith('Bearer ')
        ? rawToken.slice('Bearer '.length).trim()
        : rawToken;

    if (!token) {
      return next(Object.assign(new Error('Authentication required'), { data: { code: 'UNAUTHORIZED' } }));
    }

    const payload = verifyAccessToken(token);

    const user = await UserModel.findById(payload.sub)
      .select('email role gender status nickname name avatarUrl tokensValidFrom')
      .lean()
      .exec();

    if (!user || user.status === USER_STATUS.DELETED) {
      return next(Object.assign(new Error('Account no longer exists'), { data: { code: 'ACCOUNT_NOT_FOUND' } }));
    }

    if (user.status === USER_STATUS.SUSPENDED) {
      return next(Object.assign(new Error('Account suspended'), { data: { code: 'ACCOUNT_SUSPENDED' } }));
    }

    if (user.tokensValidFrom && payload.iat * 1000 < new Date(user.tokensValidFrom).getTime()) {
      return next(Object.assign(new Error('Session expired'), { data: { code: 'TOKEN_REVOKED' } }));
    }

    socket.data.user = {
      id: String(user._id),
      email: user.email,
      role: user.role,
      gender: user.gender,
      status: user.status,
      nickname: user.nickname,
      name: user.name,
      avatarUrl: user.avatarUrl ?? null,
    };

    return next();
  } catch (error) {
    logger.debug({ err: error }, 'Socket authentication rejected');
    return next(Object.assign(new Error('Authentication failed'), { data: { code: 'UNAUTHORIZED' } }));
  }
}
