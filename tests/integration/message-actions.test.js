import { beforeEach, describe, expect, it } from 'vitest';

import { GENDER } from '#src/common/constants/index.js';
import { chatService } from '#src/modules/chat/chat.service.js';
import { coinsService } from '#src/modules/coins/coins.service.js';
import { COIN_TRANSACTION_TYPE } from '#src/modules/coins/coins.constants.js';
import { DELETE_SCOPE } from '#src/modules/chat/chat.constants.js';
import { MessageModel } from '#src/modules/chat/message.model.js';
import { createUser, resetDatabase, toRequestUser } from '../helpers/factories.js';

describe('message actions', () => {
  let boy;
  let girl;
  let conversationId;

  beforeEach(async () => {
    await resetDatabase();

    boy = await createUser({ gender: GENDER.MALE, nickname: 'Arun' });
    girl = await createUser({ gender: GENDER.FEMALE, nickname: 'Ria' });

    // Billing is not what these tests are about; fund the boy so sending never
    // fails for lack of coins. Girls are never charged.
    await coinsService.creditCoins({
      userId: boy._id,
      gender: boy.gender,
      amount: 500,
      type: COIN_TRANSACTION_TYPE.ADMIN_CREDIT,
      description: 'test top-up',
    });

    const opened = await chatService.openConversation({
      user: toRequestUser(boy),
      targetUserId: String(girl._id),
    });
    conversationId = opened.conversation.id;
  });

  async function sendFrom(user, text) {
    const { message } = await chatService.sendMessage({
      user: toRequestUser(user),
      conversationId,
      text,
    });
    return message;
  }

  describe('delivery state', () => {
    it('should report a message as sent while the other person is offline', async () => {
      const message = await sendFrom(boy, 'Hello there');
      expect(message.deliveryState).toBe('sent');
    });

    /**
     * The tick that used to be wrong: a message could sit on someone's phone,
     * already in their notification shade, while the sender still saw one tick.
     */
    it('should report delivered as soon as it reaches a connected recipient', async () => {
      girl.isOnline = true;
      await girl.save();

      const message = await sendFrom(boy, 'Are you there');
      expect(message.deliveryState).toBe('delivered');
      expect(message.deliveredAt).not.toBeNull();
    });

    it('should report read once the other person opens the thread', async () => {
      await sendFrom(boy, 'Look at this');
      await chatService.markConversationRead({ userId: String(girl._id), conversationId });

      const { items } = await chatService.listMessages({
        userId: String(boy._id),
        conversationId,
      });

      expect(items[items.length - 1].deliveryState).toBe('read');
    });
  });

  describe('deleting', () => {
    it('should hide a message from one side only', async () => {
      const message = await sendFrom(boy, 'Only I will lose this');

      await chatService.deleteMessage({
        userId: String(boy._id),
        messageId: message.id,
        scope: DELETE_SCOPE.ME,
      });

      const mine = await chatService.listMessages({ userId: String(boy._id), conversationId });
      const theirs = await chatService.listMessages({ userId: String(girl._id), conversationId });

      expect(mine.items.some((item) => item.id === message.id)).toBe(false);
      // The other person keeps their copy, text intact.
      const kept = theirs.items.find((item) => item.id === message.id);
      expect(kept.text).toBe('Only I will lose this');
    });

    it('should let the recipient hide a message they did not send', async () => {
      const message = await sendFrom(boy, 'Unwanted');

      await chatService.deleteMessage({
        userId: String(girl._id),
        messageId: message.id,
        scope: DELETE_SCOPE.ME,
      });

      const theirs = await chatService.listMessages({ userId: String(girl._id), conversationId });
      expect(theirs.items.some((item) => item.id === message.id)).toBe(false);
    });

    it('should withdraw a message from both sides and destroy the text', async () => {
      const message = await sendFrom(boy, 'Sent by mistake');

      await chatService.deleteMessage({
        userId: String(boy._id),
        messageId: message.id,
        scope: DELETE_SCOPE.EVERYONE,
      });

      const stored = await MessageModel.findById(message.id).lean();
      // "Deleted for everyone" has to be true of the database, not just the UI.
      expect(stored.text).toBe('');
      expect(stored.isDeleted).toBe(true);
    });

    /**
     * The tombstone has to survive a reload, or the conversation quietly
     * rewrites itself and the other person wonders what they misread.
     */
    it('should keep a withdrawn message in history as a tombstone', async () => {
      const message = await sendFrom(boy, 'Sent by mistake');

      await chatService.deleteMessage({
        userId: String(boy._id),
        messageId: message.id,
        scope: DELETE_SCOPE.EVERYONE,
      });

      const theirs = await chatService.listMessages({ userId: String(girl._id), conversationId });
      const tombstone = theirs.items.find((item) => item.id === message.id);

      expect(tombstone).toBeDefined();
      expect(tombstone.isDeleted).toBe(true);
      expect(tombstone.text).toBe('');
    });

    it('should refuse to withdraw someone elses message for everyone', async () => {
      const message = await sendFrom(boy, 'Mine');

      await expect(
        chatService.deleteMessage({
          userId: String(girl._id),
          messageId: message.id,
          scope: DELETE_SCOPE.EVERYONE,
        }),
      ).rejects.toMatchObject({ code: 'NOT_MESSAGE_OWNER' });
    });
  });

  describe('reactions', () => {
    it('should add a reaction and show it as the reactors own', async () => {
      const message = await sendFrom(boy, 'Nice one');

      const updated = await chatService.reactToMessage({
        userId: String(girl._id),
        messageId: message.id,
        emoji: '❤️',
      });

      expect(updated.reactions).toEqual([{ emoji: '❤️', count: 1, mine: true }]);
    });

    it('should not show someone elses reaction as your own', async () => {
      const message = await sendFrom(boy, 'Nice one');

      await chatService.reactToMessage({
        userId: String(girl._id),
        messageId: message.id,
        emoji: '❤️',
      });

      const { items } = await chatService.listMessages({
        userId: String(boy._id),
        conversationId,
      });
      const seen = items.find((item) => item.id === message.id);

      expect(seen.reactions[0]).toEqual({ emoji: '❤️', count: 1, mine: false });
    });

    it('should clear the reaction when the same emoji is tapped again', async () => {
      const message = await sendFrom(boy, 'Nice one');

      await chatService.reactToMessage({
        userId: String(girl._id),
        messageId: message.id,
        emoji: '❤️',
      });
      const cleared = await chatService.reactToMessage({
        userId: String(girl._id),
        messageId: message.id,
        emoji: '❤️',
      });

      expect(cleared.reactions).toEqual([]);
    });

    it('should replace rather than stack when a different emoji is chosen', async () => {
      const message = await sendFrom(boy, 'Nice one');

      await chatService.reactToMessage({
        userId: String(girl._id),
        messageId: message.id,
        emoji: '❤️',
      });
      const swapped = await chatService.reactToMessage({
        userId: String(girl._id),
        messageId: message.id,
        emoji: '😂',
      });

      expect(swapped.reactions).toEqual([{ emoji: '😂', count: 1, mine: true }]);
    });

    it('should count both people reacting with the same emoji', async () => {
      const message = await sendFrom(boy, 'Nice one');

      await chatService.reactToMessage({
        userId: String(girl._id),
        messageId: message.id,
        emoji: '👍',
      });
      const both = await chatService.reactToMessage({
        userId: String(boy._id),
        messageId: message.id,
        emoji: '👍',
      });

      expect(both.reactions).toEqual([{ emoji: '👍', count: 2, mine: true }]);
    });

    it('should refuse a reaction on a withdrawn message', async () => {
      const message = await sendFrom(boy, 'Gone');

      await chatService.deleteMessage({
        userId: String(boy._id),
        messageId: message.id,
        scope: DELETE_SCOPE.EVERYONE,
      });

      await expect(
        chatService.reactToMessage({
          userId: String(girl._id),
          messageId: message.id,
          emoji: '❤️',
        }),
      ).rejects.toMatchObject({ code: 'MESSAGE_DELETED' });
    });
  });
});
