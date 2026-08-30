import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GENDER } from '#src/common/constants/index.js';
import { chatService } from '#src/modules/chat/chat.service.js';
import { coinsService } from '#src/modules/coins/coins.service.js';
import { COIN_TRANSACTION_TYPE } from '#src/modules/coins/coins.constants.js';
import { localStorageProvider } from '#src/integrations/storage/index.js';
import { MessageModel } from '#src/modules/chat/message.model.js';
import { applySettings, createUser, resetDatabase, toRequestUser } from '../helpers/factories.js';

function fakePhoto(mimetype = 'image/jpeg', size = 240_000) {
  return { buffer: Buffer.alloc(64), mimetype, size };
}

describe('photos in chat', () => {
  let boy;
  let girl;
  let conversationId;

  beforeEach(async () => {
    await resetDatabase();
    vi.restoreAllMocks();

    // Free minutes would mask the billing behaviour these tests are about.
    await applySettings({ coins: { freeTalkMinutes: 0 } });

    vi.spyOn(localStorageProvider, 'upload').mockResolvedValue({
      url: 'https://cdn.example/photo.jpg',
      key: 'stored-key',
      provider: 'local',
      resourceType: 'image',
      width: 1080,
      height: 810,
    });

    boy = await createUser({ gender: GENDER.MALE, nickname: 'Arun' });
    girl = await createUser({ gender: GENDER.FEMALE, nickname: 'Ria' });

    const opened = await chatService.openConversation({
      user: toRequestUser(boy),
      targetUserId: String(girl._id),
    });
    conversationId = opened.conversation.id;
  });

  async function fund(user, amount) {
    return coinsService.creditCoins({
      userId: user._id,
      gender: user.gender,
      amount,
      type: COIN_TRANSACTION_TYPE.ADMIN_CREDIT,
      description: 'test top-up',
    });
  }

  it('should send a photo and keep its real proportions', async () => {
    await fund(boy, 100);

    const { message } = await chatService.sendImageMessage({
      user: toRequestUser(boy),
      conversationId,
      file: fakePhoto(),
    });

    expect(message.type).toBe('image');
    expect(message.media.url).toBe('https://cdn.example/photo.jpg');
    expect(message.media.width).toBe(1080);
    expect(message.media.height).toBe(810);
  });

  it('should send a photo with a caption', async () => {
    await fund(boy, 100);

    const { message } = await chatService.sendImageMessage({
      user: toRequestUser(boy),
      conversationId,
      file: fakePhoto(),
      caption: 'Look at this',
    });

    expect(message.text).toBe('Look at this');
  });

  it('should allow a photo with no caption at all', async () => {
    await fund(boy, 100);

    const { message } = await chatService.sendImageMessage({
      user: toRequestUser(boy),
      conversationId,
      file: fakePhoto(),
    });

    expect(message.text).toBe('');
  });

  /**
   * The rule worth pinning down: a photo is a message and costs like one.
   * Free photos would be an obvious way around the coin system.
   */
  it('should bill a photo exactly like a text message', async () => {
    await fund(boy, 10);

    const { billing } = await chatService.sendImageMessage({
      user: toRequestUser(boy),
      conversationId,
      file: fakePhoto(),
    });

    expect(billing.coinsCharged).toBe(10);
    expect(billing.wallet.coinBalance).toBe(0);
  });

  it('should refuse a photo the sender cannot pay for', async () => {
    await expect(
      chatService.sendImageMessage({
        user: toRequestUser(boy),
        conversationId,
        file: fakePhoto(),
      }),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_COINS' });
  });

  /**
   * Billing runs before the upload, so a refused message never reaches
   * storage — otherwise the bill and the thread disagree and someone has to
   * reconcile a stray file by hand.
   */
  it('should not store a file for a message it refused to bill', async () => {
    await expect(
      chatService.sendImageMessage({
        user: toRequestUser(boy),
        conversationId,
        file: fakePhoto(),
      }),
    ).rejects.toThrow();

    expect(localStorageProvider.upload).not.toHaveBeenCalled();
    expect(await MessageModel.countDocuments({ type: 'image' })).toBe(0);
  });

  it('should never charge a girl for a photo', async () => {
    const { billing } = await chatService.sendImageMessage({
      user: toRequestUser(girl),
      conversationId,
      file: fakePhoto(),
    });

    expect(billing.coinsCharged).toBe(0);
  });

  it('should refuse a file that is not a photo', async () => {
    await fund(boy, 100);

    await expect(
      chatService.sendImageMessage({
        user: toRequestUser(boy),
        conversationId,
        file: fakePhoto('audio/m4a'),
      }),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_FILE_TYPE' });
  });

  it('should require a file', async () => {
    await fund(boy, 100);

    await expect(
      chatService.sendImageMessage({ user: toRequestUser(boy), conversationId, file: undefined }),
    ).rejects.toMatchObject({ code: 'FILE_REQUIRED' });
  });

  it('should mask blocked words in a caption', async () => {
    await fund(boy, 100);
    await applySettings({
      moderation: { profanityFilterEnabled: true, blockedWords: ['badword'] },
    });

    const { message } = await chatService.sendImageMessage({
      user: toRequestUser(boy),
      conversationId,
      file: fakePhoto(),
      caption: 'this is badword here',
    });

    expect(message.text).toBe('this is ******* here');
  });

  it('should show the photo in the thread history', async () => {
    await fund(boy, 100);

    await chatService.sendImageMessage({
      user: toRequestUser(boy),
      conversationId,
      file: fakePhoto(),
      caption: 'Beach',
    });

    const { items } = await chatService.listMessages({
      userId: String(girl._id),
      conversationId,
    });
    const photo = items.find((item) => item.type === 'image');

    expect(photo.media.url).toBe('https://cdn.example/photo.jpg');
    expect(photo.text).toBe('Beach');
  });

  /** An empty line in the conversation list reads as a bug. */
  it('should preview an uncaptioned photo as a photo in the conversation list', async () => {
    await fund(boy, 100);

    await chatService.sendImageMessage({
      user: toRequestUser(boy),
      conversationId,
      file: fakePhoto(),
    });

    const { items } = await chatService.listConversations({ userId: String(girl._id) });
    expect(items[0].lastMessage.text).toBe('📷 Photo');
  });
});
