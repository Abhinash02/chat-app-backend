import mongoose from 'mongoose';

const InAppNotificationSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    body: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
    imageUrl: {
      type: String,
      trim: true,
      default: null,
    },
    actionUrl: {
      type: String,
      trim: true,
      default: null,
    },
    targetAudience: {
      type: String,
      enum: ['all', 'boys', 'girls', 'online'],
      default: 'all',
      index: true,
    },
    sound: {
      type: String,
      default: 'default',
    },
    createdByAdminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    readBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        index: true,
      },
    ],
    deletedBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        index: true,
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

InAppNotificationSchema.index({ createdAt: -1 });
InAppNotificationSchema.index({ isActive: 1, createdAt: -1 });

export const InAppNotificationModel =
  mongoose.models.InAppNotification ||
  mongoose.model('InAppNotification', InAppNotificationSchema, 'in_app_notifications');
