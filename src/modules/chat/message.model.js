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
      index: true,
    },
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    recipientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    type: { type: String, enum: Object.values(MESSAGE_TYPE), default: MESSAGE_TYPE.TEXT },
    text: { type: String, required: true, maxlength: 5000 },

    deliveredAt: { type: Date, default: null },
    readAt: { type: Date, default: null },

    /** What this message cost the sender — kept for support and analytics. */
    billing: { type: billingSchema, default: () => ({}) },

    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// The chat history query: newest first within one conversation.
messageSchema.index({ conversationId: 1, createdAt: -1 });
messageSchema.index({ recipientId: 1, readAt: 1 });

export const MessageModel = mongoose.model('Message', messageSchema);
