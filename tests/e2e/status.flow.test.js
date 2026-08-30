import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { GENDER } from '#src/common/constants/index.js';
import { createApp } from '#src/app.js';
import { localStorageProvider } from '#src/integrations/storage/index.js';
import { createUser, resetDatabase } from '../helpers/factories.js';
import { authHeaderFor } from '../helpers/auth.js';

const API = '/api/v1';

/** A real JPEG header, so nothing along the way rejects it as not-an-image. */
const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

let app;

describe('status over HTTP', () => {
  beforeAll(() => {
    app = createApp();
  });

  beforeEach(async () => {
    await resetDatabase();
    vi.restoreAllMocks();

    vi.spyOn(localStorageProvider, 'upload').mockResolvedValue({
      url: 'https://cdn.example/photo.jpg',
      key: 'stored-key',
      provider: 'local',
      resourceType: 'image',
      durationSeconds: null,
      // A landscape photo: wider than tall, and not a square.
      width: 1080,
      height: 720,
    });
  });

  it('should post a text status and return it in the feed', async () => {
    const girl = await createUser({ gender: GENDER.FEMALE, nickname: 'Ria' });
    const boy = await createUser({ gender: GENDER.MALE });

    await request(app)
      .post(`${API}/status/text`)
      .set(authHeaderFor(girl))
      .send({ text: 'Out for coffee', background: 'ocean' })
      .expect(201);

    const feed = await request(app).get(`${API}/status`).set(authHeaderFor(boy)).expect(200);

    expect(feed.body.data.rings).toHaveLength(1);
    expect(feed.body.data.rings[0].author.nickname).toBe('Ria');
    expect(feed.body.data.rings[0].items[0].text).toBe('Out for coffee');
  });

  /**
   * The route that has broken before.
   *
   * Multer has to run before validation, or `req.body` does not exist yet and
   * the caption field fails a check on a form that was never parsed. Only an
   * HTTP-level test catches that — calling the service directly skips the
   * entire middleware chain.
   */
  it('should accept a multipart photo with a caption', async () => {
    const girl = await createUser({ gender: GENDER.FEMALE });

    const response = await request(app)
      .post(`${API}/status/media`)
      .set(authHeaderFor(girl))
      .field('caption', 'Sunny out')
      .attach('file', JPEG_BYTES, { filename: 'photo.jpg', contentType: 'image/jpeg' })
      .expect(201);

    expect(response.body.data.type).toBe('image');
    expect(response.body.data.media.url).toBe('https://cdn.example/photo.jpg');
    expect(response.body.data.text).toBe('Sunny out');
  });

  it('should accept a photo with no caption at all', async () => {
    const girl = await createUser({ gender: GENDER.FEMALE });

    const response = await request(app)
      .post(`${API}/status/media`)
      .set(authHeaderFor(girl))
      .attach('file', JPEG_BYTES, { filename: 'photo.jpg', contentType: 'image/jpeg' })
      .expect(201);

    expect(response.body.data.text).toBe('');
  });

  /**
   * Portrait, landscape or square — a status is whatever shape the camera
   * produced, and the real proportions have to survive the round trip so the
   * viewer can lay the image out before it loads.
   */
  it('should keep the real proportions of a landscape photo', async () => {
    const girl = await createUser({ gender: GENDER.FEMALE });

    const response = await request(app)
      .post(`${API}/status/media`)
      .set(authHeaderFor(girl))
      .attach('file', JPEG_BYTES, { filename: 'wide.jpg', contentType: 'image/jpeg' })
      .expect(201);

    expect(response.body.data.media.width).toBe(1080);
    expect(response.body.data.media.height).toBe(720);
  });

  it('should keep the real proportions of a portrait photo', async () => {
    const girl = await createUser({ gender: GENDER.FEMALE });

    localStorageProvider.upload.mockResolvedValueOnce({
      url: 'https://cdn.example/tall.jpg',
      key: 'stored-key',
      provider: 'local',
      resourceType: 'image',
      durationSeconds: null,
      width: 720,
      height: 1080,
    });

    const response = await request(app)
      .post(`${API}/status/media`)
      .set(authHeaderFor(girl))
      .attach('file', JPEG_BYTES, { filename: 'tall.jpg', contentType: 'image/jpeg' })
      .expect(201);

    expect(response.body.data.media.height).toBeGreaterThan(response.body.data.media.width);
  });

  /**
   * A multipart form is assembled by the platform as much as by us, so an
   * extra text part is a client quirk, not an attack. Rejecting the upload
   * over one produced a validation error naming a field nobody filled in.
   */
  it('should ignore an extra text field rather than failing the upload', async () => {
    const girl = await createUser({ gender: GENDER.FEMALE });

    const response = await request(app)
      .post(`${API}/status/media`)
      .set(authHeaderFor(girl))
      .field('caption', 'Nice one')
      .field('somethingTheClientAdded', 'noise')
      .attach('file', JPEG_BYTES, { filename: 'photo.jpg', contentType: 'image/jpeg' })
      .expect(201);

    expect(response.body.data.text).toBe('Nice one');
  });

  /**
   * What the web client was actually sending: the file object stringified into
   * a text part, so multer saw no upload at all. The reply has to name the
   * missing file rather than complain about a form field.
   */
  it('should say the file is missing when no file part was sent', async () => {
    const girl = await createUser({ gender: GENDER.FEMALE });

    const response = await request(app)
      .post(`${API}/status/media`)
      .set(authHeaderFor(girl))
      .field('file', '[object Object]')
      .field('caption', 'Sunny out')
      .expect(400);

    expect(response.body.error.code).toBe('FILE_REQUIRED');
  });

  it('should reject a status posted without a session', async () => {
    await request(app).get(`${API}/status`).expect(401);
  });

  it('should count a view and show the author who watched', async () => {
    const girl = await createUser({ gender: GENDER.FEMALE });
    const boy = await createUser({ gender: GENDER.MALE, nickname: 'Arun' });

    const posted = await request(app)
      .post(`${API}/status/text`)
      .set(authHeaderFor(girl))
      .send({ text: 'Hello' })
      .expect(201);

    const statusId = posted.body.data.id;

    await request(app).post(`${API}/status/${statusId}/view`).set(authHeaderFor(boy)).expect(200);

    const viewers = await request(app)
      .get(`${API}/status/${statusId}/viewers`)
      .set(authHeaderFor(girl))
      .expect(200);

    expect(viewers.body.data.viewCount).toBe(1);
    expect(viewers.body.data.viewers[0].nickname).toBe('Arun');
  });

  it('should refuse the viewer list to anyone but the author', async () => {
    const girl = await createUser({ gender: GENDER.FEMALE });
    const boy = await createUser({ gender: GENDER.MALE });

    const posted = await request(app)
      .post(`${API}/status/text`)
      .set(authHeaderFor(girl))
      .send({ text: 'Hello' })
      .expect(201);

    await request(app)
      .get(`${API}/status/${posted.body.data.id}/viewers`)
      .set(authHeaderFor(boy))
      .expect(403);
  });

  it('should reject an unknown background rather than storing it', async () => {
    const girl = await createUser({ gender: GENDER.FEMALE });

    await request(app)
      .post(`${API}/status/text`)
      .set(authHeaderFor(girl))
      .send({ text: 'Hello', background: 'neon-pink' })
      .expect(422);
  });

  it('should delete a status the author owns', async () => {
    const girl = await createUser({ gender: GENDER.FEMALE });
    const boy = await createUser({ gender: GENDER.MALE });

    const posted = await request(app)
      .post(`${API}/status/text`)
      .set(authHeaderFor(girl))
      .send({ text: 'Bye' })
      .expect(201);

    await request(app)
      .delete(`${API}/status/${posted.body.data.id}`)
      .set(authHeaderFor(girl))
      .expect(200);

    const feed = await request(app).get(`${API}/status`).set(authHeaderFor(boy)).expect(200);
    expect(feed.body.data.rings).toHaveLength(0);
  });
});
