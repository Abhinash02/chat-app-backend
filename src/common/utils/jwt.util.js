import jwt from 'jsonwebtoken';

import { UnauthorizedError } from '#src/common/errors/index.js';
import { env } from '#src/config/env.js';

const ISSUER = 'vibe-chat';

export const TOKEN_TYPE = Object.freeze({
  ACCESS: 'access',
  REFRESH: 'refresh',
});

export function signAccessToken({ userId, role, gender }) {
  return jwt.sign({ sub: String(userId), role, gender, type: TOKEN_TYPE.ACCESS }, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_TTL,
    issuer: ISSUER,
  });
}

export function signRefreshToken({ userId, sessionId }) {
  return jwt.sign({ sub: String(userId), sid: sessionId, type: TOKEN_TYPE.REFRESH }, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_TTL,
    issuer: ISSUER,
  });
}

function verify(token, secret, expectedType) {
  let payload;
  try {
    payload = jwt.verify(token, secret, { issuer: ISSUER });
  } catch (error) {
    const isExpired = error instanceof jwt.TokenExpiredError;
    throw new UnauthorizedError(
      isExpired ? 'Session expired, please sign in again' : 'Invalid authentication token',
      isExpired ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN',
    );
  }

  if (payload.type !== expectedType) {
    throw new UnauthorizedError('Invalid authentication token', 'INVALID_TOKEN');
  }

  return payload;
}

export function verifyAccessToken(token) {
  return verify(token, env.JWT_ACCESS_SECRET, TOKEN_TYPE.ACCESS);
}

export function verifyRefreshToken(token) {
  return verify(token, env.JWT_REFRESH_SECRET, TOKEN_TYPE.REFRESH);
}
