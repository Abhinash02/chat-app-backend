import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { GENDER, USER_STATUS } from '#src/common/constants/index.js';
import { createApp } from '#src/app.js';
import { COIN_TRANSACTION_TYPE } from '#src/modules/coins/coins.constants.js';
import { coinsService } from '#src/modules/coins/coins.service.js';
import { applySettings, createUser, resetDatabase } from '../helpers/factories.js';
import { authHeaderFor } from '../helpers/auth.js';

const API = '/api/v1';

let app;

async function giveCoins(user, amount) {
  return coinsService.creditCoins({
    userId: user._id,
    gender: user.gender,
    amount,
    type: COIN_TRANSACTION_TYPE.ADMIN_CREDIT,
    description: 'test top-up',
  });
}

describe('discovery and chat', () => {
  beforeAll(() => {
    app = createApp();
  });

  beforeEach(async () => {
    await resetDatabase();
    // Isolate the coin rules from the introductory allowance.
    await applySettings({ coins: { freeTalkMinutes: 0 } });
  });

  describe('discovery feed', () => {
    it('should show a boy only girls', async () => {
      const boy = await createUser({ gender: GENDER.MALE });
      await createUser({ gender: GENDER.FEMALE, nickname: 'priya' });
      await createUser({ gender: GENDER.MALE, nickname: 'rohan' });

      const response = await request(app)
        .get(`${API}/users/discover`)
        .set(authHeaderFor(boy))
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].nickname).toBe('priya');
    });

    it('should show a girl only boys', async () => {
      const girl = await createUser({ gender: GENDER.FEMALE });
      await createUser({ gender: GENDER.MALE, nickname: 'rohan' });
      await createUser({ gender: GENDER.FEMALE, nickname: 'priya' });

      const response = await request(app)
        .get(`${API}/users/discover`)
        .set(authHeaderFor(girl))
        .expect(200);

      expect(response.body.data.map((item) => item.nickname)).toEqual(['rohan']);
    });

    it('should hide accounts that are not active', async () => {
      const boy = await createUser({ gender: GENDER.MALE });
      await createUser({ gender: GENDER.FEMALE, status: USER_STATUS.PENDING_VERIFICATION });
      await createUser({ gender: GENDER.FEMALE, status: USER_STATUS.SUSPENDED });

      const response = await request(app)
        .get(`${API}/users/discover`)
        .set(authHeaderFor(boy))
        .expect(200);

      expect(response.body.data).toHaveLength(0);
    });

    it('should filter to online users when asked', async () => {
      const boy = await createUser({ gender: GENDER.MALE });
      await createUser({ gender: GENDER.FEMALE, nickname: 'online1', isOnline: true });
      await createUser({ gender: GENDER.FEMALE, nickname: 'offline1', isOnline: false });

      const response = await request(app)
        .get(`${API}/users/discover?onlineOnly=true`)
        .set(authHeaderFor(boy))
        .expect(200);

      expect(response.body.data.map((item) => item.nickname)).toEqual(['online1']);
    });

    it('should hide a user the viewer has blocked, in both directions', async () => {
      const boy = await createUser({ gender: GENDER.MALE });
      const girl = await createUser({ gender: GENDER.FEMALE, nickname: 'blockedgirl' });

      await request(app)
        .post(`${API}/users/${girl._id}/block`)
        .set(authHeaderFor(boy))
        .expect(200);

      const boyFeed = await request(app).get(`${API}/users/discover`).set(authHeaderFor(boy));
      const girlFeed = await request(app).get(`${API}/users/discover`).set(authHeaderFor(girl));

      expect(boyFeed.body.data).toHaveLength(0);
      expect(girlFeed.body.data).toHaveLength(0);
    });

    it('should reject both-or-neither coordinates', async () => {
      const boy = await createUser({ gender: GENDER.MALE });

      const response = await request(app)
        .get(`${API}/users/discover?latitude=28.6`)
        .set(authHeaderFor(boy))
        .expect(422);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('opening a conversation', () => {
    it('should auto-send the greeting when a boy opens a girl profile', async () => {
      const boy = await createUser({ gender: GENDER.MALE });
      const girl = await createUser({ gender: GENDER.FEMALE });
      await giveCoins(boy, 60);

      const response = await request(app)
        .post(`${API}/chat/conversations`)
        .set(authHeaderFor(boy))
        .send({ userId: String(girl._id) })
        .expect(201);

      expect(response.body.data.created).toBe(true);
      expect(response.body.data.greeting.text).toBe('Hi');
    });

    it('should reuse the same thread when the profile is opened again', async () => {
      const boy = await createUser({ gender: GENDER.MALE });
      const girl = await createUser({ gender: GENDER.FEMALE });
      await giveCoins(boy, 60);

      const first = await request(app)
        .post(`${API}/chat/conversations`)
        .set(authHeaderFor(boy))
        .send({ userId: String(girl._id) })
        .expect(201);

      const second = await request(app)
        .post(`${API}/chat/conversations`)
        .set(authHeaderFor(boy))
        .send({ userId: String(girl._id) })
        .expect(201);

      expect(second.body.data.created).toBe(false);
      expect(second.body.data.conversation.id).toBe(first.body.data.conversation.id);
      // The greeting is sent once, not on every visit.
      expect(second.body.data.greeting).toBeNull();
    });

    it('should still open the thread when the greeting cannot be paid for', async () => {
      const boy = await createUser({ gender: GENDER.MALE });
      const girl = await createUser({ gender: GENDER.FEMALE });

      const response = await request(app)
        .post(`${API}/chat/conversations`)
        .set(authHeaderFor(boy))
        .send({ userId: String(girl._id) })
        .expect(201);

      expect(response.body.data.conversation.id).toBeTruthy();
      expect(response.body.data.greeting).toBeNull();
      expect(response.body.data.greetingSkippedReason).toBe('INSUFFICIENT_COINS');
    });

    it('should refuse a chat between two users of the same gender', async () => {
      const boy = await createUser({ gender: GENDER.MALE });
      const otherBoy = await createUser({ gender: GENDER.MALE });

      const response = await request(app)
        .post(`${API}/chat/conversations`)
        .set(authHeaderFor(boy))
        .send({ userId: String(otherBoy._id) })
        .expect(403);

      expect(response.body.error.code).toBe('GENDER_MISMATCH');
    });

    it('should refuse a chat with yourself', async () => {
      const boy = await createUser({ gender: GENDER.MALE });

      const response = await request(app)
        .post(`${API}/chat/conversations`)
        .set(authHeaderFor(boy))
        .send({ userId: String(boy._id) })
        .expect(400);

      expect(response.body.error.code).toBe('CANNOT_CHAT_SELF');
    });
  });

  describe('sending messages', () => {
    async function openThread({ coins = 60 } = {}) {
      const boy = await createUser({ gender: GENDER.MALE });
      const girl = await createUser({ gender: GENDER.FEMALE });
      if (coins > 0) await giveCoins(boy, coins);

      const response = await request(app)
        .post(`${API}/chat/conversations`)
        .set(authHeaderFor(boy))
        .send({ userId: String(girl._id) });

      return { boy, girl, conversationId: response.body.data.conversation.id };
    }

    it('should report the live wallet state with every sent message', async () => {
      const { boy, conversationId } = await openThread();

      const response = await request(app)
        .post(`${API}/chat/conversations/${conversationId}/messages`)
        .set(authHeaderFor(boy))
        .send({ text: 'How are you?' })
        .expect(201);

      expect(response.body.data.billing.wallet).toMatchObject({
        coinBalance: expect.any(Number),
        messageCredits: expect.any(Number),
        isChargedAccount: true,
      });
    });

    it('should charge 10 coins per 7 messages over the HTTP API', async () => {
      const { boy, conversationId } = await openThread();
      const header = authHeaderFor(boy);

      // The auto-greeting already consumed one message of the first block.
      for (let index = 0; index < 6; index += 1) {
        await request(app)
          .post(`${API}/chat/conversations/${conversationId}/messages`)
          .set(header)
          .send({ text: `message ${index}` })
          .expect(201);
      }

      const wallet = await request(app).get(`${API}/coins/wallet`).set(header).expect(200);
      expect(wallet.body.data.coinBalance).toBe(50);
    });

    it('should answer 402 with what is needed once coins run out', async () => {
      const { boy, conversationId } = await openThread({ coins: 10 });
      const header = authHeaderFor(boy);

      for (let index = 0; index < 6; index += 1) {
        await request(app)
          .post(`${API}/chat/conversations/${conversationId}/messages`)
          .set(header)
          .send({ text: `message ${index}` })
          .expect(201);
      }

      const response = await request(app)
        .post(`${API}/chat/conversations/${conversationId}/messages`)
        .set(header)
        .send({ text: 'one too many' })
        .expect(402);

      expect(response.body.error.code).toBe('INSUFFICIENT_COINS');
      expect(response.body.error.details).toMatchObject({ required: 10, messagesPerBlock: 7 });
    });

    it('should let a girl reply without ever spending coins', async () => {
      const { girl, conversationId } = await openThread();
      const header = authHeaderFor(girl);

      for (let index = 0; index < 20; index += 1) {
        await request(app)
          .post(`${API}/chat/conversations/${conversationId}/messages`)
          .set(header)
          .send({ text: `reply ${index}` })
          .expect(201);
      }

      const wallet = await request(app).get(`${API}/coins/wallet`).set(header).expect(200);

      expect(wallet.body.data.coinBalance).toBe(0);
      expect(wallet.body.data.isUnlimited).toBe(true);
      expect(wallet.body.data.estimatedMessagesRemaining).toBeNull();
    });

    it('should tag an emoji-only message so the UI can render it larger', async () => {
      const { girl, conversationId } = await openThread();

      const response = await request(app)
        .post(`${API}/chat/conversations/${conversationId}/messages`)
        .set(authHeaderFor(girl))
        .send({ text: String.fromCodePoint(0x1f60a) })
        .expect(201);

      expect(response.body.data.message.type).toBe('emoji');
    });

    it('should reject an empty message', async () => {
      const { girl, conversationId } = await openThread();

      const response = await request(app)
        .post(`${API}/chat/conversations/${conversationId}/messages`)
        .set(authHeaderFor(girl))
        .send({ text: '   ' })
        .expect(400);

      expect(response.body.error.code).toBe('EMPTY_MESSAGE');
    });

    it('should enforce the admin-configured message length', async () => {
      await applySettings({ chat: { maxMessageLength: 10 } });
      const { girl, conversationId } = await openThread();

      const response = await request(app)
        .post(`${API}/chat/conversations/${conversationId}/messages`)
        .set(authHeaderFor(girl))
        .send({ text: 'this is definitely longer than ten' })
        .expect(400);

      expect(response.body.error.code).toBe('MESSAGE_TOO_LONG');
    });

    it('should refuse a stranger writing into someone else conversation', async () => {
      const { conversationId } = await openThread();
      const outsider = await createUser({ gender: GENDER.MALE });
      await giveCoins(outsider, 100);

      const response = await request(app)
        .post(`${API}/chat/conversations/${conversationId}/messages`)
        .set(authHeaderFor(outsider))
        .send({ text: 'let me in' })
        .expect(403);

      expect(response.body.error.code).toBe('NOT_A_PARTICIPANT');
    });
  });

  describe('unread tracking', () => {
    it('should count the partner unread messages and clear them on read', async () => {
      const boy = await createUser({ gender: GENDER.MALE });
      const girl = await createUser({ gender: GENDER.FEMALE });
      await giveCoins(boy, 60);

      const opened = await request(app)
        .post(`${API}/chat/conversations`)
        .set(authHeaderFor(boy))
        .send({ userId: String(girl._id) });

      const conversationId = opened.body.data.conversation.id;

      const before = await request(app)
        .get(`${API}/chat/unread-count`)
        .set(authHeaderFor(girl))
        .expect(200);

      expect(before.body.data.unreadCount).toBe(1);

      await request(app)
        .post(`${API}/chat/conversations/${conversationId}/read`)
        .set(authHeaderFor(girl))
        .expect(200);

      const after = await request(app)
        .get(`${API}/chat/unread-count`)
        .set(authHeaderFor(girl))
        .expect(200);

      expect(after.body.data.unreadCount).toBe(0);
    });
  });
});
