import mongoose from 'mongoose';

import { BILLING_OUTCOME } from '#src/modules/coins/coins.constants.js';
import { MESSAGE_TYPE } from '#src/modules/chat/chat.constants.js';

const billingSchema = new mongoose.Schema(
  {
    outcome: { type: String, enum: Object.values(BILLING_OUTCOME), default: null },
    coinsCharged: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
);

const messageSchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
    },
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    recipientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    type: { type: String, enum: Object.values(MESSAGE_TYPE), default: MESSAGE_TYPE.TEXT },
    text: { type: String, required: true, maxlength: 5000 },

    deliveredAt: { type: Date, default: null },
    readAt: { type: Date, default: null },

    /** What this message cost the sender — kept for support and analytics. */
    billing: { type: billingSchema, default: () => ({}) },

    /**
     * Withdrawn for everyone. The text is cleared on the way out, so a
     * deleted message cannot be recovered by reading the database — anything
     * less would make "delete for everyone" a promise the storage breaks.
     */
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },

    /**
     * Hidden from these people only.
     *
     * "Delete for me" is a per-reader view, not a change to the message: the
     * other person keeps their copy, and the text stays intact because they
     * are still entitled to read it. Two entries at most — a conversation has
     * two participants — so an array on the message costs less than a join.
     */
    deletedFor: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], default: [] },

    /**
     * Reactions, one per person per message.
     *
     * Stored with the message rather than counted separately so a tap shows
     * the same result to both sides without a second query, and uniqueness is
     * enforced by userId in the update filter rather than by hoping clients
     * behave.
     */
    reactions: {
      type: [
        new mongoose.Schema(
          {
            userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
            emoji: { type: String, required: true, maxlength: 8 },
            reactedAt: { type: Date, default: Date.now },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

/**
 * Two indexes, deliberately.
 *
 * `{conversationId, createdAt}` serves the history query and also any lookup
 * by conversationId alone, because a compound index answers queries on its
 * leading fields — a separate single-field index on conversationId would be
 * pure duplication.
 *
 * There is intentionally no index on `senderId`: nothing filters by it, and on
 * the largest collection in the database an unused index costs storage on
 * every document and a write on every insert.
 */
messageSchema.index({ conversationId: 1, createdAt: -1 });
messageSchema.index({ recipientId: 1, readAt: 1 });

export const MessageModel = mongoose.model('Message', messageSchema);
