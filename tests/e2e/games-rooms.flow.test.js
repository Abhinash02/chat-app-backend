import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { GENDER } from '#src/common/constants/index.js';
import { createApp } from '#src/app.js';
import { GameSessionModel } from '#src/modules/games/game-session.model.js';
import { localStorageProvider } from '#src/integrations/storage/index.js';
import { walletRepository } from '#src/modules/coins/wallet.repository.js';
import { applySettings, createUser, resetDatabase } from '../helpers/factories.js';
import { authHeaderFor } from '../helpers/auth.js';

const API = '/api/v1';

let app;

/** Backdates a session so it clears the game's minimum-duration check. */
async function backdateSession(sessionId, seconds) {
  return GameSessionModel.updateOne(
    { _id: sessionId },
    { $set: { startedAt: new Date(Date.now() - seconds * 1000) } },
  );
}

async function playGame({ user, gameKey = 'quick-tap', score = 100, elapsedSeconds = 30 }) {
  const header = authHeaderFor(user);

  const started = await request(app)
    .post(`${API}/games/sessions`)
    .set(header)
    .send({ gameKey })
    .expect(201);

  const { sessionId } = started.body.data;
  await backdateSession(sessionId, elapsedSeconds);

  return request(app)
    .post(`${API}/games/sessions/${sessionId}/complete`)
    .set(header)
    .send({ score });
}

