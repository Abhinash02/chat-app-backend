import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GENDER } from '#src/common/constants/index.js';
import { localStorageProvider } from '#src/integrations/storage/index.js';
import { StatusModel } from '#src/modules/status/status.model.js';
import { statusService } from '#src/modules/status/status.service.js';
import { STATUS_TYPE } from '#src/modules/status/status.constants.js';
import { createUser, resetDatabase, toRequestUser } from '../helpers/factories.js';

function fakeFile(mimetype, size = 400_000) {
  return { buffer: Buffer.alloc(64), mimetype, size };
}

describe('status', () => {
  /** Set by each test that cares; the upload mock reads it back. */
  let uploadedDuration = null;

  beforeEach(async () => {
    await resetDatabase();
    vi.restoreAllMocks();
    uploadedDuration = null;

    vi.spyOn(localStorageProvider, 'upload').mockImplementation(async ({ mimeType }) => ({
      url: `https://cdn.example/${mimeType.replace('/', '-')}`,
      key: 'stored-key',
      provider: 'local',
      resourceType: mimeType.startsWith('image/') ? 'image' : 'video',
      durationSeconds: uploadedDuration,
    }));

    vi.spyOn(localStorageProvider, 'remove').mockResolvedValue(true);
  });

  describe('posting', () => {
    it('should post a text status on a background', async () => {
      const author = await createUser({ gender: GENDER.FEMALE });

      const status = await statusService.postTextStatus({
        user: toRequestUser(author),
        text: 'Good morning',
        background: 'ocean',
      });

      expect(status.type).toBe(STATUS_TYPE.TEXT);
      expect(status.text).toBe('Good morning');
      expect(status.background).toBe('ocean');
      expect(status.isOwn).toBe(true);
    });

    it('should post a photo with a caption', async () => {
      const author = await createUser({ gender: GENDER.FEMALE });

      const status = await statusService.postMediaStatus({
        user: toRequestUser(author),
        file: fakeFile('image/jpeg'),
        caption: 'Beach day',
      });

      expect(status.type).toBe(STATUS_TYPE.IMAGE);
      expect(status.media.url).toContain('image-jpeg');
      expect(status.text).toBe('Beach day');
    });

    it('should accept a video within the fifteen second limit', async () => {
      const author = await createUser({ gender: GENDER.FEMALE });
      uploadedDuration = 14;

      const status = await statusService.postMediaStatus({
        user: toRequestUser(author),
        file: fakeFile('video/mp4'),
      });

      expect(status.type).toBe(STATUS_TYPE.VIDEO);
      expect(status.media.durationSeconds).toBe(14);
    });

    it('should allow the rounding overshoot a phone recorder produces', async () => {
      const author = await createUser({ gender: GENDER.FEMALE });
      // Asking a phone for 15 seconds routinely yields a little more.
      uploadedDuration = 15.4;

      const status = await statusService.postMediaStatus({
        user: toRequestUser(author),
        file: fakeFile('video/mp4'),
      });

      expect(status.type).toBe(STATUS_TYPE.VIDEO);
    });

    it('should reject a video that is genuinely too long and delete the upload', async () => {
      const author = await createUser({ gender: GENDER.FEMALE });
      uploadedDuration = 42;

      await expect(
        statusService.postMediaStatus({ user: toRequestUser(author), file: fakeFile('video/mp4') }),
      ).rejects.toMatchObject({ code: 'STATUS_VIDEO_TOO_LONG' });

      // An over-long upload must not be left sitting in storage.
      expect(localStorageProvider.remove).toHaveBeenCalledWith('stored-key', { resourceType: 'video' });
      expect(await StatusModel.countDocuments()).toBe(0);
    });

    it('should refuse a file that is neither photo nor video', async () => {
      const author = await createUser({ gender: GENDER.FEMALE });

      await expect(
        statusService.postMediaStatus({ user: toRequestUser(author), file: fakeFile('audio/m4a') }),
      ).rejects.toMatchObject({ code: 'UNSUPPORTED_FILE_TYPE' });
    });

    it('should require a file', async () => {
      const author = await createUser({ gender: GENDER.FEMALE });

      await expect(
        statusService.postMediaStatus({ user: toRequestUser(author), file: undefined }),
      ).rejects.toMatchObject({ code: 'FILE_REQUIRED' });
    });

    it('should set the expiry twenty-four hours out', async () => {
      const author = await createUser({ gender: GENDER.FEMALE });

      const status = await statusService.postTextStatus({
        user: toRequestUser(author),
        text: 'Expires tomorrow',
      });

      const hoursAway = (new Date(status.expiresAt) - Date.now()) / (60 * 60 * 1000);
      expect(hoursAway).toBeGreaterThan(23.9);
      expect(hoursAway).toBeLessThanOrEqual(24);
    });
  });

  describe('the feed', () => {
    it('should show the opposite gender and never your own ring twice', async () => {
      const boy = await createUser({ gender: GENDER.MALE });
      const girl = await createUser({ gender: GENDER.FEMALE, nickname: 'Ria' });
      const otherBoy = await createUser({ gender: GENDER.MALE, nickname: 'Sam' });

      await statusService.postTextStatus({ user: toRequestUser(girl), text: 'Hi there' });
      await statusService.postTextStatus({ user: toRequestUser(otherBoy), text: 'Not for boys' });
      await statusService.postTextStatus({ user: toRequestUser(boy), text: 'Mine' });

      const feed = await statusService.listFeed({ user: toRequestUser(boy) });

      expect(feed.own.items).toHaveLength(1);
      expect(feed.own.items[0].text).toBe('Mine');
      expect(feed.rings).toHaveLength(1);
      expect(feed.rings[0].author.nickname).toBe('Ria');
    });

    it('should group several statuses from one author into one ring', async () => {
      const boy = await createUser({ gender: GENDER.MALE });
      const girl = await createUser({ gender: GENDER.FEMALE });

      await statusService.postTextStatus({ user: toRequestUser(girl), text: 'One' });
      await statusService.postTextStatus({ user: toRequestUser(girl), text: 'Two' });

      const feed = await statusService.listFeed({ user: toRequestUser(boy) });

      expect(feed.rings).toHaveLength(1);
      expect(feed.rings[0].items.map((item) => item.text)).toEqual(['One', 'Two']);
      expect(feed.rings[0].hasUnseen).toBe(true);
    });

    it('should sort rings with something unseen ahead of ones already watched', async () => {
      const boy = await createUser({ gender: GENDER.MALE });
      const seen = await createUser({ gender: GENDER.FEMALE, nickname: 'Seen' });
      const unseen = await createUser({ gender: GENDER.FEMALE, nickname: 'Unseen' });

      const watched = await statusService.postTextStatus({ user: toRequestUser(seen), text: 'Old' });
      await statusService.markViewed({ user: toRequestUser(boy), statusId: watched.id });

      // Posted first, so recency alone would put it last.
      await statusService.postTextStatus({ user: toRequestUser(unseen), text: 'New' });

      const feed = await statusService.listFeed({ user: toRequestUser(boy) });

      expect(feed.rings.map((ring) => ring.author.nickname)).toEqual(['Unseen', 'Seen']);
    });

    it('should hide a status that has passed its expiry before the sweep removes it', async () => {
      const boy = await createUser({ gender: GENDER.MALE });
      const girl = await createUser({ gender: GENDER.FEMALE });

      const status = await statusService.postTextStatus({ user: toRequestUser(girl), text: 'Stale' });

      // TTL deletion is lazy; the query is what actually enforces the window.
      await StatusModel.updateOne({ _id: status.id }, { expiresAt: new Date(Date.now() - 1000) });

      const feed = await statusService.listFeed({ user: toRequestUser(boy) });
      expect(feed.rings).toHaveLength(0);
    });

    it('should offer the text backgrounds so the composer has something to draw', async () => {
      const boy = await createUser({ gender: GENDER.MALE });

      const feed = await statusService.listFeed({ user: toRequestUser(boy) });

      expect(feed.backgrounds.length).toBeGreaterThan(0);
      expect(feed.ttlHours).toBe(24);
    });
  });

  describe('views', () => {
    it('should count a viewer once however many times they reopen it', async () => {
      const girl = await createUser({ gender: GENDER.FEMALE });
      const boy = await createUser({ gender: GENDER.MALE });

      const status = await statusService.postTextStatus({ user: toRequestUser(girl), text: 'Look' });

      const first = await statusService.markViewed({ user: toRequestUser(boy), statusId: status.id });
      const second = await statusService.markViewed({ user: toRequestUser(boy), statusId: status.id });

      expect(first).toEqual({ viewCount: 1, alreadyViewed: false });
      expect(second.alreadyViewed).toBe(true);
      expect(second.viewCount).toBe(1);
    });

    it('should not count the author looking at their own status', async () => {
      const girl = await createUser({ gender: GENDER.FEMALE });

      const status = await statusService.postTextStatus({ user: toRequestUser(girl), text: 'Mine' });
      await statusService.markViewed({ user: toRequestUser(girl), statusId: status.id });

      const { viewCount } = await statusService.listViewers({
        user: toRequestUser(girl),
        statusId: status.id,
      });
      expect(viewCount).toBe(0);
    });

    it('should give the author the viewer list, newest first', async () => {
      const girl = await createUser({ gender: GENDER.FEMALE });
      const first = await createUser({ gender: GENDER.MALE, nickname: 'First' });
      const second = await createUser({ gender: GENDER.MALE, nickname: 'Second' });

      const status = await statusService.postTextStatus({ user: toRequestUser(girl), text: 'Look' });
      await statusService.markViewed({ user: toRequestUser(first), statusId: status.id });
      await statusService.markViewed({ user: toRequestUser(second), statusId: status.id });

      const result = await statusService.listViewers({ user: toRequestUser(girl), statusId: status.id });

      expect(result.viewCount).toBe(2);
      expect(result.viewers.map((viewer) => viewer.nickname)).toEqual(['Second', 'First']);
    });

    it('should refuse to show the viewer list to anyone but the author', async () => {
      const girl = await createUser({ gender: GENDER.FEMALE });
      const boy = await createUser({ gender: GENDER.MALE });

      const status = await statusService.postTextStatus({ user: toRequestUser(girl), text: 'Look' });

      await expect(
        statusService.listViewers({ user: toRequestUser(boy), statusId: status.id }),
      ).rejects.toMatchObject({ code: 'NOT_STATUS_AUTHOR' });
    });

    it('should keep the viewer list out of what a viewer is served', async () => {
      const girl = await createUser({ gender: GENDER.FEMALE });
      const boy = await createUser({ gender: GENDER.MALE });
      const other = await createUser({ gender: GENDER.MALE });

      const status = await statusService.postTextStatus({ user: toRequestUser(girl), text: 'Look' });
      await statusService.markViewed({ user: toRequestUser(other), statusId: status.id });

      const [seen] = await statusService.listByUser({ user: toRequestUser(boy), authorId: girl._id });

      // Who else was watching is the author's business, not the audience's.
      expect(seen.viewers).toBeUndefined();
      expect(seen.viewCount).toBeUndefined();
      expect(seen.hasViewed).toBe(false);
    });

    it('should report a status the viewer has already seen', async () => {
      const girl = await createUser({ gender: GENDER.FEMALE });
      const boy = await createUser({ gender: GENDER.MALE });

      const status = await statusService.postTextStatus({ user: toRequestUser(girl), text: 'Look' });
      await statusService.markViewed({ user: toRequestUser(boy), statusId: status.id });

      const feed = await statusService.listFeed({ user: toRequestUser(boy) });
      expect(feed.rings[0].hasUnseen).toBe(false);
      expect(feed.rings[0].items[0].hasViewed).toBe(true);
    });

    it('should refuse a view on an expired status', async () => {
      const girl = await createUser({ gender: GENDER.FEMALE });
      const boy = await createUser({ gender: GENDER.MALE });

      const status = await statusService.postTextStatus({ user: toRequestUser(girl), text: 'Gone' });
      await StatusModel.updateOne({ _id: status.id }, { expiresAt: new Date(Date.now() - 1000) });

      await expect(
        statusService.markViewed({ user: toRequestUser(boy), statusId: status.id }),
      ).rejects.toMatchObject({ code: 'STATUS_NOT_FOUND' });
    });
  });

  describe('visibility and deletion', () => {
    it('should refuse to play the ring of someone you cannot see', async () => {
      const boy = await createUser({ gender: GENDER.MALE });
      const otherBoy = await createUser({ gender: GENDER.MALE });

      await statusService.postTextStatus({ user: toRequestUser(otherBoy), text: 'Hidden' });

      await expect(
        statusService.listByUser({ user: toRequestUser(boy), authorId: otherBoy._id }),
      ).rejects.toMatchObject({ code: 'STATUS_NOT_VISIBLE' });
    });

    it('should delete a status and the file behind it', async () => {
      const girl = await createUser({ gender: GENDER.FEMALE });

      const status = await statusService.postMediaStatus({
        user: toRequestUser(girl),
        file: fakeFile('image/jpeg'),
      });

      await statusService.deleteStatus({ user: toRequestUser(girl), statusId: status.id });

      // Deleting the row alone would leave the photo reachable by URL.
      expect(localStorageProvider.remove).toHaveBeenCalledWith('stored-key', { resourceType: 'image' });
      expect(await StatusModel.countDocuments()).toBe(0);
    });

    it('should not let one person delete another persons status', async () => {
      const girl = await createUser({ gender: GENDER.FEMALE });
      const boy = await createUser({ gender: GENDER.MALE });

      const status = await statusService.postTextStatus({ user: toRequestUser(girl), text: 'Mine' });

      await expect(
        statusService.deleteStatus({ user: toRequestUser(boy), statusId: status.id }),
      ).rejects.toMatchObject({ code: 'STATUS_NOT_FOUND' });

      expect(await StatusModel.countDocuments()).toBe(1);
    });
  });
});
