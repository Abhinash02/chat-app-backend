import mongoose from 'mongoose';

import { CONVERSATION_STATUS, MESSAGE_TYPE } from '#src/modules/chat/chat.constants.js';

const lastMessageSchema = new mongoose.Schema(
  {
    text: { type: String, default: '' },
    type: { type: String, enum: Object.values(MESSAGE_TYPE), default: MESSAGE_TYPE.TEXT },
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    sentAt: { type: Date, default: null },
  },
  { _id: false },
);

const conversationSchema = new mongoose.Schema(
  {
    participantIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
      required: true,
      validate: {
        validator: (value) => value.length === 2,
        message: 'A conversation must have exactly two participants',
      },
    },

    /** Sorted "idA:idB" — the uniqueness guarantee for a one-to-one thread. */
    participantKey: { type: String, required: true, unique: true },

    initiatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: Object.values(CONVERSATION_STATUS), default: CONVERSATION_STATUS.ACTIVE },

    lastMessage: { type: lastMessageSchema, default: () => ({}) },
    lastMessageAt: { type: Date, default: null, index: true },
    messageCount: { type: Number, default: 0, min: 0 },

    /**
     * Per-participant unread counters keyed by user id. Denormalised so the
     * conversation list needs no per-thread count query.
     */
    unreadCounts: { type: Map, of: Number, default: () => new Map() },
  },
  { timestamps: true },
);

conversationSchema.index({ participantIds: 1, lastMessageAt: -1 });

export const ConversationModel = mongoose.model('Conversation', conversationSchema);
