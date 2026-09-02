import mongoose from 'mongoose';
import { LOG_CATEGORY, LOG_LEVEL } from './system-log.constants.js';

const systemLogSchema = new mongoose.Schema(
  {
    level: {
      type: String,
      enum: Object.values(LOG_LEVEL),
      default: LOG_LEVEL.INFO,
      index: true,
    },
    category: {
      type: String,
      enum: Object.values(LOG_CATEGORY),
      default: LOG_CATEGORY.SYSTEM,
      index: true,
    },
    action: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({}),
    },
    stack: {
      type: String,
      default: null,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    userEmail: {
      type: String,
      default: null,
      trim: true,
    },
    ip: {
      type: String,
      default: null,
    },
    path: {
      type: String,
      default: null,
    },
    method: {
      type: String,
      default: null,
    },
    statusCode: {
      type: Number,
      default: null,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        ret.id = String(ret._id);
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  },
);

// Expire logs after 30 days to keep database lean
systemLogSchema.index({ createdAt: -1 });
systemLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });
systemLogSchema.index({ category: 1, level: 1, createdAt: -1 });

export const SystemLogModel = mongoose.model('SystemLog', systemLogSchema);
