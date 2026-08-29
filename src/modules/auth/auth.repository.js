import { OtpModel } from '#src/modules/auth/otp.model.js';
import { RefreshTokenModel } from '#src/modules/auth/refresh-token.model.js';

class AuthRepository {
  // ----- One-time codes ---------------------------------------------------

  /**
   * A user has at most one live code per purpose: issuing a new one replaces
   * the old, so an intercepted earlier code stops working immediately.
   */
  async upsertOtp({ userId, email, purpose, codeHash, expiresAt }) {
    return OtpModel.findOneAndUpdate(
      { userId, purpose },
      {
        $set: {
          email,
          codeHash,
          expiresAt,
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

  async findActiveOtp({ userId, purpose }) {
    return OtpModel.findOne({ userId, purpose, consumedAt: null }).lean().exec();
  }

  async findLatestOtp({ userId, purpose }) {
    return OtpModel.findOne({ userId, purpose }).sort({ lastSentAt: -1 }).lean().exec();
  }

  async incrementOtpAttempts(otpId) {
    return OtpModel.findByIdAndUpdate(otpId, { $inc: { attempts: 1 } }, { new: true }).lean().exec();
  }

  async consumeOtp(otpId) {
    return OtpModel.findOneAndUpdate(
      { _id: otpId, consumedAt: null },
      { $set: { consumedAt: new Date() } },
      { new: true },
    )
      .lean()
      .exec();
  }

  async deleteOtps({ userId, purpose }) {
    return OtpModel.deleteMany({ userId, purpose }).exec();
  }

  // ----- Refresh sessions -------------------------------------------------

  async createSession({ userId, sessionId, tokenHash, expiresAt, userAgent, ipAddress }) {
    return RefreshTokenModel.create({
      userId,
      sessionId,
      tokenHash,
      expiresAt,
      userAgent,
      ipAddress,
    });
  }

  async findSession(sessionId) {
    return RefreshTokenModel.findOne({ sessionId }).lean().exec();
  }

  async revokeSession(sessionId, { replacedBySessionId = null } = {}) {
    return RefreshTokenModel.findOneAndUpdate(
      { sessionId, revokedAt: null },
      { $set: { revokedAt: new Date(), replacedBySessionId } },
      { new: true },
    )
      .lean()
      .exec();
  }

  async revokeAllSessionsForUser(userId) {
    return RefreshTokenModel.updateMany(
      { userId, revokedAt: null },
      { $set: { revokedAt: new Date() } },
    ).exec();
  }

  async listActiveSessions(userId) {
    return RefreshTokenModel.find({ userId, revokedAt: null, expiresAt: { $gt: new Date() } })
      .select('sessionId userAgent ipAddress lastUsedAt createdAt')
      .sort({ lastUsedAt: -1 })
      .lean()
      .exec();
  }

  async touchSession(sessionId) {
    return RefreshTokenModel.updateOne({ sessionId }, { $set: { lastUsedAt: new Date() } }).exec();
  }
}

export const authRepository = new AuthRepository();
