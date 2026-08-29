import mongoose from 'mongoose';

/**
 * One row per signed-in device. Storing the digest lets us revoke a single
 * session (sign out one phone) without invalidating the others, and makes a
 * stolen database dump useless for impersonation.
 */
const refreshTokenSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    sessionId: { type: String, required: true, unique: true },
    tokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    /** Set when a token is rotated, so reuse of an old token is detectable. */
    replacedBySessionId: { type: String, default: null },
    userAgent: { type: String, maxlength: 300, default: '' },
    ipAddress: { type: String, maxlength: 64, default: '' },
    lastUsedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

refreshTokenSchema.index({ userId: 1, revokedAt: 1 });
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RefreshTokenModel = mongoose.model('RefreshToken', refreshTokenSchema);
