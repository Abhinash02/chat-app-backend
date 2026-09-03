import mongoose from 'mongoose';

import {
  BANNER_ACTION,
  BANNER_ANIMATION,
  BANNER_PLACEMENT,
} from '#src/modules/banners/banner.constants.js';

/**
 * A promotional strip at the top of the home feed, managed entirely from the
 * admin panel.
 *
 * Scheduling is built in rather than bolted on: the whole point of a banner is
 * that it runs for a match, a festival or a weekend offer, and an admin should
 * not have to remember to switch it off at midnight.
 */
const bannerSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 80 },
    /** Internal only — never shown to users, so admins can label drafts freely. */
    note: { type: String, trim: true, maxlength: 200, default: '' },

    imageUrl: { type: String, required: true },
    mediaType: { type: String, enum: ['image', 'video'], default: 'image' },
    /** Provider key, so replacing the image can delete the old file. */
    imageStorageKey: { type: String, default: null, select: false },

    placement: {
      type: String,
      enum: Object.values(BANNER_PLACEMENT),
      default: BANNER_PLACEMENT.HOME_TOP,
    },
    animation: {
      type: String,
      enum: Object.values(BANNER_ANIMATION),
      default: BANNER_ANIMATION.PAN,
    },

    action: { type: String, enum: Object.values(BANNER_ACTION), default: BANNER_ACTION.NONE },
    /** A screen name or an external URL, depending on `action`. */
    actionTarget: { type: String, trim: true, maxlength: 500, default: '' },

    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },

    /**
     * Optional run window. Null on either side means "no bound that way", so a
     * banner with neither runs until an admin turns it off.
     */
    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },

    /** Counted in the app, so an admin can tell a dud banner from a good one. */
    impressions: { type: Number, default: 0, min: 0 },
    taps: { type: Number, default: 0, min: 0 },

    createdByAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

// The one query the app makes: live banners for a placement, in display order.
bannerSchema.index({ placement: 1, isActive: 1, sortOrder: 1 });

export const BannerModel = mongoose.model('Banner', bannerSchema);
