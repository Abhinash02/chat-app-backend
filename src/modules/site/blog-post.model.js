import mongoose from 'mongoose';

import { BLOG_STATUS } from '#src/modules/site/site.constants.js';

const blogPostSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 160 },

    /*
     * The URL is the slug, so it is unique and immutable in practice: changing
     * it breaks every link already shared. The service generates it from the
     * title once, on create.
     */
    slug: { type: String, required: true, trim: true, lowercase: true, unique: true, maxlength: 180 },

    excerpt: { type: String, trim: true, maxlength: 400, default: '' },
    content: { type: String, required: true },
    coverImageUrl: { type: String, default: null },
    tags: { type: [String], default: [] },

    status: {
      type: String,
      enum: Object.values(BLOG_STATUS),
      default: BLOG_STATUS.DRAFT,
      index: true,
    },

    /** Null until the post is first published; preserved across edits. */
    publishedAt: { type: Date, default: null, index: true },

    authorName: { type: String, trim: true, maxlength: 80, default: 'Vibe Team' },
    authorAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    seoTitle: { type: String, trim: true, maxlength: 160, default: '' },
    seoDescription: { type: String, trim: true, maxlength: 300, default: '' },

    readMinutes: { type: Number, default: 1, min: 1 },
    viewCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

/* The public list: published posts, newest first. */
blogPostSchema.index({ status: 1, publishedAt: -1 });
blogPostSchema.index({ tags: 1, status: 1, publishedAt: -1 });

export const BlogPostModel = mongoose.model('BlogPost', blogPostSchema);
