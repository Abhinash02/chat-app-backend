import mongoose from 'mongoose';

import { FAQ_CATEGORY } from '#src/modules/site/site.constants.js';

const faqSchema = new mongoose.Schema(
  {
    question: { type: String, required: true, trim: true, maxlength: 300 },
    answer: { type: String, required: true, trim: true, maxlength: 4000 },

    category: {
      type: String,
      enum: Object.values(FAQ_CATEGORY),
      default: FAQ_CATEGORY.GENERAL,
      index: true,
    },

    /*
     * Hand-ordered, not sorted by date.
     *
     * The most common question is rarely the newest one, and an FAQ that
     * reorders itself as it is edited is worse than one somebody arranged.
     */
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

faqSchema.index({ isActive: 1, category: 1, order: 1 });

export const FaqModel = mongoose.model('Faq', faqSchema);
