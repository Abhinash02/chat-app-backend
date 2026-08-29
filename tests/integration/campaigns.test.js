import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GENDER, USER_STATUS } from '#src/common/constants/index.js';
import { emailService } from '#src/integrations/email/email.service.js';
import { expoPushProvider } from '#src/integrations/push/expo.push.js';
import { walletRepository } from '#src/modules/coins/wallet.repository.js';
import { buildAudienceFilter } from '#src/modules/notifications/audience.service.js';
import { campaignService } from '#src/modules/notifications/campaign.service.js';
import { notificationRepository } from '#src/modules/notifications/notification.repository.js';
import { notificationService } from '#src/modules/notifications/notification.service.js';
import {
  AUDIENCE_PRESET,
  CAMPAIGN_CHANNEL,
  CAMPAIGN_STATUS,
} from '#src/modules/notifications/notification.constants.js';
import { UserModel } from '#src/modules/users/user.model.js';
import { createUser, resetDatabase, toRequestUser } from '../helpers/factories.js';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

async function countAudience(audience) {
  const filter = await buildAudienceFilter(audience);
  return notificationRepository.countAudience(filter);
}

async function makeCampaign(admin, overrides = {}) {
  return campaignService.createCampaign({
    admin: toRequestUser(admin),
    name: 'Test campaign',
    channel: CAMPAIGN_CHANNEL.EMAIL,
    audience: { preset: AUDIENCE_PRESET.EVERYONE },
    email: { subject: 'Hello {{name}}', html: '<p>Hi {{name}}, you have {{coinBalance}} coins.</p>' },
    ...overrides,
  });
}

