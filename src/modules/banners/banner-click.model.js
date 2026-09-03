import mongoose from 'mongoose';

const bannerClickSchema = new mongoose.Schema(
  {
    bannerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Banner',
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    action: { type: String, default: '' },
    actionTarget: { type: String, default: '' },
    ip: { type: String, default: null },
    userAgent: { type: String, default: null },
    clickedAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true },
);

bannerClickSchema.index({ bannerId: 1, clickedAt: -1 });

export const BannerClickModel = mongoose.model('BannerClick', bannerClickSchema);
