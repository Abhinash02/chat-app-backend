import mongoose from 'mongoose';

import { USER_STATUS } from '#src/common/constants/index.js';
import { StatusModel } from '#src/modules/status/status.model.js';

/** Only the fields the ring and the viewer header actually draw. */
const AUTHOR_FIELDS = 'nickname avatarUrl avatarEmoji avatarColor gender isOnline';

class StatusRepository {
  async create(data) {
    const status = await StatusModel.create(data);
    return status.toObject();
  }

  async findById(statusId) {
    return StatusModel.findById(statusId).lean().exec();
  }

  /**
   * A status with both its author and its viewers resolved.
   *
   * The viewers are populated here rather than in a separate call because the
   * one caller that needs them — the author opening their own viewer list —
   * needs them named, not as bare ids.
   */
  async findByIdPopulated(statusId) {
    return StatusModel.findById(statusId)
      .populate('userId', AUTHOR_FIELDS)
      .populate('viewers.userId', AUTHOR_FIELDS)
      .lean()
      .exec();
  }

  /**
   * Everything still live from a set of authors, oldest first.
   *
   * A TTL index deletes lazily — Mongo sweeps about once a minute — so an
   * expired status can still be sitting in the collection when someone opens
   * the app. The `expiresAt` filter is what actually enforces the 24 hours;
   * the index just reclaims the space afterwards.
   */
  async listLiveByAuthors(authorIds) {
    if (!authorIds.length) return [];

    return StatusModel.find({
      userId: { $in: authorIds.map((id) => new mongoose.Types.ObjectId(String(id))) },
      expiresAt: { $gt: new Date() },
    })
      .sort({ createdAt: 1 })
      .populate('userId', AUTHOR_FIELDS)
      .lean()
      .exec();
  }

  async listOwn(userId) {
    return StatusModel.find({ userId, expiresAt: { $gt: new Date() } })
      .sort({ createdAt: 1 })
      .populate('userId', AUTHOR_FIELDS)
      .populate('viewers.userId', AUTHOR_FIELDS)
      .lean()
      .exec();
  }

  /**
   * Which of these authors an account is allowed to see.
   *
   * Statuses inherit the app's existing visibility rule rather than inventing
   * a second one: you see the gender you are matched with, and only accounts
   * that are actually active. A suspended user's stories stop being visible
   * the moment they are suspended, without anything having to delete them.
   */
  async findVisibleAuthorIds({ gender, excludeUserIds = [] }) {
    const ids = await StatusModel.distinct('userId', { expiresAt: { $gt: new Date() } });
    if (!ids.length) return [];

    const UserModel = mongoose.model('User');
    return UserModel.distinct('_id', {
      _id: {
        $in: ids,
        $nin: excludeUserIds.map((id) => new mongoose.Types.ObjectId(String(id))),
      },
      gender,
      status: USER_STATUS.ACTIVE,
    });
  }

  /**
   * Records a view exactly once.
   *
   * `$ne` in the filter is what makes a re-open idempotent: the second read of
   * the same status matches nothing, so the count cannot be inflated by
   * scrolling back and forth. Push and increment happen in one update, so the
   * count can never drift from the list it summarises.
   */
  async addViewer({ statusId, viewerId }) {
    return StatusModel.findOneAndUpdate(
      { _id: statusId, 'viewers.userId': { $ne: viewerId } },
      { $push: { viewers: { userId: viewerId, viewedAt: new Date() } }, $inc: { viewCount: 1 } },
      { new: true },
    )
      .lean()
      .exec();
  }

  async deleteOwn({ statusId, userId }) {
    return StatusModel.findOneAndDelete({ _id: statusId, userId }).lean().exec();
  }

  async countLiveByUser(userId) {
    return StatusModel.countDocuments({ userId, expiresAt: { $gt: new Date() } }).exec();
  }

  /** Admin dashboard: how many stories are live right now. */
  async countLive() {
    return StatusModel.countDocuments({ expiresAt: { $gt: new Date() } }).exec();
  }
}

export const statusRepository = new StatusRepository();
