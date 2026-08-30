import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
  PaymentRequiredError,
} from '#src/common/errors/index.js';
import { buildPaginationMeta, resolvePagination } from '#src/common/utils/pagination.util.js';
import { isEmojiOnly, maskBlockedWords, normalizeMessageText, truncate } from '#src/common/utils/text.util.js';
import { logger } from '#src/config/logger.js';
import { emitToConversation, emitToUser } from '#src/realtime/emitter.js';
import { SOCKET_EVENT } from '#src/realtime/events.js';
import { coinsService } from '#src/modules/coins/coins.service.js';
import { notificationService } from '#src/modules/notifications/notification.service.js';
import { settingsService } from '#src/modules/settings/settings.service.js';
import { userService } from '#src/modules/users/user.service.js';
import { userRepository } from '#src/modules/users/user.repository.js';
import { chatRepository } from '#src/modules/chat/chat.repository.js';
import {
  CONVERSATION_STATUS,
  DELETE_SCOPE,
  MESSAGE_TYPE,
  CLIENT_MESSAGE_TYPES,
} from '#src/modules/chat/chat.constants.js';

const PREVIEW_LENGTH = 80;

/**
 * Collapses reactions into what a bubble actually draws.
 *
 * The full list is not sent: a client needs the tally, and whether this
 * reader is in it, to render the chip and colour it. Shipping every reactor's
 * id would hand out the participants of a private conversation for nothing.
 */
function toReactionSummary(reactions, viewerId) {
  const counts = new Map();

  for (const reaction of reactions ?? []) {
    const entry = counts.get(reaction.emoji) ?? { emoji: reaction.emoji, count: 0, mine: false };
    entry.count += 1;
    if (viewerId && String(reaction.userId) === String(viewerId)) entry.mine = true;
    counts.set(reaction.emoji, entry);
  }

  return [...counts.values()].sort((a, b) => b.count - a.count);
}

/**
 * One word for where a message has got to, so the client is not left deriving
 * it from two nullable timestamps and getting it subtly wrong in one place.
 *
 *   sent       written down, the other device has not acknowledged it
 *   delivered  it reached them
 *   read       they opened it
 */
function deliveryStateOf(message) {
  if (message.readAt) return 'read';
  if (message.deliveredAt) return 'delivered';
  return 'sent';
}

function toMessageDto(message, viewerId) {
  return {
    id: String(message._id),
    conversationId: String(message.conversationId),
    senderId: String(message.senderId),
    recipientId: String(message.recipientId),
    type: message.type,
    text: message.isDeleted ? '' : message.text,
    isDeleted: Boolean(message.isDeleted),
    deliveredAt: message.deliveredAt ?? null,
    readAt: message.readAt ?? null,
    deliveryState: deliveryStateOf(message),
    reactions: message.isDeleted ? [] : toReactionSummary(message.reactions, viewerId),
    createdAt: message.createdAt,
  };
}

function unreadCountFor(conversation, userId) {
  const counts = conversation.unreadCounts;
  if (!counts) return 0;
  // Lean documents give a plain object; hydrated ones give a Map.
  if (counts instanceof Map) return counts.get(String(userId)) ?? 0;
  return counts[String(userId)] ?? 0;
}

function toConversationDto(conversation, viewerId) {
  const participants = conversation.participantIds ?? [];
  const other = participants.find((participant) => {
    const id = participant?._id ?? participant;
    return String(id) !== String(viewerId);
  });

  const partner =
    other && other.nickname
      ? {
          id: String(other._id),
          name: other.name,
          nickname: other.nickname,
          avatarUrl: other.avatarUrl ?? null,
          avatarEmoji: other.avatarEmoji ?? null,
          avatarColor: other.avatarColor ?? null,
          gender: other.gender,
          isOnline: Boolean(other.isOnline),
          lastSeenAt: other.lastSeenAt ?? null,
        }
      : { id: String(other?._id ?? other) };

  return {
    id: String(conversation._id),
    partner,
    status: conversation.status,
    lastMessage: conversation.lastMessage?.sentAt
      ? {
          text: truncate(conversation.lastMessage.text ?? '', PREVIEW_LENGTH),
          type: conversation.lastMessage.type,
          senderId: String(conversation.lastMessage.senderId),
          sentAt: conversation.lastMessage.sentAt,
          isMine: String(conversation.lastMessage.senderId) === String(viewerId),
        }
      : null,
    unreadCount: unreadCountFor(conversation, viewerId),
    messageCount: conversation.messageCount ?? 0,
    lastMessageAt: conversation.lastMessageAt ?? null,
    createdAt: conversation.createdAt,
  };
}

