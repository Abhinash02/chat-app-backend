import mongoose from 'mongoose';

import { MESSAGE_TYPE } from '#src/modules/chat/chat.constants.js';

const roomMessageSchema = new mongoose.Schema(
  {
    roomId: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true },
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: Object.values(MESSAGE_TYPE), default: MESSAGE_TYPE.TEXT },
    text: { type: String, required: true, maxlength: 2000 },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

roomMessageSchema.index({ roomId: 1, createdAt: -1 });
// Room history is ephemeral: entries self-delete after 24 hours, which keeps
// the free storage tier viable and matches the "live room" product model.
roomMessageSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 });

export const RoomMessageModel = mongoose.model('RoomMessage', roomMessageSchema);
