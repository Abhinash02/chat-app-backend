import mongoose from 'mongoose';

import { MAX_CAPTION_LENGTH, MAX_COMMENT_LENGTH, MAX_POST_IMAGES } from '#src/modules/posts/post.constants.js';

/**
 * One stored image.
 *
 * `storageKey` is what makes deletion possible: without it the row disappears
 * and the file stays in Cloudinary, reachable by anyone who kept the URL and
 * billed for forever. Width and height are recorded so the feed can reserve
 * the right shape before the picture arrives.
 */
const postImageSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    storageKey: { type: String, default: null },
    width: { type: Number, default: null },
    height: { type: Number, default: null },
  },
  { _id: false },
);

const postSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    images: {
      type: [postImageSchema],
      required: true,
      validate: {
        validator: (values) => Array.isArray(values) && values.length >= 1 && values.length <= MAX_POST_IMAGES,
        message: `A post needs between 1 and ${MAX_POST_IMAGES} images`,
      },
    },

    caption: { type: String, trim: true, maxlength: MAX_CAPTION_LENGTH, default: '' },

    /**
     * Who liked this, and how many.
     *
     * The ids are held inline because the only questions ever asked are "how
     * many" and "did I" — both answered from the post document already being
     * read, with no second query per row in a feed. The counter is kept beside
     * the array and written in the same update, so the two cannot drift.
     *
     * This does put a ceiling on likes-per-post before the document gets
     * unwieldy; at the scale this app is built for, that ceiling is far away,
     * and moving to a join table later does not change the API.
     */
    likedBy: { type: [mongoose.Schema.Types.ObjectId], ref: 'User', default: [] },
    likeCount: { type: Number, default: 0, min: 0 },

    /** Denormalised from the comments collection so a feed row is one read. */
    commentCount: { type: Number, default: 0, min: 0 },

    /** Set when the author edits the caption, so the UI can say "edited". */
    editedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// The profile grid: one author's posts, newest first.
postSchema.index({ userId: 1, createdAt: -1 });
// The main feed, and the popular ordering.
postSchema.index({ createdAt: -1 });
postSchema.index({ likeCount: -1, createdAt: -1 });

export const PostModel = mongoose.model('Post', postSchema);

const postCommentSchema = new mongoose.Schema(
  {
    postId: { type: mongoose.Schema.Types.ObjectId, ref: 'Post', required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    text: { type: String, trim: true, required: true, maxlength: MAX_COMMENT_LENGTH },
    editedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

/**
 * Comments live in their own collection rather than inside the post.
 *
 * Unlike a status's viewer list, comments have no lifetime cap — a popular
 * post could collect thousands, and an embedded array would push the post
 * document toward the 16MB limit while making every feed read carry text
 * nobody asked for.
 */
postCommentSchema.index({ postId: 1, createdAt: -1 });

export const PostCommentModel = mongoose.model('PostComment', postCommentSchema);