/** Loads a conversation and proves the caller belongs to it. */
async function loadParticipantConversation({ conversationId, userId }) {
  const conversation = await chatRepository.findConversationById(conversationId);
  if (!conversation) throw new NotFoundError('Conversation not found', 'CONVERSATION_NOT_FOUND');

  const isParticipant = conversation.participantIds.some((id) => String(id) === String(userId));
  if (!isParticipant) {
    throw new ForbiddenError('You are not part of this conversation', 'NOT_A_PARTICIPANT');
  }

  return conversation;
}

function partnerIdOf(conversation, userId) {
  return conversation.participantIds.find((id) => String(id) !== String(userId));
}

/**
 * Opens (or reuses) the thread with another user.
 *
 * Tapping a profile is the product's "say hi" gesture, so a brand new thread is
 * seeded with the configured greeting. The greeting is billed like any other
 * message — but if the sender cannot afford it the conversation is still
 * created and the greeting is reported as skipped, so opening a profile never
 * fails with a payment error.
 */
export async function openConversation({ user, targetUserId }) {
  if (String(user.id) === String(targetUserId)) {
    throw new BadRequestError('You cannot start a chat with yourself', 'CANNOT_CHAT_SELF');
  }

  const target = await userRepository.findPublicProfileById(targetUserId);
  if (!target) throw new NotFoundError('This profile is not available', 'USER_NOT_FOUND');

  if (target.gender === user.gender) {
    throw new ForbiddenError('You can only chat with the opposite gender', 'GENDER_MISMATCH');
  }

  if (await userService.areUsersBlocked(user.id, targetUserId)) {
    throw new ForbiddenError('This conversation is not available', 'USER_BLOCKED');
  }

  const { conversation, created } = await chatRepository.findOrCreateConversation({
    userIdA: user.id,
    userIdB: targetUserId,
    initiatedBy: user.id,
  });

  const chatSettings = await settingsService.getChatSettings();
  let greeting = null;
  let greetingSkippedReason = null;

  const shouldGreet = created && chatSettings.autoGreetingEnabled && conversation.messageCount === 0;

  if (shouldGreet) {
    try {
      const result = await sendMessage({
        user,
        conversationId: conversation._id,
        text: chatSettings.autoGreetingText,
        isAutoGreeting: true,
      });
      greeting = result.message;
    } catch (error) {
      if (error instanceof PaymentRequiredError) {
        greetingSkippedReason = error.code;
        logger.info({ userId: user.id }, 'Auto-greeting skipped: not enough coins');
      } else {
        throw error;
      }
    }
  }

  const fresh = await chatRepository.findConversationById(conversation._id);
  const populated = { ...fresh, participantIds: [target, { _id: user.id }] };

  return {
    conversation: toConversationDto(populated, user.id),
    created,
    greeting,
    greetingSkippedReason,
  };
}

/**
 * Delivers one message. Billing happens before persistence: a message the
 * sender could not pay for is never written, so the ledger and the thread can
 * never disagree.
 */
