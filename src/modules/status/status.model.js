import mongoose from 'mongoose';

import { STATUS_TTL_HOURS, STATUS_TYPE, TEXT_BACKGROUND_IDS } from '#src/modules/status/status.constants.js';

/**
 * Who has seen a status.
 *
 * Stored on the status rather than in its own collection: a status lives 24
 * hours and is seen by tens of people, not millions, so an embedded array is
 * one read instead of a join — and it disappears with its parent, which is
 * exactly the retention behaviour wanted.
 */
const viewerSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    viewedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const statusSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: Object.values(STATUS_TYPE), required: true },

    /** The words on a text status, or the caption on a photo or video. */
    text: { type: String, trim: true, maxlength: 280, default: '' },
    /** Which gradient a text status is drawn on. */
    background: { type: String, enum: TEXT_BACKGROUND_IDS, default: null },

    media: {
      type: new mongoose.Schema(
        {
          url: { type: String, required: true },
          storageKey: { type: String, default: null },
          resourceType: { type: String, default: null },
          mimeType: { type: String, default: null },
          durationSeconds: { type: Number, default: null, min: 0 },
          width: { type: Number, default: null },
          height: { type: Number, default: null },
        },
        { _id: false },
      ),
      default: undefined,
    },

    viewers: { type: [viewerSchema], default: [] },
    viewCount: { type: Number, default: 0, min: 0 },

    /**
     * When this disappears. Written explicitly rather than derived from
     * `createdAt`, so the lifetime is visible in the document and a future
     * change to the TTL cannot silently re-date everything already posted.
     */
    expiresAt: {
      type: Date,
      required: true,
      default: () => new Date(Date.now() + STATUS_TTL_HOURS * 60 * 60 * 1000),
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// The feed query: everyone's live statuses, newest last so a person's own
// statuses play in the order they posted them.
statusSchema.index({ userId: 1, createdAt: 1 });

/**
 * Mongo removes the document once `expiresAt` passes — no sweep, no job, and
 * it keeps working while the app is down. The embedded viewers go with it,
 * which is the retention policy rather than an accident.
 */
statusSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const StatusModel = mongoose.model('Status', statusSchema);
