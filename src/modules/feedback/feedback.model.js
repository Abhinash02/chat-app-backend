import mongoose from 'mongoose';

const feedbackSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    category: {
      type: String,
      enum: ['suggestion', 'bug', 'compliment', 'other'],
      default: 'suggestion',
    },
    rating: { type: Number, min: 1, max: 5, default: 5 },
    message: { type: String, required: true, maxlength: 2000, trim: true },
    adminNote: { type: String, default: '', maxlength: 2000, trim: true },
    deviceInfo: { type: String, default: null },
    status: {
      type: String,
      enum: ['new', 'reviewed', 'resolved', 'rejected'],
      default: 'new',
    },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

feedbackSchema.index({ userId: 1, createdAt: -1 });
feedbackSchema.index({ status: 1, createdAt: -1 });

export const FeedbackModel = mongoose.model('Feedback', feedbackSchema);
