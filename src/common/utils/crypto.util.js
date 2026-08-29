import crypto from 'node:crypto';

import bcrypt from 'bcryptjs';

import { env } from '#src/config/env.js';

export async function hashPassword(plainPassword) {
  return bcrypt.hash(plainPassword, env.BCRYPT_ROUNDS);
}

export async function verifyPassword(plainPassword, passwordHash) {
  if (!passwordHash) return false;
  return bcrypt.compare(plainPassword, passwordHash);
}

/** Numeric one-time code, uniformly distributed over the full range. */
export function generateNumericCode(length = 6) {
  const max = 10 ** length;
  return String(crypto.randomInt(0, max)).padStart(length, '0');
}

/**
 * OTPs and refresh tokens are stored as SHA-256 digests: they are
 * high-entropy and short-lived, so bcrypt's work factor buys nothing here.
 */
export function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

export function generateOpaqueToken(bytes = 48) {
  return crypto.randomBytes(bytes).toString('hex');
}

/** Constant-time comparison that tolerates differing lengths. */
export function safeCompare(a, b) {
  const bufferA = Buffer.from(String(a));
  const bufferB = Buffer.from(String(b));
  if (bufferA.length !== bufferB.length) return false;
  return crypto.timingSafeEqual(bufferA, bufferB);
}
