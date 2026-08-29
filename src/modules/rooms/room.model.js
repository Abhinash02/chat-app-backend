import mongoose from 'mongoose';

import { ROOM_ROLE, ROOM_STATUS } from '#src/modules/rooms/room.constants.js';

const participantSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: Object.values(ROOM_ROLE), default: ROOM_ROLE.LISTENER },
    joinedAt: { type: Date, default: Date.now },
    isMuted: { type: Boolean, default: true },
    isVoiceConnected: { type: Boolean, default: false },
  },
  { _id: false },
);

const roomSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 60 },
    topic: { type: String, trim: true, maxlength: 140, default: '' },
    hostId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    participants: { type: [participantSchema], default: [] },
    maxParticipants: { type: Number, default: 12, min: 2, max: 100 },

    isVoiceEnabled: { type: Boolean, default: true },
    isPrivate: { type: Boolean, default: false },
    /** Only ever a digest; the clear-text passcode is never stored. */
    passcodeHash: { type: String, default: null, select: false },

    status: { type: String, enum: Object.values(ROOM_STATUS), default: ROOM_STATUS.LIVE },
    closedAt: { type: Date, default: null },

    /** Denormalised for the room list, which must not count an array per row. */
    participantCount: { type: Number, default: 0, min: 0 },
    messageCount: { type: Number, default: 0, min: 0 },
    lastActivityAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true },
);

roomSchema.index({ status: 1, lastActivityAt: -1 });
roomSchema.index({ 'participants.userId': 1 });

export const RoomModel = mongoose.model('Room', roomSchema);
