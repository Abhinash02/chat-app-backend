import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { GENDER, USER_STATUS } from '#src/common/constants/index.js';
import { createApp } from '#src/app.js';
import { OTP_PURPOSE } from '#src/modules/auth/auth.constants.js';
import { UserModel } from '#src/modules/users/user.model.js';
import { walletRepository } from '#src/modules/coins/wallet.repository.js';
import { resetDatabase, setKnownOtp } from '../helpers/factories.js';

const API = '/api/v1';
const KNOWN_CODE = '123456';

let app;

const validRegistration = {
  name: 'Aarav Sharma',
  nickname: 'aarav',
  email: 'aarav@example.com',
  password: 'Str0ngPass1',
  gender: GENDER.MALE,
};

async function registerAndVerify(overrides = {}) {
  const payload = { ...validRegistration, ...overrides };

  await request(app).post(`${API}/auth/register`).send(payload).expect(201);

  const user = await UserModel.findOne({ email: payload.email }).lean().exec();
  await setKnownOtp({
    userId: user._id,
    purpose: OTP_PURPOSE.EMAIL_VERIFICATION,
    code: KNOWN_CODE,
    email: payload.email,
  });

  const response = await request(app)
    .post(`${API}/auth/verify-email`)
    .send({ email: payload.email, code: KNOWN_CODE })
    .expect(200);

  return { payload, tokens: response.body.data.tokens, user: response.body.data.user };
}

