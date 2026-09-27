import mongoose from 'mongoose';

/**
 * A slide in the website's hero carousel.
 *
 * Content, not configuration — an operator adds and reorders these without a
 * deploy, which is the whole reason the home page does not hard-code its own
 * headline.
 */
const heroSlideSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    subtitle: { type: String, trim: true, maxlength: 300, default: '' },
    /** Small label above the title, e.g. "New". */
    eyebrow: { type: String, trim: true, maxlength: 60, default: '' },

    imageUrl: { type: String, default: null },
    ctaLabel: { type: String, trim: true, maxlength: 40, default: '' },
    ctaHref: { type: String, trim: true, maxlength: 400, default: '' },

    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

heroSlideSchema.index({ isActive: 1, order: 1 });

export const HeroSlideModel = mongoose.model('HeroSlide', heroSlideSchema);