export async function sendMessage({ user, conversationId, text, type, isAutoGreeting = false }) {
  const conversation = await loadParticipantConversation({ conversationId, userId: user.id });

  if (conversation.status !== CONVERSATION_STATUS.ACTIVE) {
    throw new ForbiddenError('This conversation is closed', 'CONVERSATION_CLOSED');
  }

  const recipientId = partnerIdOf(conversation, user.id);

  if (await userService.areUsersBlocked(user.id, recipientId)) {
    throw new ForbiddenError('This conversation is not available', 'USER_BLOCKED');
  }

  const settings = await settingsService.getSettings();
  const normalized = normalizeMessageText(text);

  if (!normalized) throw new BadRequestError('Write something first', 'EMPTY_MESSAGE');
  if (normalized.length > settings.chat.maxMessageLength) {
    throw new BadRequestError(
      `Messages can be at most ${settings.chat.maxMessageLength} characters`,
      'MESSAGE_TOO_LONG',
    );
  }

  const finalText = settings.moderation.profanityFilterEnabled
    ? maskBlockedWords(normalized, settings.moderation.blockedWords).text
    : normalized;

  const resolvedType =
    type && CLIENT_MESSAGE_TYPES.includes(type)
      ? type
      : isEmojiOnly(finalText)
        ? MESSAGE_TYPE.EMOJI
        : MESSAGE_TYPE.TEXT;

  const billing = await coinsService.authorizeMessage({
    userId: user.id,
    gender: user.gender,
    conversationId: conversation._id,
  });

  const created = await chatRepository.createMessage({
    conversationId: conversation._id,
    senderId: user.id,
    recipientId,
    type: resolvedType,
    text: finalText,
    billing: { outcome: billing.outcome, coinsCharged: billing.coinsCharged },
  });

  await chatRepository.applyMessageToConversation({
    conversationId: conversation._id,
    message: created,
    recipientId,
  });

  /*
   * If they are connected, the message reaches their device now — so it is
   * delivered now. Waiting for them to open the thread meant a message could
   * sit on someone's phone, visible in their notification shade, still showing
   * a single tick to the sender.
   */
  const recipientUser = await userRepository.findById(recipientId);
  const isRecipientConnected = Boolean(recipientUser?.isOnline);

  if (isRecipientConnected) {
    await chatRepository.markDelivered({ conversationId: conversation._id, recipientId });
    created.deliveredAt = new Date();
  }

  const dto = toMessageDto(created);

  emitToConversation(conversation._id, SOCKET_EVENT.MESSAGE_NEW, dto);
  // Also addressed to the recipient directly, so a closed chat screen still
  // updates the conversation list and unread badge.
  emitToUser(recipientId, SOCKET_EVENT.MESSAGE_NEW, dto);

  // Push only reaches people who are not currently connected. Someone with the
  // app open already saw the socket event; notifying them twice is noise.
  if (recipientUser && !isRecipientConnected) {
    notificationService
      .sendToUser({
        userId: recipientId,
        title: user.nickname,
        body: truncate(finalText, 120),
        data: { type: 'message', conversationId: String(conversation._id) },
      })
      // Delivery is best effort: a failed push must never fail the message
      // that has already been stored and delivered over the socket.
      .catch((error) => logger.warn({ err: error }, 'Message push failed'));
  }

  return {
    message: dto,
    billing: {
      outcome: billing.outcome,
      coinsCharged: billing.coinsCharged,
      wallet: billing.snapshot,
    },
    isAutoGreeting,
  };
}

export async function listConversations({ userId, page, limit, onlyUnread }) {
  const { skip, page: safePage, limit: safeLimit } = resolvePagination({ page, limit });

  const { items, total } = await chatRepository.listConversations({
    userId,
    skip,
    limit: safeLimit,
    onlyUnread,
  });

  return {
    items: items.map((conversation) => toConversationDto(conversation, userId)),
    meta: buildPaginationMeta({ page: safePage, limit: safeLimit, total }),
  };
}

export async function getConversation({ userId, conversationId }) {
  const conversation = await loadParticipantConversation({ conversationId, userId });
  const partnerId = partnerIdOf(conversation, userId);
  const partner = await userRepository.findPublicProfileById(partnerId);

  return toConversationDto({ ...conversation, participantIds: [partner ?? { _id: partnerId }] }, userId);
}

export async function listMessages({ userId, conversationId, limit, before }) {
  await loadParticipantConversation({ conversationId, userId });

  const { items, hasMore, nextCursor } = await chatRepository.listMessages({
    conversationId,
    limit: Math.min(Number(limit) || 30, 100),
    before,
    viewerId: userId,
  });

  // Opening the history is an implicit delivery receipt for the other side.
  await chatRepository.markDelivered({ conversationId, recipientId: userId });

  return {
    items: items.map((message) => toMessageDto(message, userId)),
    meta: { hasMore, nextCursor },
  };
}

export async function markConversationRead({ userId, conversationId }) {
  const conversation = await loadParticipantConversation({ conversationId, userId });

  const { modifiedCount, readAt } = await chatRepository.markMessagesRead({
    conversationId,
    recipientId: userId,
  });

  await chatRepository.resetUnreadCount({ conversationId, userId });

  if (modifiedCount > 0) {
    const partnerId = partnerIdOf(conversation, userId);
    emitToUser(partnerId, SOCKET_EVENT.MESSAGE_READ_RECEIPT, {
      conversationId: String(conversationId),
      readerId: String(userId),
      readAt,
      count: modifiedCount,
    });
  }

  return { readCount: modifiedCount, readAt };
}

