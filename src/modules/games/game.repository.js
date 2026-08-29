import { GameSessionModel } from '#src/modules/games/game-session.model.js';
import { GAME_SESSION_STATUS } from '#src/modules/games/game.constants.js';

class GameRepository {
  async createSession({ userId, gameKey }) {
    const session = await GameSessionModel.create({ userId, gameKey, startedAt: new Date() });
    return session.toObject();
  }

  async findSessionById(sessionId) {
    return GameSessionModel.findById(sessionId).lean().exec();
  }

  /**
   * Completes a session only while it is still in progress, so a replayed
   * submission cannot award points twice.
   */
  async completeSession({ sessionId, score, pointsAwarded, durationMs }) {
    return GameSessionModel.findOneAndUpdate(
      { _id: sessionId, status: GAME_SESSION_STATUS.IN_PROGRESS },
      {
        $set: {
          status: GAME_SESSION_STATUS.COMPLETED,
          score,
          pointsAwarded,
          durationMs,
          completedAt: new Date(),
        },
      },
      { new: true },
    )
      .lean()
      .exec();
  }

  async rejectSession({ sessionId, reason }) {
    return GameSessionModel.findOneAndUpdate(
      { _id: sessionId, status: GAME_SESSION_STATUS.IN_PROGRESS },
      { $set: { status: GAME_SESSION_STATUS.ABANDONED, rejectionReason: reason, completedAt: new Date() } },
      { new: true },
    )
      .lean()
      .exec();
  }

  async countSessionsSince({ userId, since }) {
    return GameSessionModel.countDocuments({ userId, createdAt: { $gte: since } }).exec();
  }

  async listSessions({ userId, skip = 0, limit = 20 }) {
    const [items, total] = await Promise.all([
      GameSessionModel.find({ userId, status: GAME_SESSION_STATUS.COMPLETED })
        .sort({ completedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      GameSessionModel.countDocuments({ userId, status: GAME_SESSION_STATUS.COMPLETED }).exec(),
    ]);

    return { items, total };
  }

  async findBestScore({ userId, gameKey }) {
    const [best] = await GameSessionModel.find({
      userId,
      gameKey,
      status: GAME_SESSION_STATUS.COMPLETED,
    })
      .sort({ score: -1 })
      .limit(1)
      .lean()
      .exec();

    return best?.score ?? 0;
  }

  async aggregatePlayStats({ since } = {}) {
    const match = { status: GAME_SESSION_STATUS.COMPLETED };
    if (since) match.completedAt = { $gte: since };

    return GameSessionModel.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$gameKey',
          plays: { $sum: 1 },
          totalPoints: { $sum: '$pointsAwarded' },
          averageScore: { $avg: '$score' },
        },
      },
      { $sort: { plays: -1 } },
    ]).exec();
  }
}

export const gameRepository = new GameRepository();
