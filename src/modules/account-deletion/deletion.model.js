import mongoose from 'mongoose';

import {
  DELETION_REASON,
  DELETION_REQUEST_STATUS,
} from '#src/modules/account-deletion/deletion.constants.js';

const deletionRequestSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    reason: { type: String, enum: Object.values(DELETION_REASON), required: true },
    /** Required only when the reason is `other` — enforced in the schema layer. */
    reasonDetail: { type: String, trim: true, maxlength: 500, default: '' },

    status: {
      type: String,
      enum: Object.values(DELETION_REQUEST_STATUS),
      default: DELETION_REQUEST_STATUS.PENDING,
      index: true,
    },

    reviewedByAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    rejectionReason: { type: String, default: null },
    adminNotes: { type: String, default: null },
  },
  { timestamps: true },
);

deletionRequestSchema.index({ status: 1, createdAt: -1 });
deletionRequestSchema.index({ userId: 1, createdAt: -1 });

/*
 * One open request per account, enforced by the database rather than only by a
 * read-then-write in the service.
 *
 * Two taps on a slow connection are enough to race that check and leave an
 * administrator looking at the same account twice. The filter is what keeps the
 * constraint to *pending* rows, so a user whose request was rejected can still
 * open a new one later.
 */
deletionRequestSchema.index(
  { userId: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: { status: DELETION_REQUEST_STATUS.PENDING },
  },
);

export const DeletionRequestModel = mongoose.model('DeletionRequest', deletionRequestSchema);
