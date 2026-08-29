import mongoose from 'mongoose';

/**
 * Reusable HTML for promotional mail.
 *
 * The body is authored by an administrator and rendered into an email, never
 * into this panel or the app — so it is stored verbatim rather than sanitised,
 * and every place that could render it as a page must escape it instead.
 */
const emailTemplateSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    slug: { type: String, required: true, trim: true, lowercase: true, maxlength: 60, unique: true },
    description: { type: String, trim: true, maxlength: 200, default: '' },

    subject: { type: String, required: true, trim: true, maxlength: 200 },
    /** Preview line shown after the subject in most inboxes. */
    preheader: { type: String, trim: true, maxlength: 200, default: '' },
    html: { type: String, required: true, maxlength: 200_000 },

    /** Placeholders this template understands, e.g. ['name', 'coinBalance']. */
    variables: { type: [String], default: [] },

    /** Shipped with the product; cannot be deleted. */
    isSystem: { type: Boolean, default: false },
    createdByAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

export const EmailTemplateModel = mongoose.model('EmailTemplate', emailTemplateSchema);
