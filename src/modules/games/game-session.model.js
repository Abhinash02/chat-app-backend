import mongoose from 'mongoose';

import { GAME_KEYS, GAME_SESSION_STATUS } from '#src/modules/games/game.constants.js';

const gameSessionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    gameKey: { type: String, enum: GAME_KEYS, required: true },

    status: {
      type: String,
      enum: Object.values(GAME_SESSION_STATUS),
      default: GAME_SESSION_STATUS.IN_PROGRESS,
      index: true,
    },

    score: { type: Number, default: 0, min: 0 },
    pointsAwarded: { type: Number, default: 0, min: 0 },

    /** Server-stamped, so elapsed time cannot be forged by the client. */
    startedAt: { type: Date, default: Date.now },
    completedAt: { type: Date, default: null },
    durationMs: { type: Number, default: null },

    /** Set when a submission is rejected, for support and abuse review. */
    rejectionReason: { type: String, default: null },
  },
  { timestamps: true },
);

gameSessionSchema.index({ userId: 1, createdAt: -1 });
gameSessionSchema.index({ userId: 1, gameKey: 1, status: 1 });

export const GameSessionModel = mongoose.model('GameSession', gameSessionSchema);
