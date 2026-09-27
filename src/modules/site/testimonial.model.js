import mongoose from 'mongoose';

const testimonialSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    /** "Delhi" or "Student, Mumbai" — shown under the name. */
    role: { type: String, trim: true, maxlength: 120, default: '' },
    avatarUrl: { type: String, default: null },
    quote: { type: String, required: true, trim: true, maxlength: 600 },
    rating: { type: Number, default: 5, min: 1, max: 5 },

    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

testimonialSchema.index({ isActive: 1, order: 1 });

export const TestimonialModel = mongoose.model('Testimonial', testimonialSchema);
