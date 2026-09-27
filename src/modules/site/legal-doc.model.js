import mongoose from 'mongoose';

import { LEGAL_DOC_SLUG } from '#src/modules/site/site.constants.js';

/**
 * Privacy, terms and refunds, as editable documents.
 *
 * Policy text changes for legal reasons and often at short notice, which is a
 * bad fit for something that needs a release to correct. Storing it means the
 * website always shows the current wording and the admin panel owns it.
 *
 * `slug` is the fixed identifier the website routes on, so it is an enum rather
 * than free text — a typo here would silently produce a blank policy page.
 */
const legalDocSchema = new mongoose.Schema(
  {
    slug: {
      type: String,
      enum: Object.values(LEGAL_DOC_SLUG),
      required: true,
      unique: true,
      index: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    /** Same lightweight format as blog bodies: blank lines split paragraphs. */
    body: { type: String, required: true },
    /** Shown to the reader, because "when was this last changed" is the question. */
    effectiveFrom: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

export const LegalDocModel = mongoose.model('LegalDoc', legalDocSchema);