describe('authentication flow', () => {
  beforeAll(() => {
    app = createApp();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  describe('registration', () => {
    it('should sign the user in immediately, while still asking them to verify', async () => {
      const response = await request(app)
        .post(`${API}/auth/register`)
        .send(validRegistration)
        .expect(201);

      expect(response.body.success).toBe(true);

      // Signup lands in the app rather than on a "check your inbox" wall.
      expect(response.body.data.tokens.accessToken).toBeTruthy();
      expect(response.body.data.tokens.refreshToken).toBeTruthy();

      // The code is still sent, and the account is still unverified.
      expect(response.body.data.user.status).toBe(USER_STATUS.PENDING_VERIFICATION);
      expect(response.body.data.verification).toMatchObject({ required: true, pending: true });
    });

    it('should let a brand new account use that session straight away', async () => {
      const registered = await request(app)
        .post(`${API}/auth/register`)
        .send(validRegistration)
        .expect(201);

      const response = await request(app)
        .get(`${API}/auth/me`)
        .set('Authorization', `Bearer ${registered.body.data.tokens.accessToken}`)
        .expect(200);

      expect(response.body.data.email).toBe(validRegistration.email);
    });

    it('should give every new account an avatar without a photo', async () => {
      const response = await request(app)
        .post(`${API}/auth/register`)
        .send(validRegistration)
        .expect(201);

      const { user } = response.body.data;

      // A generated emoji stands in until the user uploads a real photo, so
      // nobody ever appears as a blank silhouette.
      expect(user.avatarEmoji).toBeTruthy();
      expect(user.avatarColor).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(user.avatarUrl).toBeNull();
    });

    it('should pick the avatar from a set matching the account gender', async () => {
      const { AVATAR_EMOJI_BY_GENDER } = await import('#src/modules/users/avatar.constants.js');

      const boy = await request(app)
        .post(`${API}/auth/register`)
        .send({ ...validRegistration, email: 'boy@example.com', nickname: 'boy1' })
        .expect(201);

      const girl = await request(app)
        .post(`${API}/auth/register`)
        .send({ ...validRegistration, email: 'girl@example.com', nickname: 'girl1', gender: GENDER.FEMALE })
        .expect(201);

      expect(AVATAR_EMOJI_BY_GENDER.male).toContain(boy.body.data.user.avatarEmoji);
      expect(AVATAR_EMOJI_BY_GENDER.female).toContain(girl.body.data.user.avatarEmoji);
    });

    it('should never return the password hash', async () => {
      const response = await request(app).post(`${API}/auth/register`).send(validRegistration);

      expect(JSON.stringify(response.body)).not.toContain('passwordHash');
    });

    it('should create the wallet at registration', async () => {
      await request(app).post(`${API}/auth/register`).send(validRegistration).expect(201);

      const user = await UserModel.findOne({ email: validRegistration.email }).lean().exec();
      const wallet = await walletRepository.findByUserId(user._id);

      expect(wallet).not.toBeNull();
      expect(wallet.freeTalkSecondsRemaining).toBe(30 * 60);
    });

    it('should reject a duplicate email with 409', async () => {
      await request(app).post(`${API}/auth/register`).send(validRegistration).expect(201);

      const response = await request(app)
        .post(`${API}/auth/register`)
        .send({ ...validRegistration, nickname: 'aarav2' })
        .expect(409);

      expect(response.body.error.code).toBe('EMAIL_TAKEN');
    });

    it('should reject a duplicate nickname regardless of casing', async () => {
      await request(app).post(`${API}/auth/register`).send(validRegistration).expect(201);

      const response = await request(app)
        .post(`${API}/auth/register`)
        .send({ ...validRegistration, email: 'other@example.com', nickname: 'AARAV' })
        .expect(409);

      expect(response.body.error.code).toBe('NICKNAME_TAKEN');
    });

    it('should reject a weak password with a field-level message', async () => {
      const response = await request(app)
        .post(`${API}/auth/register`)
        .send({ ...validRegistration, password: 'weak' })
        .expect(422);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.details.some((issue) => issue.field === 'password')).toBe(true);
    });

    it('should require a gender, since discovery depends on it', async () => {
      const { gender: _omitted, ...withoutGender } = validRegistration;

      const response = await request(app)
        .post(`${API}/auth/register`)
        .send(withoutGender)
        .expect(422);

      expect(response.body.error.details.some((issue) => issue.field === 'gender')).toBe(true);
    });

    it('should reject unknown fields instead of silently ignoring them', async () => {
      const response = await request(app)
        .post(`${API}/auth/register`)
        .send({ ...validRegistration, role: 'super_admin' })
        .expect(422);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('email verification', () => {
    it('should activate the account and issue tokens on the right code', async () => {
      const { user, tokens } = await registerAndVerify();

      expect(user.status).toBe(USER_STATUS.ACTIVE);
      expect(user.isEmailVerified).toBe(true);
      expect(tokens.accessToken).toBeTruthy();
      expect(tokens.refreshToken).toBeTruthy();
    });

    it('should reject a wrong code and report the attempts left', async () => {
      await request(app).post(`${API}/auth/register`).send(validRegistration).expect(201);

      const user = await UserModel.findOne({ email: validRegistration.email }).lean().exec();
      await setKnownOtp({
        userId: user._id,
        purpose: OTP_PURPOSE.EMAIL_VERIFICATION,
        code: KNOWN_CODE,
        email: validRegistration.email,
      });

      const response = await request(app)
        .post(`${API}/auth/verify-email`)
        .send({ email: validRegistration.email, code: '000000' })
        .expect(400);

      expect(response.body.error.code).toBe('OTP_INVALID');
      expect(response.body.error.details.attemptsRemaining).toBe(4);
    });

    it('should burn the code after too many wrong guesses', async () => {
      await request(app).post(`${API}/auth/register`).send(validRegistration).expect(201);

      const user = await UserModel.findOne({ email: validRegistration.email }).lean().exec();
      await setKnownOtp({
        userId: user._id,
        purpose: OTP_PURPOSE.EMAIL_VERIFICATION,
        code: KNOWN_CODE,
        email: validRegistration.email,
      });

      for (let attempt = 0; attempt < 5; attempt += 1) {
        await request(app)
          .post(`${API}/auth/verify-email`)
          .send({ email: validRegistration.email, code: '000000' });
      }

      // Even the correct code is now refused.
      const response = await request(app)
        .post(`${API}/auth/verify-email`)
        .send({ email: validRegistration.email, code: KNOWN_CODE })
        .expect(429);

      expect(response.body.error.code).toBe('OTP_ATTEMPTS_EXCEEDED');
    });

    it('should not reveal whether an address is registered when resending', async () => {
      const response = await request(app)
        .post(`${API}/auth/resend-code`)
        .send({ email: 'nobody@example.com' })
        .expect(200);

      expect(response.body.data.sent).toBe(true);
    });
  });

  describe('login', () => {
    it('should sign in a verified account', async () => {
      const { payload } = await registerAndVerify();

      const response = await request(app)
        .post(`${API}/auth/login`)
        .send({ email: payload.email, password: payload.password })
        .expect(200);

      expect(response.body.data.tokens.accessToken).toBeTruthy();
    });

    it('should give the same error for an unknown email and a wrong password', async () => {
      const { payload } = await registerAndVerify();

      const wrongPassword = await request(app)
        .post(`${API}/auth/login`)
        .send({ email: payload.email, password: 'Wr0ngPass1' })
        .expect(401);

      const unknownEmail = await request(app)
        .post(`${API}/auth/login`)
        .send({ email: 'ghost@example.com', password: 'Wr0ngPass1' })
        .expect(401);

      expect(wrongPassword.body.error).toEqual(unknownEmail.body.error);
      expect(wrongPassword.body.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('should route an unverified account back to the OTP screen', async () => {
      await request(app).post(`${API}/auth/register`).send(validRegistration).expect(201);

      const response = await request(app)
        .post(`${API}/auth/login`)
        .send({ email: validRegistration.email, password: validRegistration.password })
        .expect(403);

      expect(response.body.error.code).toBe('EMAIL_NOT_VERIFIED');
    });

    it('should refuse a suspended account with its reason', async () => {
      const { payload } = await registerAndVerify();
      await UserModel.updateOne(
        { email: payload.email },
        { $set: { status: USER_STATUS.SUSPENDED, suspendedReason: 'Breaking the rules' } },
      );

      const response = await request(app)
        .post(`${API}/auth/login`)
        .send({ email: payload.email, password: payload.password })
        .expect(403);

      expect(response.body.error.code).toBe('ACCOUNT_SUSPENDED');
    });
  });

  describe('sessions', () => {
    it('should return the signed-in user from /me', async () => {
      const { tokens, payload } = await registerAndVerify();

      const response = await request(app)
        .get(`${API}/auth/me`)
        .set('Authorization', `Bearer ${tokens.accessToken}`)
        .expect(200);

      expect(response.body.data.email).toBe(payload.email);
    });

    it('should reject a request with no token', async () => {
      const response = await request(app).get(`${API}/auth/me`).expect(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should reject a tampered token', async () => {
      const { tokens } = await registerAndVerify();

      const response = await request(app)
        .get(`${API}/auth/me`)
        .set('Authorization', `Bearer ${tokens.accessToken.slice(0, -2)}xx`)
        .expect(401);

      expect(response.body.error.code).toBe('INVALID_TOKEN');
    });

    it('should rotate the refresh token and revoke the old one', async () => {
      const { tokens } = await registerAndVerify();

      const refreshed = await request(app)
        .post(`${API}/auth/refresh`)
        .send({ refreshToken: tokens.refreshToken })
        .expect(200);

      expect(refreshed.body.data.tokens.refreshToken).not.toBe(tokens.refreshToken);

      // Replaying the old token is treated as theft.
      const replay = await request(app)
        .post(`${API}/auth/refresh`)
        .send({ refreshToken: tokens.refreshToken })
        .expect(401);

      expect(replay.body.error.code).toBe('SESSION_REVOKED');
    });

    it('should invalidate every session after a password change', async () => {
      const { tokens, payload } = await registerAndVerify();

      await request(app)
        .post(`${API}/auth/change-password`)
        .set('Authorization', `Bearer ${tokens.accessToken}`)
        .send({ currentPassword: payload.password, newPassword: 'BrandNewPass9' })
        .expect(200);

      const response = await request(app)
        .get(`${API}/auth/me`)
        .set('Authorization', `Bearer ${tokens.accessToken}`)
        .expect(401);

      expect(response.body.error.code).toBe('TOKEN_REVOKED');
    });
  });

  describe('unknown routes', () => {
    it('should answer 404 in the standard error shape', async () => {
      const response = await request(app).get(`${API}/does-not-exist`).expect(404);

      expect(response.body).toEqual({
        success: false,
        error: { code: 'ROUTE_NOT_FOUND', message: expect.any(String) },
      });
    });
  });
});
