import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GENDER } from '#src/common/constants/index.js';
import { MESSAGE_TYPE } from '#src/modules/chat/chat.constants.js';
import { roomService } from '#src/modules/rooms/room.service.js';
import { localStorageProvider } from '#src/integrations/storage/index.js';
import { createUser, resetDatabase, toRequestUser } from '../helpers/factories.js';

/** Stands in for whatever the phone actually recorded. */
function fakeFile(mimetype, size = 200_000) {
  return { buffer: Buffer.alloc(64), mimetype, size };
}

describe('room media', () => {
  beforeEach(async () => {
    await resetDatabase();
    vi.restoreAllMocks();

    // The provider is exercised for real elsewhere; here the point is what the
    // service does with what it returns.
    vi.spyOn(localStorageProvider, 'upload').mockImplementation(async ({ mimeType }) => ({
      url: `https://cdn.example/${mimeType.replace('/', '-')}`,
      key: 'stored-key',
      provider: 'local',
      durationSeconds: mimeType.startsWith('audio/') ? 12 : null,
    }));
  });

  async function roomWithHost() {
    const host = await createUser({ gender: GENDER.MALE });
    const room = await roomService.createRoom({ user: toRequestUser(host), name: 'Media room' });
    return { host, room };
  }

  it('should send a voice note and keep the duration the provider reported', async () => {
    const { host, room } = await roomWithHost();

    const message = await roomService.sendRoomMedia({
      user: toRequestUser(host),
      roomId: room.id,
      file: fakeFile('audio/m4a'),
    });

    expect(message.type).toBe(MESSAGE_TYPE.VOICE);
    expect(message.media.url).toContain('audio-m4a');
    // Duration comes from the provider, never from the sender.
    expect(message.media.durationSeconds).toBe(12);
  });

  it('should send a photo with a caption', async () => {
    const { host, room } = await roomWithHost();

    const message = await roomService.sendRoomMedia({
      user: toRequestUser(host),
      roomId: room.id,
      file: fakeFile('image/jpeg'),
      caption: 'Look at this',
    });

    expect(message.type).toBe(MESSAGE_TYPE.IMAGE);
    expect(message.text).toBe('Look at this');
  });

  it('should send a short video', async () => {
    const { host, room } = await roomWithHost();

    const message = await roomService.sendRoomMedia({
      user: toRequestUser(host),
      roomId: room.id,
      file: fakeFile('video/mp4'),
    });

    expect(message.type).toBe(MESSAGE_TYPE.VIDEO);
  });

  it('should mask blocked words in a caption', async () => {
    const { applySettings } = await import('../helpers/factories.js');
    await applySettings({ moderation: { profanityFilterEnabled: true, blockedWords: ['badword'] } });

    const { host, room } = await roomWithHost();

    const message = await roomService.sendRoomMedia({
      user: toRequestUser(host),
      roomId: room.id,
      file: fakeFile('image/jpeg'),
      caption: 'this is badword here',
    });

    // A caption is a message like any other, so it goes through the same filter.
    expect(message.text).toBe('this is ******* here');
  });

  it('should refuse a file type that is not supported', async () => {
    const { host, room } = await roomWithHost();

    await expect(
      roomService.sendRoomMedia({
        user: toRequestUser(host),
        roomId: room.id,
        file: fakeFile('application/pdf'),
      }),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_FILE_TYPE' });
  });

  it('should refuse someone who has not joined the room', async () => {
    const { room } = await roomWithHost();
    const outsider = await createUser({ gender: GENDER.FEMALE });

    await expect(
      roomService.sendRoomMedia({
        user: toRequestUser(outsider),
        roomId: room.id,
        file: fakeFile('image/jpeg'),
      }),
    ).rejects.toMatchObject({ code: 'NOT_IN_ROOM' });
  });

  it('should require a file', async () => {
    const { host, room } = await roomWithHost();

    await expect(
      roomService.sendRoomMedia({ user: toRequestUser(host), roomId: room.id, file: null }),
    ).rejects.toMatchObject({ code: 'FILE_REQUIRED' });
  });

  it('should appear in the room history', async () => {
    const { host, room } = await roomWithHost();

    await roomService.sendRoomMedia({
      user: toRequestUser(host),
      roomId: room.id,
      file: fakeFile('audio/m4a'),
    });

    const { items } = await roomService.listRoomMessages({
      user: toRequestUser(host),
      roomId: room.id,
    });

    expect(items).toHaveLength(1);
    expect(items[0].type).toBe(MESSAGE_TYPE.VOICE);
    expect(items[0].media.durationSeconds).toBe(12);
  });
});
