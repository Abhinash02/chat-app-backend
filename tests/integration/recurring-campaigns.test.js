import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GENDER } from '#src/common/constants/index.js';
import { emailService } from '#src/integrations/email/email.service.js';
import { campaignService } from '#src/modules/notifications/campaign.service.js';
import { notificationRepository } from '#src/modules/notifications/notification.repository.js';
import { computeNextRun, describeSchedule } from '#src/modules/notifications/schedule.util.js';
import {
  CAMPAIGN_CHANNEL,
  CAMPAIGN_REPEAT,
  CAMPAIGN_STATUS,
} from '#src/modules/notifications/notification.constants.js';
import { createUser, resetDatabase, toRequestUser } from '../helpers/factories.js';

async function makeDailyCampaign(admin, repeat = {}) {
  return campaignService.createCampaign({
    admin: toRequestUser(admin),
    name: 'Daily nudge',
    channel: CAMPAIGN_CHANNEL.EMAIL,
    audience: { preset: 'girls' },
    email: { subject: 'Hi {{name}}', html: '<p>Come back!</p>' },
    repeat: {
      rule: CAMPAIGN_REPEAT.DAILY,
      hour: 9,
      minute: 0,
      timezone: 'Asia/Kolkata',
      isEnabled: true,
      ...repeat,
    },
  });
}

