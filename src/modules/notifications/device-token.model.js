import mongoose from 'mongoose';

import { DEVICE_PLATFORM } from '#src/modules/notifications/notification.constants.js';

/**
 * One row per installed app. A person with a phone and a tablet has two, and a
 * campaign reaches both.
 */
const deviceTokenSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    token: { type: String, required: true, unique: true },
    platform: { type: String, enum: Object.values(DEVICE_PLATFORM), required: true },

    /** Stable per install, so reinstalling replaces the row instead of adding one. */
    deviceId: { type: String, default: null },
    deviceName: { type: String, maxlength: 120, default: '' },
    appVersion: { type: String, maxlength: 20, default: '' },

    isActive: { type: Boolean, default: true, index: true },
    /** Set when the provider reports the token is dead. */
    deactivatedAt: { type: Date, default: null },
    deactivationReason: { type: String, default: null },

    lastUsedAt: { type: Date, default: Date.now },
    consecutiveFailures: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

deviceTokenSchema.index({ userId: 1, isActive: 1 });

export const DeviceTokenModel = mongoose.model('DeviceToken', deviceTokenSchema);