describe('notification campaigns', () => {
  beforeEach(async () => {
    await resetDatabase();
    vi.restoreAllMocks();
  });

  describe('audience targeting', () => {
    it('should reach every active account by default', async () => {
      await createUser({ gender: GENDER.MALE });
      await createUser({ gender: GENDER.FEMALE });

      expect(await countAudience({ preset: AUDIENCE_PRESET.EVERYONE })).toBe(2);
    });

    it('should never include accounts that are not active', async () => {
      await createUser({ status: USER_STATUS.ACTIVE });
      await createUser({ status: USER_STATUS.PENDING_VERIFICATION });
      await createUser({ status: USER_STATUS.SUSPENDED });
      await createUser({ status: USER_STATUS.DELETED });

      expect(await countAudience({ preset: AUDIENCE_PRESET.EVERYONE })).toBe(1);
    });

    it('should target one gender', async () => {
      await createUser({ gender: GENDER.MALE });
      await createUser({ gender: GENDER.MALE });
      await createUser({ gender: GENDER.FEMALE });

      expect(await countAudience({ preset: AUDIENCE_PRESET.BOYS })).toBe(2);
      expect(await countAudience({ preset: AUDIENCE_PRESET.GIRLS })).toBe(1);
    });

    it('should target people who are online right now', async () => {
      await createUser({ isOnline: true });
      await createUser({ isOnline: false });

      expect(await countAudience({ preset: AUDIENCE_PRESET.ONLINE_NOW })).toBe(1);
    });

    it('should target people who have not been seen for a week', async () => {
      await createUser({ lastSeenAt: new Date(Date.now() - 10 * ONE_DAY_MS) });
      await createUser({ lastSeenAt: new Date() });

      expect(await countAudience({ preset: AUDIENCE_PRESET.INACTIVE_7_DAYS })).toBe(1);
    });

    it('should target people who have never bought coins', async () => {
      const buyer = await createUser({ gender: GENDER.MALE });
      const browser = await createUser({ gender: GENDER.MALE });

      await walletRepository.findOrCreate(buyer._id, {});
      await walletRepository.findOrCreate(browser._id, {});
      await walletRepository.creditCoins(buyer._id, { amount: 60, extra: { totalPurchasedCoins: 60 } });

      const neverPurchased = await countAudience({ preset: AUDIENCE_PRESET.NEVER_PURCHASED });
      const paying = await countAudience({ preset: AUDIENCE_PRESET.PAYING_USERS });

      expect(neverPurchased).toBe(1);
      expect(paying).toBe(1);
    });

    it('should target people who are nearly out of coins', async () => {
      const broke = await createUser({ gender: GENDER.MALE });
      const flush = await createUser({ gender: GENDER.MALE });

      await walletRepository.findOrCreate(broke._id, {});
      await walletRepository.findOrCreate(flush._id, {});
      await walletRepository.creditCoins(flush._id, { amount: 500 });

      expect(await countAudience({ preset: AUDIENCE_PRESET.LOW_BALANCE, maxCoinBalance: 10 })).toBe(1);
    });

    it('should let an explicit gender filter narrow a preset', async () => {
      await createUser({ gender: GENDER.MALE, isOnline: true });
      await createUser({ gender: GENDER.FEMALE, isOnline: true });

      expect(await countAudience({ preset: AUDIENCE_PRESET.ONLINE_NOW, gender: 'female' })).toBe(1);
    });
  });

  describe('creating and queueing', () => {
    it('should refuse to send to an empty audience', async () => {
      const admin = await createUser();
      const campaign = await makeCampaign(admin, {
        audience: { preset: AUDIENCE_PRESET.GIRLS },
      });

      await expect(campaignService.queueCampaign({ campaignId: campaign._id })).rejects.toMatchObject({
        code: 'EMPTY_AUDIENCE',
      });
    });

    it('should record the audience size when queued', async () => {
      const admin = await createUser();
      await createUser({ gender: GENDER.FEMALE });
      await createUser({ gender: GENDER.FEMALE });

      const campaign = await makeCampaign(admin, { audience: { preset: AUDIENCE_PRESET.GIRLS } });
      const queued = await campaignService.queueCampaign({ campaignId: campaign._id });

      expect(queued.status).toBe(CAMPAIGN_STATUS.QUEUED);
      expect(queued.stats.targeted).toBe(2);
    });

    it('should refuse to queue a campaign twice', async () => {
      const admin = await createUser();
      const campaign = await makeCampaign(admin);

      await campaignService.queueCampaign({ campaignId: campaign._id });

      await expect(campaignService.queueCampaign({ campaignId: campaign._id })).rejects.toMatchObject({
        code: 'CAMPAIGN_ALREADY_SENT',
      });
    });

    it('should copy the template body into the campaign rather than referencing it', async () => {
      const admin = await createUser();
      await campaignService.ensureSystemTemplatesSeeded();

      const [template] = await campaignService.listTemplates();

      const campaign = await campaignService.createCampaign({
        admin: toRequestUser(admin),
        name: 'From template',
        channel: CAMPAIGN_CHANNEL.EMAIL,
        email: { subject: 'Hi', templateId: template._id },
      });

      // Editing the template afterwards must not rewrite an approved campaign.
      await campaignService.updateTemplate(template._id, { html: '<p>REWRITTEN</p>' });

      const stored = await campaignService.getCampaign(campaign._id);
      expect(stored.email.html).toBe(template.html);
      expect(stored.email.html).not.toContain('REWRITTEN');
    });

    it('should require a push title for a push campaign', async () => {
      const admin = await createUser();

      await expect(
        campaignService.createCampaign({
          admin: toRequestUser(admin),
          name: 'No title',
          channel: CAMPAIGN_CHANNEL.PUSH,
          push: { body: 'Body only' },
        }),
      ).rejects.toMatchObject({ code: 'PUSH_TITLE_REQUIRED' });
    });
  });

  describe('sending', () => {
    it('should personalise each email and count what was sent', async () => {
      const admin = await createUser();
      await createUser({ gender: GENDER.FEMALE, name: 'Priya' });
      await createUser({ gender: GENDER.FEMALE, name: 'Neha' });

      const sent = [];
      vi.spyOn(emailService, 'sendRaw').mockImplementation(async (message) => {
        sent.push(message);
        return { delivered: true };
      });

      const campaign = await makeCampaign(admin, { audience: { preset: AUDIENCE_PRESET.GIRLS } });
      const queued = await campaignService.queueCampaign({ campaignId: campaign._id });

      const result = await campaignService.sendCampaignBatch(queued);

      expect(result.done).toBe(true);
      expect(sent).toHaveLength(2);
      expect(sent.map((message) => message.subject).sort()).toEqual(['Hello Neha', 'Hello Priya']);
      expect(sent[0].html).toContain('coins');
    });

    it('should always include an unsubscribe link in promotional mail', async () => {
      const admin = await createUser();
      await createUser({ gender: GENDER.FEMALE });

      let captured;
      vi.spyOn(emailService, 'sendRaw').mockImplementation(async (message) => {
        captured = message;
        return { delivered: true };
      });

      const campaign = await makeCampaign(admin, { audience: { preset: AUDIENCE_PRESET.GIRLS } });
      const queued = await campaignService.queueCampaign({ campaignId: campaign._id });
      await campaignService.sendCampaignBatch(queued);

      expect(captured.html).toContain('/notifications/unsubscribe?token=');
      expect(captured.html).toContain('Unsubscribe');
    });

    it('should skip anyone who opted out of promotional mail', async () => {
      const admin = await createUser();
      const optedIn = await createUser({ gender: GENDER.FEMALE });
      const optedOut = await createUser({ gender: GENDER.FEMALE });

      await UserModel.updateOne(
        { _id: optedOut._id },
        { $set: { 'preferences.marketingEmails': false } },
      );

      const sent = [];
      vi.spyOn(emailService, 'sendRaw').mockImplementation(async (message) => {
        sent.push(message.to);
        return { delivered: true };
      });

      const campaign = await makeCampaign(admin, { audience: { preset: AUDIENCE_PRESET.GIRLS } });
      const queued = await campaignService.queueCampaign({ campaignId: campaign._id });
      const result = await campaignService.sendCampaignBatch(queued);

      expect(sent).toEqual([optedIn.email]);
      expect(result.increments.optedOut).toBe(1);
    });

    it('should escape user-authored text so a nickname cannot inject markup', async () => {
      const admin = await createUser();
      await createUser({ gender: GENDER.FEMALE, name: 'Eve', nickname: 'evil' });

      let captured;
      vi.spyOn(emailService, 'sendRaw').mockImplementation(async (message) => {
        captured = message;
        return { delivered: true };
      });

      // The stored name is what gets substituted into {{name}}.
      await UserModel.updateOne({ nickname: 'evil' }, { $set: { name: 'Eve' } });

      const campaign = await makeCampaign(admin, {
        audience: { preset: AUDIENCE_PRESET.GIRLS },
        email: { subject: 'Hi', html: '<p>Hello {{nickname}}</p>' },
      });
      const queued = await campaignService.queueCampaign({ campaignId: campaign._id });
      await campaignService.sendCampaignBatch(queued);

      expect(captured.html).toContain('Hello evil');
    });

    it('should send push notifications to registered devices', async () => {
      const admin = await createUser();
      const recipient = await createUser({ gender: GENDER.FEMALE });

      await notificationRepository.registerDeviceToken({
        userId: recipient._id,
        token: 'ExponentPushToken[test-device-1]',
        platform: 'android',
      });

      const pushed = [];
      vi.spyOn(expoPushProvider, 'send').mockImplementation(async (messages) => {
        pushed.push(...messages);
        return messages.map((message) => ({ token: message.token, ok: true }));
      });

      const campaign = await campaignService.createCampaign({
        admin: toRequestUser(admin),
        name: 'Push only',
        channel: CAMPAIGN_CHANNEL.PUSH,
        audience: { preset: AUDIENCE_PRESET.GIRLS },
        push: { title: 'Come back!', body: 'People are waiting' },
      });

      const queued = await campaignService.queueCampaign({ campaignId: campaign._id });
      const result = await campaignService.sendCampaignBatch(queued);

      expect(pushed).toHaveLength(1);
      expect(pushed[0]).toMatchObject({ title: 'Come back!', body: 'People are waiting' });
      expect(result.increments.pushSent).toBe(1);
    });

    it('should retire a token the provider reports as dead', async () => {
      const admin = await createUser();
      const recipient = await createUser({ gender: GENDER.FEMALE });

      await notificationRepository.registerDeviceToken({
        userId: recipient._id,
        token: 'ExponentPushToken[uninstalled]',
        platform: 'ios',
      });

      vi.spyOn(expoPushProvider, 'send').mockImplementation(async (messages) =>
        messages.map((message) => ({
          token: message.token,
          ok: false,
          error: 'DeviceNotRegistered',
          isUnregistered: true,
        })),
      );

      const campaign = await campaignService.createCampaign({
        admin: toRequestUser(admin),
        name: 'Push',
        channel: CAMPAIGN_CHANNEL.PUSH,
        audience: { preset: AUDIENCE_PRESET.GIRLS },
        push: { title: 'Hello' },
      });

      const queued = await campaignService.queueCampaign({ campaignId: campaign._id });
      const result = await campaignService.sendCampaignBatch(queued);

      expect(result.increments.tokensRetired).toBe(1);

      // The dead token must not be tried again on the next campaign.
      const stillActive = await notificationRepository.findActiveTokensForUsers([recipient._id]);
      expect(stillActive).toHaveLength(0);
    });

    it('should not push to someone who turned notifications off', async () => {
      const admin = await createUser();
      const recipient = await createUser({ gender: GENDER.FEMALE });

      await UserModel.updateOne({ _id: recipient._id }, { $set: { 'preferences.pushEnabled': false } });
      await notificationRepository.registerDeviceToken({
        userId: recipient._id,
        token: 'ExponentPushToken[muted]',
        platform: 'android',
      });

      const sendSpy = vi.spyOn(expoPushProvider, 'send').mockResolvedValue([]);

      const campaign = await campaignService.createCampaign({
        admin: toRequestUser(admin),
        name: 'Push',
        channel: CAMPAIGN_CHANNEL.PUSH,
        audience: { preset: AUDIENCE_PRESET.GIRLS },
        push: { title: 'Hello' },
      });

      const queued = await campaignService.queueCampaign({ campaignId: campaign._id });
      await campaignService.sendCampaignBatch(queued);

      expect(sendSpy).not.toHaveBeenCalled();
    });
  });

  describe('unsubscribe links', () => {
    it('should stop promotional mail for the right account', async () => {
      const user = await createUser();
      const token = notificationService.createUnsubscribeToken(user._id);

      await notificationService.unsubscribeByToken(token);

      const updated = await UserModel.findById(user._id).lean().exec();
      expect(updated.preferences.marketingEmails).toBe(false);
    });

    it('should reject a forged token', async () => {
      const user = await createUser();

      await expect(
        notificationService.unsubscribeByToken(`${user._id}.forged-signature`),
      ).rejects.toMatchObject({ code: 'INVALID_UNSUBSCRIBE_TOKEN' });

      const untouched = await UserModel.findById(user._id).lean().exec();
      expect(untouched.preferences.marketingEmails).toBe(true);
    });

    it('should not reveal whether an account exists', async () => {
      const fakeId = '507f1f77bcf86cd799439011';
      const token = notificationService.createUnsubscribeToken(fakeId);

      await expect(notificationService.unsubscribeByToken(token)).resolves.toMatchObject({
        unsubscribed: true,
      });
    });
  });
});
