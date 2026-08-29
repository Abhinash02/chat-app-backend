import mongoose from 'mongoose';

import { OTP_PURPOSE } from '#src/modules/auth/auth.constants.js';

/**
 * One-time codes are stored as SHA-256 digests, never in clear text — a leaked
 * database dump must not let anyone verify someone else's account.
 */
const otpSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    purpose: { type: String, enum: Object.values(OTP_PURPOSE), required: true },
    codeHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    attempts: { type: Number, default: 0, min: 0 },
    consumedAt: { type: Date, default: null },
    lastSentAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

otpSchema.index({ userId: 1, purpose: 1 });
// Mongo removes expired codes on its own; nothing here needs a cleanup job.
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const OtpModel = mongoose.model('Otp', otpSchema);
