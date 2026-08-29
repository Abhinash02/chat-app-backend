import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { GENDER, USER_STATUS } from '#src/common/constants/index.js';
import { createApp } from '#src/app.js';
import { applySettings, createUser, resetDatabase } from '../helpers/factories.js';
import { authHeaderFor } from '../helpers/auth.js';

const API = '/api/v1';

let app;

describe('email verification gate', () => {
  beforeAll(() => {
    app = createApp();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  describe('when verification is not required (the default)', () => {
    it('should let an unverified account browse', async () => {
      const unverified = await createUser({
        gender: GENDER.MALE,
        status: USER_STATUS.PENDING_VERIFICATION,
      });
      await createUser({ gender: GENDER.FEMALE, nickname: 'priya' });

      const response = await request(app)
        .get(`${API}/users/discover`)
        .set(authHeaderFor(unverified))
        .expect(200);

      expect(response.body.data.map((item) => item.nickname)).toEqual(['priya']);
    });

    it('should still hide an unverified account from everyone else', async () => {
      const viewer = await createUser({ gender: GENDER.MALE });
      await createUser({ gender: GENDER.FEMALE, status: USER_STATUS.PENDING_VERIFICATION });

      const response = await request(app)
        .get(`${API}/users/discover`)
        .set(authHeaderFor(viewer))
        .expect(200);

      // Discovery only ever returns active accounts, so someone who has not
      // verified can look around but cannot be found until they do.
      expect(response.body.data).toHaveLength(0);
    });
  });

  describe('when an admin requires verification', () => {
    beforeEach(async () => {
      await applySettings({ chat: { requireVerifiedEmail: true } });
    });

    it('should block an unverified account', async () => {
      const unverified = await createUser({ status: USER_STATUS.PENDING_VERIFICATION });

      const response = await request(app)
        .get(`${API}/users/discover`)
        .set(authHeaderFor(unverified))
        .expect(403);

      expect(response.body.error.code).toBe('EMAIL_NOT_VERIFIED');
    });

    it('should still allow a verified account', async () => {
      const verified = await createUser({ status: USER_STATUS.ACTIVE });

      await request(app).get(`${API}/users/discover`).set(authHeaderFor(verified)).expect(200);
    });
  });

  it('should refuse a suspended account whatever the setting says', async () => {
    await applySettings({ chat: { requireVerifiedEmail: false } });
    const suspended = await createUser({ status: USER_STATUS.SUSPENDED });

    const response = await request(app)
      .get(`${API}/users/discover`)
      .set(authHeaderFor(suspended))
      .expect(403);

    // Suspension is not about verification and is never optional.
    expect(response.body.error.code).toBe('ACCOUNT_SUSPENDED');
  });
});
