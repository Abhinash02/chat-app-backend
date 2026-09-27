import mongoose from 'mongoose';

const eventSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, required: true, trim: true, maxlength: 2000 },
    type: {
      type: String,
      enum: ['offer', 'free_chat', 'bonus_coins', 'announcement', 'festival'],
      default: 'offer',
      index: true,
    },
    badgeText: { type: String, trim: true, maxlength: 30, default: 'HOT' },

    /**
     * Where this is published.
     *
     * The same row feeds the app's Events screen and the website's
     * announcements, so one of them often wants something the other does not —
     * a coin offer is for people who already have the app, a launch note is for
     * people who do not. Defaults to `both`, which is what every row created
     * before this field existed effectively was.
     */
    visibility: {
      type: String,
      enum: ['app', 'website', 'both'],
      default: 'both',
      index: true,
    },
    bannerUrl: { type: String, default: null },
    targetGender: {
      type: String,
      enum: ['all', 'male', 'female'],
      default: 'all',
      index: true,
    },
    // Optional perks associated with the event
    rewardCoins: { type: Number, default: 0, min: 0 },
    rewardFreeMinutes: { type: Number, default: 0, min: 0 },
    discountPercent: { type: Number, default: 0, min: 0, max: 100 },
    actionUrl: { type: String, default: 'coins' }, // 'coins', 'rooms', 'chats', or custom link
    startsAt: { type: Date, default: Date.now, index: true },
    endsAt: { type: Date, default: null, index: true },
    isActive: { type: Boolean, default: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  {
    timestamps: true,
  },
);

eventSchema.index({ isActive: 1, startsAt: 1, endsAt: 1, targetGender: 1 });

export const EventModel = mongoose.model('Event', eventSchema);
