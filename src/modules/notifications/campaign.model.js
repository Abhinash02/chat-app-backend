import mongoose from 'mongoose';

import {
  AUDIENCE_PRESET,
  CAMPAIGN_CHANNEL,
  CAMPAIGN_STATUS,
} from '#src/modules/notifications/notification.constants.js';

const audienceSchema = new mongoose.Schema(
  {
    preset: { type: String, enum: Object.values(AUDIENCE_PRESET), default: AUDIENCE_PRESET.EVERYONE },
    /** Narrows the preset further; all present filters must match. */
    gender: { type: String, enum: ['male', 'female'], default: null },
    onlineOnly: { type: Boolean, default: false },
    inactiveForDays: { type: Number, min: 1, max: 365, default: null },
    maxCoinBalance: { type: Number, min: 0, default: null },
    hasPurchased: { type: Boolean, default: null },
  },
  { _id: false },
);

const pushContentSchema = new mongoose.Schema(
  {
    title: { type: String, trim: true, maxlength: 100, default: '' },
    body: { type: String, trim: true, maxlength: 300, default: '' },
    /** Where tapping the notification should land, e.g. "coins" or "rooms". */
    deepLink: { type: String, trim: true, maxlength: 200, default: '' },
    sound: { type: String, trim: true, maxlength: 40, default: 'default' },
  },
  { _id: false },
);

const emailContentSchema = new mongoose.Schema(
  {
    subject: { type: String, trim: true, maxlength: 200, default: '' },
    preheader: { type: String, trim: true, maxlength: 200, default: '' },
    html: { type: String, maxlength: 200_000, default: '' },
    templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'EmailTemplate', default: null },
  },
  { _id: false },
);

const statsSchema = new mongoose.Schema(
  {
    targeted: { type: Number, default: 0, min: 0 },
    pushSent: { type: Number, default: 0, min: 0 },
    pushFailed: { type: Number, default: 0, min: 0 },
    emailSent: { type: Number, default: 0, min: 0 },
    emailFailed: { type: Number, default: 0, min: 0 },
    /** Recipients skipped because they opted out of marketing mail. */
    optedOut: { type: Number, default: 0, min: 0 },
    tokensRetired: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
);

const campaignSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    channel: { type: String, enum: Object.values(CAMPAIGN_CHANNEL), required: true },
    audience: { type: audienceSchema, default: () => ({}) },

    push: { type: pushContentSchema, default: () => ({}) },
    email: { type: emailContentSchema, default: () => ({}) },

    status: {
      type: String,
      enum: Object.values(CAMPAIGN_STATUS),
      default: CAMPAIGN_STATUS.DRAFT,
      index: true,
    },

    stats: { type: statsSchema, default: () => ({}) },

    /**
     * Where the worker got to. A campaign that dies mid-send resumes from here
     * rather than mailing the first few thousand people a second time.
     */
    cursorUserId: { type: mongoose.Schema.Types.ObjectId, default: null },

    scheduledAt: { type: Date, default: null },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    failureReason: { type: String, default: null },

    createdByAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

campaignSchema.index({ status: 1, scheduledAt: 1 });
campaignSchema.index({ createdAt: -1 });

export const CampaignModel = mongoose.model('Campaign', campaignSchema);
