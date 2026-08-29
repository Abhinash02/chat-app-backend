import mongoose from 'mongoose';

import { REPORT_REASON, REPORT_STATUS } from '#src/modules/reports/report.constants.js';

const reportSchema = new mongoose.Schema(
  {
    reporterId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    reportedUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', default: null },

    reason: { type: String, enum: Object.values(REPORT_REASON), required: true },
    details: { type: String, trim: true, maxlength: 500, default: '' },

    /**
     * Copies of the reported messages, taken at report time. The originals can
     * be deleted by their sender, and a moderator still needs to see them.
     */
    messageSnapshots: {
      type: [
        new mongoose.Schema(
          {
            messageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
            text: { type: String, maxlength: 5000 },
            sentAt: { type: Date },
          },
          { _id: false },
        ),
      ],
      default: [],
    },

    status: { type: String, enum: Object.values(REPORT_STATUS), default: REPORT_STATUS.OPEN, index: true },
    reviewedByAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewNote: { type: String, maxlength: 500, default: '' },
    reviewedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

reportSchema.index({ status: 1, createdAt: -1 });
// One open report per reporter/target pair keeps the queue free of duplicates.
reportSchema.index(
  { reporterId: 1, reportedUserId: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: REPORT_STATUS.OPEN } },
);

export const ReportModel = mongoose.model('Report', reportSchema);