/**
 * Removes a message, for one person or for both.
 *
 * These are genuinely different acts and only one of them needs permission.
 * Hiding a message from your own view touches nobody else, so either
 * participant may do it to anything in the conversation. Withdrawing it from
 * the other person's phone is a claim over their copy, so only the sender can.
 */
export async function deleteMessage({ userId, messageId, scope = DELETE_SCOPE.EVERYONE }) {
  const message = await chatRepository.findMessageById(messageId);
  if (!message) throw new NotFoundError('Message not found', 'MESSAGE_NOT_FOUND');

  const isParticipant =
    String(message.senderId) === String(userId) || String(message.recipientId) === String(userId);

  if (!isParticipant) {
    throw new ForbiddenError('This is not your conversation', 'NOT_CONVERSATION_PARTICIPANT');
  }

  if (scope === DELETE_SCOPE.ME) {
    await chatRepository.hideMessageFor({ messageId, userId });

    /*
     * Only the person who asked is told. Announcing it to the conversation
     * would leak that you cleared a message from your side — the whole point
     * of "delete for me" is that the other person cannot tell.
     */
    return { deleted: true, scope: DELETE_SCOPE.ME };
  }

  if (String(message.senderId) !== String(userId)) {
    throw new ForbiddenError(
      'You can only delete your own messages for everyone',
      'NOT_MESSAGE_OWNER',
    );
  }

  const deleted = await chatRepository.softDeleteMessage(messageId);
  const dto = { ...toMessageDto(deleted), isDeleted: true };

  emitToConversation(message.conversationId, SOCKET_EVENT.MESSAGE_DELETED, dto);
  // The recipient may not have the conversation open; their list needs it too.
  emitToUser(message.recipientId, SOCKET_EVENT.MESSAGE_DELETED, dto);

  // Coins are not refunded: the message was delivered before it was withdrawn.
  return { deleted: true, scope: DELETE_SCOPE.EVERYONE };
}

/**
 * Adds, swaps or clears one person's reaction.
 *
 * Sending the emoji already on the message clears it, so the same tap that
 * added a like removes it — a separate "unreact" call would be a second thing
 * to get wrong for no gain.
 */
export async function reactToMessage({ userId, messageId, emoji }) {
  const message = await chatRepository.findMessageById(messageId);
  if (!message) throw new NotFoundError('Message not found', 'MESSAGE_NOT_FOUND');

  if (message.isDeleted) {
    throw new BadRequestError('That message was deleted', 'MESSAGE_DELETED');
  }

  const isParticipant =
    String(message.senderId) === String(userId) || String(message.recipientId) === String(userId);

  if (!isParticipant) {
    throw new ForbiddenError('This is not your conversation', 'NOT_CONVERSATION_PARTICIPANT');
  }

  const existing = (message.reactions ?? []).find(
    (reaction) => String(reaction.userId) === String(userId),
  );

  const nextEmoji = existing?.emoji === emoji ? null : emoji;
  const updated = await chatRepository.setReaction({ messageId, userId, emoji: nextEmoji });

  /*
   * Each side is told separately because the payload differs: `mine` is true
   * only for whoever actually reacted, and a shared broadcast would light up
   * the other person's chip as if they had tapped it themselves.
   */
  emitToUser(message.senderId, SOCKET_EVENT.MESSAGE_REACTION, toMessageDto(updated, message.senderId));
  emitToUser(
    message.recipientId,
    SOCKET_EVENT.MESSAGE_REACTION,
    toMessageDto(updated, message.recipientId),
  );

  return toMessageDto(updated, userId);
}

export async function getTotalUnreadCount(userId) {
  const total = await chatRepository.countTotalUnread(userId);
  return { unreadCount: total };
}

export async function closeConversation({ userId, conversationId }) {
  await loadParticipantConversation({ conversationId, userId });
  await chatRepository.updateConversationStatus({
    conversationId,
    status: CONVERSATION_STATUS.CLOSED,
  });
  return { closed: true };
}

export const chatService = {
  openConversation,
  sendMessage,
  listConversations,
  getConversation,
  listMessages,
  markConversationRead,
  deleteMessage,
  reactToMessage,
  getTotalUnreadCount,
  closeConversation,
  loadParticipantConversation,
  partnerIdOf,
};