describe('games, leaderboard and rooms', () => {
  beforeAll(() => {
    app = createApp();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  describe('games', () => {
    it('should list the games with the player personal best', async () => {
      const user = await createUser();

      const response = await request(app)
        .get(`${API}/games`)
        .set(authHeaderFor(user))
        .expect(200);

      expect(response.body.data.length).toBeGreaterThan(0);
      expect(response.body.data[0]).toMatchObject({
        key: expect.any(String),
        name: expect.any(String),
        personalBest: 0,
      });
    });

    it('should award points for a completed run', async () => {
      const user = await createUser();

      const response = await playGame({ user, score: 100 });

      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({
        score: 100,
        pointsAwarded: 100,
        totalPoints: 100,
        rank: 1,
      });
    });

    it('should reject a score above what the game can produce', async () => {
      const user = await createUser();

      const response = await playGame({ user, score: 99_999 });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('SCORE_INVALID');
    });

    it('should reject a run that finished implausibly fast', async () => {
      const user = await createUser();

      const response = await playGame({ user, score: 100, elapsedSeconds: 0 });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('GAME_TOO_FAST');
    });

    it('should reject a session completed long after it started', async () => {
      const user = await createUser();

      const response = await playGame({ user, score: 100, elapsedSeconds: 60 * 60 });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('GAME_SESSION_EXPIRED');
    });

    it('should refuse to award the same session twice', async () => {
      const user = await createUser();
      const header = authHeaderFor(user);

      const started = await request(app)
        .post(`${API}/games/sessions`)
        .set(header)
        .send({ gameKey: 'quick-tap' });

      const { sessionId } = started.body.data;
      await backdateSession(sessionId, 30);

      await request(app)
        .post(`${API}/games/sessions/${sessionId}/complete`)
        .set(header)
        .send({ score: 100 })
        .expect(200);

      const replay = await request(app)
        .post(`${API}/games/sessions/${sessionId}/complete`)
        .set(header)
        .send({ score: 100 })
        .expect(400);

      expect(replay.body.error.code).toBe('GAME_ALREADY_COMPLETED');
    });

    it('should refuse to complete someone else session', async () => {
      const player = await createUser();
      const stranger = await createUser();

      const started = await request(app)
        .post(`${API}/games/sessions`)
        .set(authHeaderFor(player))
        .send({ gameKey: 'quick-tap' });

      const { sessionId } = started.body.data;
      await backdateSession(sessionId, 30);

      const response = await request(app)
        .post(`${API}/games/sessions/${sessionId}/complete`)
        .set(authHeaderFor(stranger))
        .send({ score: 50 })
        .expect(403);

      expect(response.body.error.code).toBe('NOT_SESSION_OWNER');
    });

    it('should stop a player who exceeds the daily session limit', async () => {
      await applySettings({ games: { maxSessionsPerDay: 2 } });
      const user = await createUser();
      const header = authHeaderFor(user);

      await request(app).post(`${API}/games/sessions`).set(header).send({ gameKey: 'quick-tap' }).expect(201);
      await request(app).post(`${API}/games/sessions`).set(header).send({ gameKey: 'quick-tap' }).expect(201);

      const response = await request(app)
        .post(`${API}/games/sessions`)
        .set(header)
        .send({ gameKey: 'quick-tap' })
        .expect(429);

      expect(response.body.error.code).toBe('GAME_DAILY_LIMIT');
    });

    it('should reject an unknown game key', async () => {
      const user = await createUser();

      const response = await request(app)
        .post(`${API}/games/sessions`)
        .set(authHeaderFor(user))
        .send({ gameKey: 'not-a-game' })
        .expect(422);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('leaderboard', () => {
    it('should rank every player and show them to each other', async () => {
      const top = await createUser({ nickname: 'champion' });
      const middle = await createUser({ nickname: 'runnerup' });
      const viewer = await createUser({ nickname: 'newcomer' });

      await playGame({ user: top, score: 300 });
      await playGame({ user: middle, score: 150 });

      const response = await request(app)
        .get(`${API}/games/leaderboard`)
        .set(authHeaderFor(viewer))
        .expect(200);

      expect(response.body.data.entries.map((entry) => entry.nickname)).toEqual([
        'champion',
        'runnerup',
      ]);
      expect(response.body.data.entries[0]).toMatchObject({ rank: 1, totalPoints: 300 });
    });

    it('should tell an unranked viewer where they stand', async () => {
      const player = await createUser();
      const viewer = await createUser();
      await playGame({ user: player, score: 200 });

      const response = await request(app)
        .get(`${API}/games/leaderboard`)
        .set(authHeaderFor(viewer))
        .expect(200);

      expect(response.body.data.me).toMatchObject({ rank: 2, totalPoints: 0, isRanked: false });
    });

    it('should mark the viewer own row on the board', async () => {
      const player = await createUser();
      await playGame({ user: player, score: 120 });

      const response = await request(app)
        .get(`${API}/games/leaderboard`)
        .set(authHeaderFor(player))
        .expect(200);

      expect(response.body.data.entries[0].isMe).toBe(true);
      expect(response.body.data.me.isRanked).toBe(true);
    });
  });

  describe('daily coin bonus', () => {
    it('should let a boy claim the bonus and then start a 24 hour countdown', async () => {
      const boy = await createUser({ gender: GENDER.MALE });
      const header = authHeaderFor(boy);

      const before = await request(app).get(`${API}/coins/daily-bonus`).set(header).expect(200);
      expect(before.body.data).toMatchObject({ isAvailable: true, amount: 25 });

      const claim = await request(app).post(`${API}/coins/daily-bonus/claim`).set(header).expect(200);
      expect(claim.body.data.credited).toBe(25);
      expect(claim.body.data.snapshot.coinBalance).toBe(25);

      const after = await request(app).get(`${API}/coins/daily-bonus`).set(header).expect(200);
      expect(after.body.data.isAvailable).toBe(false);
      // The app renders this as a live "next bonus in HH:MM:SS" countdown.
      expect(after.body.data.msRemaining).toBeGreaterThan(23 * 60 * 60 * 1000);
    });

    it('should refuse a second claim inside the same window', async () => {
      const boy = await createUser({ gender: GENDER.MALE });
      const header = authHeaderFor(boy);

      await request(app).post(`${API}/coins/daily-bonus/claim`).set(header).expect(200);
      const second = await request(app).post(`${API}/coins/daily-bonus/claim`).set(header).expect(409);

      expect(second.body.error.code).toBe('DAILY_BONUS_NOT_READY');
      expect((await walletRepository.findByUserId(boy._id)).coinBalance).toBe(25);
    });

    it('should allow the next claim once the window has passed', async () => {
      const boy = await createUser({ gender: GENDER.MALE });
      const header = authHeaderFor(boy);

      await request(app).post(`${API}/coins/daily-bonus/claim`).set(header).expect(200);

      await walletRepository.claimDailyBonus(boy._id, {
        amount: 0,
        eligibleBefore: new Date(),
        now: new Date(Date.now() - 25 * 60 * 60 * 1000),
      });

      const again = await request(app).post(`${API}/coins/daily-bonus/claim`).set(header).expect(200);
      expect(again.body.data.credited).toBe(25);
    });

    it('should not offer the bonus to a girl, who already chats free', async () => {
      const girl = await createUser({ gender: GENDER.FEMALE });
      const header = authHeaderFor(girl);

      const status = await request(app).get(`${API}/coins/daily-bonus`).set(header).expect(200);
      expect(status.body.data.eligible).toBe(false);

      const claim = await request(app).post(`${API}/coins/daily-bonus/claim`).set(header).expect(400);
      expect(claim.body.error.code).toBe('DAILY_BONUS_NOT_APPLICABLE');
    });

    it('should not credit twice when two devices claim at the same moment', async () => {
      const boy = await createUser({ gender: GENDER.MALE });
      const header = authHeaderFor(boy);

      await Promise.all([
        request(app).post(`${API}/coins/daily-bonus/claim`).set(header),
        request(app).post(`${API}/coins/daily-bonus/claim`).set(header),
      ]);

      expect((await walletRepository.findByUserId(boy._id)).coinBalance).toBe(25);
    });
  });

  describe('rooms', () => {
    it('should create a room with the host already seated', async () => {
      const host = await createUser();

      const response = await request(app)
        .post(`${API}/rooms`)
        .set(authHeaderFor(host))
        .send({ name: 'Evening chill', topic: 'Music and chat' })
        .expect(201);

      expect(response.body.data).toMatchObject({
        name: 'Evening chill',
        participantCount: 1,
        isHost: true,
      });
    });

    it('should let anyone join and chat for free, regardless of gender', async () => {
      const host = await createUser({ gender: GENDER.MALE });
      const guest = await createUser({ gender: GENDER.MALE });

      const room = await request(app)
        .post(`${API}/rooms`)
        .set(authHeaderFor(host))
        .send({ name: 'Open room' });

      const roomId = room.body.data.id;

      await request(app).post(`${API}/rooms/${roomId}/join`).set(authHeaderFor(guest)).send({}).expect(200);

      for (let index = 0; index < 15; index += 1) {
        await request(app)
          .post(`${API}/rooms/${roomId}/messages`)
          .set(authHeaderFor(guest))
          .send({ text: `hello ${index}` })
          .expect(201);
      }

      // Rooms are free: nothing was charged for those fifteen messages.
      expect((await walletRepository.findByUserId(guest._id))?.coinBalance ?? 0).toBe(0);
    });

    it('should refuse a message from someone who has not joined', async () => {
      const host = await createUser();
      const outsider = await createUser();

      const room = await request(app)
        .post(`${API}/rooms`)
        .set(authHeaderFor(host))
        .send({ name: 'Private chat' });

      const response = await request(app)
        .post(`${API}/rooms/${room.body.data.id}/messages`)
        .set(authHeaderFor(outsider))
        .send({ text: 'let me in' })
        .expect(403);

      expect(response.body.error.code).toBe('NOT_IN_ROOM');
    });

    it('should require the passcode for a private room', async () => {
      const host = await createUser();
      const guest = await createUser();

      const room = await request(app)
        .post(`${API}/rooms`)
        .set(authHeaderFor(host))
        .send({ name: 'Members only', isPrivate: true, passcode: 'letmein' })
        .expect(201);

      const roomId = room.body.data.id;

      const noPasscode = await request(app)
        .post(`${API}/rooms/${roomId}/join`)
        .set(authHeaderFor(guest))
        .send({})
        .expect(401);
      expect(noPasscode.body.error.code).toBe('PASSCODE_REQUIRED');

      const wrongPasscode = await request(app)
        .post(`${API}/rooms/${roomId}/join`)
        .set(authHeaderFor(guest))
        .send({ passcode: 'guessing' })
        .expect(401);
      expect(wrongPasscode.body.error.code).toBe('PASSCODE_INVALID');

      await request(app)
        .post(`${API}/rooms/${roomId}/join`)
        .set(authHeaderFor(guest))
        .send({ passcode: 'letmein' })
        .expect(200);
    });

    it('should never expose the room passcode hash', async () => {
      const host = await createUser();

      const room = await request(app)
        .post(`${API}/rooms`)
        .set(authHeaderFor(host))
        .send({ name: 'Secret', isPrivate: true, passcode: 'letmein' });

      const listed = await request(app).get(`${API}/rooms`).set(authHeaderFor(host)).expect(200);

      expect(JSON.stringify(room.body)).not.toContain('passcodeHash');
      expect(JSON.stringify(listed.body)).not.toContain('passcodeHash');
    });

    it('should turn people away once the room is full', async () => {
      const host = await createUser();
      const first = await createUser();
      const second = await createUser();

      const room = await request(app)
        .post(`${API}/rooms`)
        .set(authHeaderFor(host))
        .send({ name: 'Tiny room', maxParticipants: 2 })
        .expect(201);

      const roomId = room.body.data.id;

      await request(app).post(`${API}/rooms/${roomId}/join`).set(authHeaderFor(first)).send({}).expect(200);

      const full = await request(app)
        .post(`${API}/rooms/${roomId}/join`)
        .set(authHeaderFor(second))
        .send({})
        .expect(409);

      expect(full.body.error.code).toBe('ROOM_FULL');
    });

    it('should close the room for everyone when the host leaves', async () => {
      const host = await createUser();
      const guest = await createUser();

      const room = await request(app)
        .post(`${API}/rooms`)
        .set(authHeaderFor(host))
        .send({ name: 'Ends with host' });

      const roomId = room.body.data.id;
      await request(app).post(`${API}/rooms/${roomId}/join`).set(authHeaderFor(guest)).send({}).expect(200);

      await request(app).post(`${API}/rooms/${roomId}/leave`).set(authHeaderFor(host)).expect(200);

      const response = await request(app)
        .post(`${API}/rooms/${roomId}/messages`)
        .set(authHeaderFor(guest))
        .send({ text: 'anyone there?' })
        .expect(403);

      expect(response.body.error.code).toBe('ROOM_CLOSED');
    });

    it('should let only the host remove a participant', async () => {
      const host = await createUser();
      const guestA = await createUser();
      const guestB = await createUser();

      const room = await request(app)
        .post(`${API}/rooms`)
        .set(authHeaderFor(host))
        .send({ name: 'Moderated' });

      const roomId = room.body.data.id;
      await request(app).post(`${API}/rooms/${roomId}/join`).set(authHeaderFor(guestA)).send({});
      await request(app).post(`${API}/rooms/${roomId}/join`).set(authHeaderFor(guestB)).send({});

      const notHost = await request(app)
        .delete(`${API}/rooms/${roomId}/participants/${guestB._id}`)
        .set(authHeaderFor(guestA))
        .expect(403);
      expect(notHost.body.error.code).toBe('NOT_ROOM_HOST');

      await request(app)
        .delete(`${API}/rooms/${roomId}/participants/${guestB._id}`)
        .set(authHeaderFor(host))
        .expect(200);
    });

    it('should stop one person hosting two rooms at once', async () => {
      const host = await createUser();

      await request(app).post(`${API}/rooms`).set(authHeaderFor(host)).send({ name: 'First' }).expect(201);

      const second = await request(app)
        .post(`${API}/rooms`)
        .set(authHeaderFor(host))
        .send({ name: 'Second' })
        .expect(409);

      expect(second.body.error.code).toBe('ROOM_ALREADY_HOSTED');
    });

    /**
     * The multipart route, exercised through the middleware chain.
     *
     * Multer has to parse the form before validation reads `req.body` — a
     * service-level test walks straight past that and would not notice the
     * order being wrong.
     */
    describe('media', () => {
      /** A real m4a box header, so nothing rejects it as not-audio. */
      const M4A_BYTES = Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x4d, 0x34, 0x41, 0x20]);

      beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(localStorageProvider, 'upload').mockResolvedValue({
          url: 'https://cdn.example/voice.m4a',
          key: 'stored-key',
          provider: 'local',
          resourceType: 'video',
          durationSeconds: 9,
        });
      });

      it('should accept a voice note over multipart', async () => {
        const host = await createUser();

        const room = await request(app)
          .post(`${API}/rooms`)
          .set(authHeaderFor(host))
          .send({ name: 'Voice room' })
          .expect(201);

        const response = await request(app)
          .post(`${API}/rooms/${room.body.data.id}/media`)
          .set(authHeaderFor(host))
          .attach('file', M4A_BYTES, { filename: 'note.m4a', contentType: 'audio/m4a' })
          .expect(201);

        expect(response.body.data.type).toBe('voice');
        expect(response.body.data.media.durationSeconds).toBe(9);
      });

      it('should refuse media from someone who has not joined', async () => {
        const host = await createUser();
        const outsider = await createUser();

        const room = await request(app)
          .post(`${API}/rooms`)
          .set(authHeaderFor(host))
          .send({ name: 'Private-ish' })
          .expect(201);

        await request(app)
          .post(`${API}/rooms/${room.body.data.id}/media`)
          .set(authHeaderFor(outsider))
          .attach('file', M4A_BYTES, { filename: 'note.m4a', contentType: 'audio/m4a' })
          .expect(403);
      });
    });
  });
});