describe('recurring campaigns', () => {
  beforeEach(async () => {
    await resetDatabase();
    vi.restoreAllMocks();
  });

  describe('working out the next run', () => {
    it('should pick today when the slot is still ahead', () => {
      // 06:00 IST, aiming at 09:00 IST the same day.
      const from = new Date('2026-03-10T00:30:00Z');
      const next = computeNextRun(
        { rule: 'daily', hour: 9, minute: 0, timezone: 'Asia/Kolkata', isEnabled: true },
        from,
      );

      expect(next.toISOString()).toBe('2026-03-10T03:30:00.000Z');
    });

    it('should roll to tomorrow once the slot has passed', () => {
      // 10:00 IST, past the 09:00 slot.
      const from = new Date('2026-03-10T04:30:00Z');
      const next = computeNextRun(
        { rule: 'daily', hour: 9, minute: 0, timezone: 'Asia/Kolkata', isEnabled: true },
        from,
      );

      expect(next.toISOString()).toBe('2026-03-11T03:30:00.000Z');
    });

    it('should keep the wall-clock time across a daylight-saving change', () => {
      // US clocks moved forward on 8 March 2026. A 09:00 New York send must
      // stay 09:00 local on both sides of it, even though the UTC instant
      // shifts by an hour.
      const rule = { rule: 'daily', hour: 9, minute: 0, timezone: 'America/New_York', isEnabled: true };

      const before = computeNextRun(rule, new Date('2026-03-06T12:00:00Z'));
      const after = computeNextRun(rule, new Date('2026-03-10T12:00:00Z'));

      const localHour = (instant) =>
        new Intl.DateTimeFormat('en-US', {
          timeZone: 'America/New_York',
          hour: '2-digit',
          hour12: false,
        }).format(instant);

      expect(localHour(before)).toBe('09');
      expect(localHour(after)).toBe('09');
      // The underlying UTC instants differ, which is the whole point.
      expect(before.getUTCHours()).not.toBe(after.getUTCHours());
    });

    it('should find the right day for a weekly rule', () => {
      // Tuesday 10 March 2026, targeting Friday.
      const next = computeNextRun(
        { rule: 'weekly', hour: 9, minute: 0, weekday: 5, timezone: 'Asia/Kolkata', isEnabled: true },
        new Date('2026-03-10T04:30:00Z'),
      );

      expect(next.getUTCDay()).toBe(5);
    });

    it('should return nothing for a paused or one-off campaign', () => {
      expect(computeNextRun({ rule: 'daily', hour: 9, minute: 0, isEnabled: false })).toBeNull();
      expect(computeNextRun({ rule: 'none', isEnabled: true })).toBeNull();
    });

    it('should describe the schedule in words for the panel', () => {
      expect(
        describeSchedule({ rule: 'daily', hour: 19, minute: 30, timezone: 'Asia/Kolkata', isEnabled: true }),
      ).toBe('Every day at 19:30 (Asia/Kolkata)');

      expect(
        describeSchedule({ rule: 'daily', hour: 9, minute: 0, timezone: 'Asia/Kolkata', isEnabled: false }),
      ).toContain('paused');
    });
  });

  describe('running on schedule', () => {
    it('should know its first slot as soon as it is created', async () => {
      const admin = await createUser();
      const campaign = await makeDailyCampaign(admin);

      expect(campaign.repeat.rule).toBe(CAMPAIGN_REPEAT.DAILY);
      expect(campaign.repeat.nextRunAt).toBeTruthy();
      expect(new Date(campaign.repeat.nextRunAt).getTime()).toBeGreaterThan(Date.now());
    });

    it('should not run before its slot arrives', async () => {
      const admin = await createUser();
      await createUser({ gender: GENDER.FEMALE });
      await makeDailyCampaign(admin);

      const result = await campaignService.startDueRecurringCampaigns();
      expect(result.started).toBe(0);
    });

    it('should queue itself once the slot has arrived', async () => {
      const admin = await createUser();
      await createUser({ gender: GENDER.FEMALE });

      const campaign = await makeDailyCampaign(admin);
      // Bring the slot forward, as the clock would.
      await notificationRepository.updateCampaign(campaign._id, {
        $set: { 'repeat.nextRunAt': new Date(Date.now() - 60_000) },
      });

      const result = await campaignService.startDueRecurringCampaigns();
      expect(result.started).toBe(1);

      const queued = await campaignService.getCampaign(campaign._id);
      expect(queued.status).toBe(CAMPAIGN_STATUS.QUEUED);
      expect(queued.stats.targeted).toBe(1);
      expect(queued.repeat.runCount).toBe(1);
      // The following slot is booked immediately, not after the send finishes.
      expect(new Date(queued.repeat.nextRunAt).getTime()).toBeGreaterThan(Date.now());
    });

    it('should recount the audience on every run, not reuse the first one', async () => {
      const admin = await createUser();
      await createUser({ gender: GENDER.FEMALE });

      const campaign = await makeDailyCampaign(admin);
      await notificationRepository.updateCampaign(campaign._id, {
        $set: { 'repeat.nextRunAt': new Date(Date.now() - 60_000) },
      });
      await campaignService.startDueRecurringCampaigns();

      expect((await campaignService.getCampaign(campaign._id)).stats.targeted).toBe(1);

      // Two more people join, then the next slot comes round.
      await createUser({ gender: GENDER.FEMALE });
      await createUser({ gender: GENDER.FEMALE });

      await notificationRepository.updateCampaign(campaign._id, {
        $set: { status: CAMPAIGN_STATUS.SENT, 'repeat.nextRunAt': new Date(Date.now() - 60_000) },
      });
      await campaignService.startDueRecurringCampaigns();

      // A daily win-back is only useful if it reaches whoever qualifies today.
      expect((await campaignService.getCampaign(campaign._id)).stats.targeted).toBe(3);
    });

    it('should skip a run with nobody in the audience and try again next time', async () => {
      const admin = await createUser();
      const campaign = await makeDailyCampaign(admin);

      await notificationRepository.updateCampaign(campaign._id, {
        $set: { 'repeat.nextRunAt': new Date(Date.now() - 60_000) },
      });

      const result = await campaignService.startDueRecurringCampaigns();
      expect(result.started).toBe(0);

      const skipped = await campaignService.getCampaign(campaign._id);
      expect(skipped.status).toBe(CAMPAIGN_STATUS.DRAFT);
      // Rescheduled rather than abandoned.
      expect(new Date(skipped.repeat.nextRunAt).getTime()).toBeGreaterThan(Date.now());
    });

    it('should not start a run on top of one already in flight', async () => {
      const admin = await createUser();
      await createUser({ gender: GENDER.FEMALE });

      const campaign = await makeDailyCampaign(admin);
      await notificationRepository.updateCampaign(campaign._id, {
        $set: { status: CAMPAIGN_STATUS.SENDING, 'repeat.nextRunAt': new Date(Date.now() - 60_000) },
      });

      const result = await campaignService.startDueRecurringCampaigns();
      expect(result.started).toBe(0);
    });

    it('should stay quiet once paused', async () => {
      const admin = await createUser();
      await createUser({ gender: GENDER.FEMALE });

      const campaign = await makeDailyCampaign(admin);
      await campaignService.setSchedule({
        campaignId: campaign._id,
        repeat: { ...campaign.repeat, isEnabled: false },
      });

      const paused = await campaignService.getCampaign(campaign._id);
      expect(paused.repeat.nextRunAt).toBeNull();

      const result = await campaignService.startDueRecurringCampaigns();
      expect(result.started).toBe(0);
    });

    it('should actually send when its queued run is processed', async () => {
      const admin = await createUser();
      const recipient = await createUser({ gender: GENDER.FEMALE });

      const sent = [];
      vi.spyOn(emailService, 'sendRaw').mockImplementation(async (message) => {
        sent.push(message.to);
        return { delivered: true };
      });

      const campaign = await makeDailyCampaign(admin);
      await notificationRepository.updateCampaign(campaign._id, {
        $set: { 'repeat.nextRunAt': new Date(Date.now() - 60_000) },
      });

      await campaignService.startDueRecurringCampaigns();
      const queued = await campaignService.getCampaign(campaign._id);
      await campaignService.sendCampaignBatch(queued);

      expect(sent).toEqual([recipient.email]);
    });
  });
});
