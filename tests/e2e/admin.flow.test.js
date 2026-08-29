import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { GENDER, USER_ROLE, USER_STATUS } from '#src/common/constants/index.js';
import { createApp } from '#src/app.js';
import { themeService } from '#src/modules/theme/theme.service.js';
import { walletRepository } from '#src/modules/coins/wallet.repository.js';
import { UserModel } from '#src/modules/users/user.model.js';
import { applySettings, createUser, resetDatabase, TEST_PASSWORD } from '../helpers/factories.js';
import { authHeaderFor } from '../helpers/auth.js';

const API = '/api/v1';

let app;

describe('admin panel', () => {
  beforeAll(() => {
    app = createApp();
  });

  beforeEach(async () => {
    await resetDatabase();
    await themeService.ensurePresetsSeeded();
  });

  describe('admin sign-in', () => {
    it('should sign in an administrator', async () => {
      const admin = await createUser({ role: USER_ROLE.SUPER_ADMIN, email: 'boss@example.com' });

      const response = await request(app)
        .post(`${API}/admin/login`)
        .send({ email: admin.email, password: TEST_PASSWORD })
        .expect(200);

      expect(response.body.data.user.role).toBe(USER_ROLE.SUPER_ADMIN);
      expect(response.body.data.tokens.accessToken).toBeTruthy();
    });

    it('should refuse an ordinary user at the admin door', async () => {
      const user = await createUser({ email: 'normal@example.com' });

      const response = await request(app)
        .post(`${API}/admin/login`)
        .send({ email: user.email, password: TEST_PASSWORD })
        .expect(403);

      expect(response.body.error.code).toBe('NOT_AN_ADMIN');
    });

    it('should refuse an ordinary user token on every admin endpoint', async () => {
      const user = await createUser();

      const response = await request(app)
        .get(`${API}/admin/dashboard`)
        .set(authHeaderFor(user))
        .expect(403);

      expect(response.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('dashboard', () => {
    it('should report the headline counts', async () => {
      const admin = await createUser({ role: USER_ROLE.ADMIN });
      await createUser({ gender: GENDER.FEMALE, isOnline: true });
      await createUser({ gender: GENDER.MALE });

      const response = await request(app)
        .get(`${API}/admin/dashboard`)
        .set(authHeaderFor(admin))
        .expect(200);

      expect(response.body.data.users).toMatchObject({
        total: 3,
        female: 1,
        online: 1,
      });
      expect(response.body.data.coins).toHaveProperty('totalCoinsInCirculation');
    });
  });

  describe('theming', () => {
    it('should expose the active theme without authentication', async () => {
      const response = await request(app).get(`${API}/theme/active`).expect(200);

      expect(response.body.data.colors.primary).toMatch(/^#/);
      expect(response.body.data.branding.appName).toBeTruthy();
    });

    it('should recolour the whole app when an admin activates a preset', async () => {
      const admin = await createUser({ role: USER_ROLE.ADMIN });

      const themes = await request(app)
        .get(`${API}/theme`)
        .set(authHeaderFor(admin))
        .expect(200);

      const midnight = themes.body.data.find((theme) => theme.slug === 'midnight');

      await request(app)
        .post(`${API}/theme/${midnight._id}/activate`)
        .set(authHeaderFor(admin))
        .expect(200);

      const active = await request(app).get(`${API}/theme/active`).expect(200);

      expect(active.body.data.slug).toBe('midnight');
      expect(active.body.data.isDark).toBe(true);
    });

    it('should keep exactly one theme active', async () => {
      const admin = await createUser({ role: USER_ROLE.ADMIN });
      const themes = await request(app).get(`${API}/theme`).set(authHeaderFor(admin));
      const ocean = themes.body.data.find((theme) => theme.slug === 'ocean');

      await request(app)
        .post(`${API}/theme/${ocean._id}/activate`)
        .set(authHeaderFor(admin))
        .expect(200);

      const after = await request(app).get(`${API}/theme`).set(authHeaderFor(admin));
      const activeThemes = after.body.data.filter((theme) => theme.isActive);

      expect(activeThemes).toHaveLength(1);
      expect(activeThemes[0].slug).toBe('ocean');
    });

    it('should let an admin create a custom theme and fill the gaps with defaults', async () => {
      const admin = await createUser({ role: USER_ROLE.ADMIN });

      const response = await request(app)
        .post(`${API}/theme`)
        .set(authHeaderFor(admin))
        .send({ slug: 'brand', name: 'Brand', colors: { primary: '#123456' } })
        .expect(201);

      expect(response.body.data.colors.primary).toBe('#123456');
      expect(response.body.data.colors.background).toBeTruthy();
    });

    it('should reject a colour that is not a hex value', async () => {
      const admin = await createUser({ role: USER_ROLE.ADMIN });

      const response = await request(app)
        .post(`${API}/theme`)
        .set(authHeaderFor(admin))
        .send({ slug: 'bad', name: 'Bad', colors: { primary: 'hot pink' } })
        .expect(422);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should refuse to delete a built-in preset', async () => {
      const admin = await createUser({ role: USER_ROLE.ADMIN });
      const themes = await request(app).get(`${API}/theme`).set(authHeaderFor(admin));
      const sunset = themes.body.data.find((theme) => theme.slug === 'sunset');

      const response = await request(app)
        .delete(`${API}/theme/${sunset._id}`)
        .set(authHeaderFor(admin))
        .expect(400);

      expect(response.body.error.code).toBe('THEME_IS_PRESET');
    });
  });

  describe('pricing and settings', () => {
    it('should publish the pricing rules to the app without authentication', async () => {
      await applySettings({ coins: { coinsPerBlock: 10, messagesPerBlock: 7 } });

      const response = await request(app).get(`${API}/settings/public`).expect(200);

      expect(response.body.data.coins).toMatchObject({ coinsPerBlock: 10, messagesPerBlock: 7 });
      // Moderation internals stay private.
      expect(response.body.data.moderation).toBeUndefined();
    });

    it('should let an admin change pricing and take effect immediately', async () => {
      const admin = await createUser({ role: USER_ROLE.ADMIN });

      await request(app)
        .patch(`${API}/settings`)
        .set(authHeaderFor(admin))
        .send({ coins: { coinsPerBlock: 15, messagesPerBlock: 5 } })
        .expect(200);

      const publicSettings = await request(app).get(`${API}/settings/public`).expect(200);

      expect(publicSettings.body.data.coins).toMatchObject({
        coinsPerBlock: 15,
        messagesPerBlock: 5,
      });
    });

    it('should not wipe sibling settings when updating one group', async () => {
      const admin = await createUser({ role: USER_ROLE.ADMIN });

      await request(app)
        .patch(`${API}/settings`)
        .set(authHeaderFor(admin))
        .send({ coins: { coinsPerBlock: 12 } })
        .expect(200);

      const response = await request(app).get(`${API}/settings/public`).expect(200);

      expect(response.body.data.coins.coinsPerBlock).toBe(12);
      expect(response.body.data.coins.messagesPerBlock).toBe(7);
      expect(response.body.data.chat.autoGreetingText).toBe('Hi');
    });

    it('should reject a setting outside its allowed range', async () => {
      const admin = await createUser({ role: USER_ROLE.ADMIN });

      await request(app)
        .patch(`${API}/settings`)
        .set(authHeaderFor(admin))
        .send({ coins: { messagesPerBlock: 0 } })
        .expect(422);
    });
  });

  describe('user management', () => {
    it('should suspend an account and cut off its access at once', async () => {
      const admin = await createUser({ role: USER_ROLE.ADMIN });
      const user = await createUser();
      const userHeader = authHeaderFor(user);

      await request(app).get(`${API}/auth/me`).set(userHeader).expect(200);

      await request(app)
        .post(`${API}/admin/users/${user._id}/suspend`)
        .set(authHeaderFor(admin))
        .send({ reason: 'Abusive messages' })
        .expect(200);

      const blocked = await request(app).get(`${API}/auth/me`).set(userHeader).expect(403);
      expect(blocked.body.error.code).toBe('ACCOUNT_SUSPENDED');
    });

    it('should refuse to suspend another administrator', async () => {
      const admin = await createUser({ role: USER_ROLE.SUPER_ADMIN });
      const otherAdmin = await createUser({ role: USER_ROLE.ADMIN });

      const response = await request(app)
        .post(`${API}/admin/users/${otherAdmin._id}/suspend`)
        .set(authHeaderFor(admin))
        .send({ reason: 'Nope' })
        .expect(403);

      expect(response.body.error.code).toBe('CANNOT_SUSPEND_ADMIN');
    });

    it('should reactivate a suspended account', async () => {
      const admin = await createUser({ role: USER_ROLE.ADMIN });
      const user = await createUser();

      await request(app)
        .post(`${API}/admin/users/${user._id}/suspend`)
        .set(authHeaderFor(admin))
        .send({ reason: 'Mistake' })
        .expect(200);

      await request(app)
        .post(`${API}/admin/users/${user._id}/reactivate`)
        .set(authHeaderFor(admin))
        .expect(200);

      const refreshed = await UserModel.findById(user._id).lean().exec();
      expect(refreshed.status).toBe(USER_STATUS.ACTIVE);
    });

    it('should credit coins manually and leave an audit trail', async () => {
      const admin = await createUser({ role: USER_ROLE.ADMIN });
      const user = await createUser({ gender: GENDER.MALE });

      const response = await request(app)
        .post(`${API}/admin/users/${user._id}/coins`)
        .set(authHeaderFor(admin))
        .send({ amount: 100, reason: 'Goodwill after an outage' })
        .expect(200);

      expect(response.body.data.coinBalance).toBe(100);

      const audit = await request(app)
        .get(`${API}/admin/audit-log`)
        .set(authHeaderFor(admin))
        .expect(200);

      expect(audit.body.data[0]).toMatchObject({
        action: 'coins.adjusted',
        metadata: { amount: 100, balanceAfter: 100 },
      });
    });

    it('should refuse a manual debit larger than the balance', async () => {
      const admin = await createUser({ role: USER_ROLE.ADMIN });
      const user = await createUser({ gender: GENDER.MALE });

      const response = await request(app)
        .post(`${API}/admin/users/${user._id}/coins`)
        .set(authHeaderFor(admin))
        .send({ amount: -50, reason: 'Chargeback' })
        .expect(402);

      expect(response.body.error.code).toBe('INSUFFICIENT_COINS');
    });

    it('should restore the free-talk allowance on request', async () => {
      const admin = await createUser({ role: USER_ROLE.ADMIN });
      const user = await createUser({ gender: GENDER.MALE });

      await walletRepository.setFreeTalkSeconds(user._id, 0);

      const response = await request(app)
        .post(`${API}/admin/users/${user._id}/free-talk/reset`)
        .set(authHeaderFor(admin))
        .expect(200);

      expect(response.body.data.freeTalkSecondsRemaining).toBe(30 * 60);
    });
  });
});
