import mongoose from 'mongoose';

import { PostCommentModel, PostModel } from '#src/modules/posts/post.model.js';
import { POST_SORT } from '#src/modules/posts/post.constants.js';

/** Only the fields a post header or a comment row actually draws. */
const AUTHOR_FIELDS = 'nickname avatarUrl avatarEmoji avatarColor gender isOnline';

function sortStageFor(sort) {
  return sort === POST_SORT.POPULAR
    ? { likeCount: -1, createdAt: -1 }
    : { createdAt: -1 };
}

class PostRepository {
  async create(data) {
    const post = await PostModel.create(data);
    return this.findById(post._id);
  }

  async findById(postId) {
    return PostModel.findById(postId).populate('userId', AUTHOR_FIELDS).lean().exec();
  }

  /** The raw document, for ownership checks that must not pay for a populate. */
  async findRawById(postId) {
    return PostModel.findById(postId).lean().exec();
  }

  /**
   * The feed, excluding whoever the viewer cannot see.
   *
   * Blocking is applied here rather than filtered afterwards so the page size
   * means what it says: dropping rows after the limit would hand back short
   * pages that look like the end of the feed.
   */
  async listFeed({ excludeUserIds = [], authorIds = null, sort, skip = 0, limit = 20 }) {
    const filter = {};

    if (excludeUserIds.length) {
      filter.userId = { $nin: excludeUserIds.map((id) => new mongoose.Types.ObjectId(String(id))) };
    }

    if (Array.isArray(authorIds)) {
      const ids = authorIds.map((id) => new mongoose.Types.ObjectId(String(id)));
      filter.userId = filter.userId ? { ...filter.userId, $in: ids } : { $in: ids };
    }

    const [items, total] = await Promise.all([
      PostModel.find(filter)
        .sort(sortStageFor(sort))
        .skip(skip)
        .limit(limit)
        .populate('userId', AUTHOR_FIELDS)
        .lean()
        .exec(),
      PostModel.countDocuments(filter).exec(),
    ]);

    return { items, total };
  }

  async listByAuthor({ authorId, skip = 0, limit = 20 }) {
    const filter = { userId: new mongoose.Types.ObjectId(String(authorId)) };

    const [items, total] = await Promise.all([
      PostModel.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('userId', AUTHOR_FIELDS)
        .lean()
        .exec(),
      PostModel.countDocuments(filter).exec(),
    ]);

    return { items, total };
  }

  async countByAuthor(authorId) {
    return PostModel.countDocuments({ userId: authorId }).exec();
  }

  async updateCaption({ postId, caption }) {
    return PostModel.findByIdAndUpdate(
      postId,
      { $set: { caption, editedAt: new Date() } },
      { new: true },
    )
      .populate('userId', AUTHOR_FIELDS)
      .lean()
      .exec();
  }

  async deleteById(postId) {
    return PostModel.findByIdAndDelete(postId).lean().exec();
  }

  /**
   * Likes and unlikes in one atomic update each.
   *
   * `$ne` / `$eq` in the filter is what makes these idempotent: a second like
   * from the same account matches nothing, so the counter cannot be inflated
   * by a double tap or a retried request. The array and the counter move
   * together, so they cannot disagree.
   */
  async like({ postId, userId }) {
    return PostModel.findOneAndUpdate(
      { _id: postId, likedBy: { $ne: userId } },
      { $push: { likedBy: userId }, $inc: { likeCount: 1 } },
      { new: true },
    )
      .lean()
      .exec();
  }

  async unlike({ postId, userId }) {
    return PostModel.findOneAndUpdate(
      { _id: postId, likedBy: userId },
      { $pull: { likedBy: userId }, $inc: { likeCount: -1 } },
      { new: true },
    )
      .lean()
      .exec();
  }

  async createComment({ postId, userId, text }) {
    const comment = await PostCommentModel.create({ postId, userId, text });
    await PostModel.findByIdAndUpdate(postId, { $inc: { commentCount: 1 } }).exec();
    return PostCommentModel.findById(comment._id).populate('userId', AUTHOR_FIELDS).lean().exec();
  }

  async listComments({ postId, skip = 0, limit = 30 }) {
    const filter = { postId: new mongoose.Types.ObjectId(String(postId)) };

    const [items, total] = await Promise.all([
      PostCommentModel.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('userId', AUTHOR_FIELDS)
        .lean()
        .exec(),
      PostCommentModel.countDocuments(filter).exec(),
    ]);

    return { items, total };
  }

  async findCommentById(commentId) {
    return PostCommentModel.findById(commentId).lean().exec();
  }

  async updateComment({ commentId, text }) {
    return PostCommentModel.findByIdAndUpdate(
      commentId,
      { $set: { text, editedAt: new Date() } },
      { new: true },
    )
      .populate('userId', AUTHOR_FIELDS)
      .lean()
      .exec();
  }

  async deleteComment(commentId) {
    const removed = await PostCommentModel.findByIdAndDelete(commentId).lean().exec();
    if (removed) {
      // Floored at zero: a counter that has drifted low must not go negative
      // and fail the schema's `min` on the next write.
      await PostModel.updateOne(
        { _id: removed.postId, commentCount: { $gt: 0 } },
        { $inc: { commentCount: -1 } },
      ).exec();
    }
    return removed;
  }

  /** Used when a post is deleted, so its comments do not outlive it. */
  async deleteCommentsForPost(postId) {
    return PostCommentModel.deleteMany({ postId }).exec();
  }

  /** Admin dashboard: how many posts exist. */
  async countAll() {
    return PostModel.countDocuments().exec();
  }
}

export const postRepository = new PostRepository();
