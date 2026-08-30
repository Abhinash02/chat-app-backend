import mongoose from 'mongoose';

import { ConversationModel } from '#src/modules/chat/conversation.model.js';
import { MessageModel } from '#src/modules/chat/message.model.js';
import { CONVERSATION_STATUS, buildParticipantKey } from '#src/modules/chat/chat.constants.js';

class ChatRepository {
  // ----- Conversations ----------------------------------------------------

  /**
   * Upsert on the sorted pair key, so two people tapping each other's profile
   * at the same moment end up in one thread rather than two.
   */
  async findOrCreateConversation({ userIdA, userIdB, initiatedBy }) {
    const participantKey = buildParticipantKey(userIdA, userIdB);

    // `includeResultMetadata` is what tells us whether this call created the
    // thread or found an existing one — the auto-greeting depends on knowing
    // the difference, and only the driver can answer it without a race.
    const result = await ConversationModel.findOneAndUpdate(
      { participantKey },
      {
        $setOnInsert: {
          participantKey,
          participantIds: [userIdA, userIdB],
          initiatedBy,
          status: CONVERSATION_STATUS.ACTIVE,
          unreadCounts: {},
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true, includeResultMetadata: true },
    ).exec();

    return {
      conversation: result.value,
      created: Boolean(result.lastErrorObject?.upserted),
    };
  }

  async findConversationById(conversationId) {
    return ConversationModel.findById(conversationId).lean().exec();
  }

  async findConversationByParticipants(userIdA, userIdB) {
    return ConversationModel.findOne({ participantKey: buildParticipantKey(userIdA, userIdB) })
      .lean()
      .exec();
  }

  async listConversations({ userId, skip = 0, limit = 20, onlyUnread = false }) {
    const filter = { participantIds: userId, lastMessageAt: { $ne: null } };
    if (onlyUnread) filter[`unreadCounts.${userId}`] = { $gt: 0 };

    const [items, total] = await Promise.all([
      ConversationModel.find(filter)
        .sort({ lastMessageAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('participantIds', 'nickname name avatarUrl avatarEmoji avatarColor gender isOnline lastSeenAt')
        .lean()
        .exec(),
      ConversationModel.countDocuments(filter).exec(),
    ]);

    return { items, total };
  }

  /**
   * One atomic write per delivered message: thread preview, ordering key,
   * counters and the recipient's unread badge all move together.
   */
  async applyMessageToConversation({ conversationId, message, recipientId }) {
    return ConversationModel.findByIdAndUpdate(
      conversationId,
      {
        $set: {
          lastMessage: {
            text: message.text,
            type: message.type,
            senderId: message.senderId,
            sentAt: message.createdAt,
          },
          lastMessageAt: message.createdAt,
        },
        $inc: { messageCount: 1, [`unreadCounts.${recipientId}`]: 1 },
      },
      { new: true },
    )
      .lean()
      .exec();
  }

  async resetUnreadCount({ conversationId, userId }) {
    return ConversationModel.findByIdAndUpdate(
      conversationId,
      { $set: { [`unreadCounts.${userId}`]: 0 } },
      { new: true },
    )
      .lean()
      .exec();
  }

  async updateConversationStatus({ conversationId, status }) {
    return ConversationModel.findByIdAndUpdate(conversationId, { $set: { status } }, { new: true })
      .lean()
      .exec();
  }

  async countTotalUnread(userId) {
    const [result] = await ConversationModel.aggregate([
      { $match: { participantIds: new mongoose.Types.ObjectId(String(userId)) } },
      { $project: { count: { $ifNull: [`$unreadCounts.${userId}`, 0] } } },
      { $group: { _id: null, total: { $sum: '$count' } } },
    ]).exec();

    return result?.total ?? 0;
  }

  // ----- Messages ---------------------------------------------------------

  async createMessage(data) {
    return MessageModel.create(data);
  }

  /**
   * Cursor pagination: `before` is the createdAt of the oldest message the
   * client already holds, which keeps paging stable while new messages arrive.
   */
  async listMessages({ conversationId, limit = 30, before, viewerId }) {
    /*
     * Withdrawn messages stay in the list as tombstones rather than vanishing.
     * Removing them outright made the "this was deleted" note disappear on the
     * next reload, so a conversation quietly rewrote itself and the other
     * person was left wondering what they had misread.
     *
     * Messages someone deleted for themselves are a different matter: those
     * are filtered out for that reader only, and stay whole for the other.
     */
    const filter = { conversationId };
    if (viewerId) filter.deletedFor = { $ne: viewerId };
    if (before) filter.createdAt = { $lt: new Date(before) };

    const items = await MessageModel.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit + 1)
      .lean()
      .exec();

    const hasMore = items.length > limit;
    const page = hasMore ? items.slice(0, limit) : items;

    return {
      items: page.reverse(),
      hasMore,
      nextCursor: hasMore ? page[0]?.createdAt : null,
    };
  }

  async markMessagesRead({ conversationId, recipientId }) {
    const now = new Date();
    const result = await MessageModel.updateMany(
      { conversationId, recipientId, readAt: null },
      { $set: { readAt: now, deliveredAt: now } },
    ).exec();

    return { modifiedCount: result.modifiedCount, readAt: now };
  }

  async markDelivered({ conversationId, recipientId }) {
    return MessageModel.updateMany(
      { conversationId, recipientId, deliveredAt: null },
      { $set: { deliveredAt: new Date() } },
    ).exec();
  }

  async findMessageById(messageId) {
    return MessageModel.findById(messageId).lean().exec();
  }

  /** Hides a message from one reader, leaving the other person's copy intact. */
  async hideMessageFor({ messageId, userId }) {
    return MessageModel.findByIdAndUpdate(
      messageId,
      { $addToSet: { deletedFor: userId } },
      { new: true },
    )
      .lean()
      .exec();
  }

  /**
   * Adds or replaces one person's reaction.
   *
   * Two updates rather than one: an array filter cannot both replace an
   * existing entry and push a missing one, and doing it in this order means a
   * repeat tap of the same emoji ends with none — which is what makes the
   * button a toggle instead of a ratchet.
   */
  async setReaction({ messageId, userId, emoji }) {
    await MessageModel.updateOne({ _id: messageId }, { $pull: { reactions: { userId } } }).exec();

    if (!emoji) {
      return MessageModel.findById(messageId).lean().exec();
    }

    return MessageModel.findByIdAndUpdate(
      messageId,
      { $push: { reactions: { userId, emoji, reactedAt: new Date() } } },
      { new: true },
    )
      .lean()
      .exec();
  }

  async softDeleteMessage(messageId) {
    return MessageModel.findByIdAndUpdate(
      messageId,
      // The text goes with it. Keeping it would leave "deleted for everyone"
      // true only of the interface.
      { $set: { isDeleted: true, deletedAt: new Date(), text: '', reactions: [] } },
      { new: true },
    )
      .lean()
      .exec();
  }

  async countMessagesSince(since) {
    return MessageModel.countDocuments(since ? { createdAt: { $gte: since } } : {}).exec();
  }

  async countConversations() {
    return ConversationModel.countDocuments().exec();
  }
}

export const chatRepository = new ChatRepository();
