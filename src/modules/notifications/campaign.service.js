import { BadRequestError, ConflictError, NotFoundError } from '#src/common/errors/index.js';
import { buildPaginationMeta, resolvePagination } from '#src/common/utils/pagination.util.js';
import { env } from '#src/config/env.js';
import { logger } from '#src/config/logger.js';
import { emailService } from '#src/integrations/email/email.service.js';
import {
  SYSTEM_EMAIL_TEMPLATES,
  renderTemplate,
  wrapCampaignHtml,
} from '#src/integrations/email/email.campaign-template.js';
import { getPushProvider, PUSH_CHANNEL } from '#src/integrations/push/index.js';
import { settingsService } from '#src/modules/settings/settings.service.js';
import { themeService } from '#src/modules/theme/theme.service.js';
import { walletRepository } from '#src/modules/coins/wallet.repository.js';
import { buildAudienceFilter } from '#src/modules/notifications/audience.service.js';
import { notificationRepository } from '#src/modules/notifications/notification.repository.js';
import { notificationService } from '#src/modules/notifications/notification.service.js';
import {
  CAMPAIGN_BATCH_SIZE,
  CAMPAIGN_CHANNEL,
  CAMPAIGN_REPEAT,
  CAMPAIGN_STATUS,
} from '#src/modules/notifications/notification.constants.js';
import { computeNextRun, describeSchedule } from '#src/modules/notifications/schedule.util.js';


function sendsPush(channel) {
  return channel === CAMPAIGN_CHANNEL.PUSH || channel === CAMPAIGN_CHANNEL.BOTH;
}

function sendsEmail(channel) {
  return channel === CAMPAIGN_CHANNEL.EMAIL || channel === CAMPAIGN_CHANNEL.BOTH;
}

export async function previewAudience(audience) {
  const filter = await buildAudienceFilter(audience);

  const [total, sample] = await Promise.all([
    notificationRepository.countAudience(filter),
    notificationRepository.findAudienceBatch({ filter, limit: 5 }),
  ]);

  // How many of those can actually be reached, which is the number that
  // matters — an audience of 10,000 with 40 push tokens is worth knowing about
  // before pressing send.
  const reach = await notificationService.getDeliveryReach();

  return {
    total,
    reach,
    sample: sample.map((user) => ({
      id: String(user._id),
      nickname: user.nickname,
      gender: user.gender,
      marketingEmails: user.preferences?.marketingEmails !== false,
    })),
  };
}

export async function createCampaign({ admin, name, channel, audience, push, email, repeat }) {
  if (sendsPush(channel) && !push?.title?.trim()) {
    throw new BadRequestError('Give the notification a title', 'PUSH_TITLE_REQUIRED');
  }

  if (sendsEmail(channel)) {
    if (!email?.subject?.trim()) throw new BadRequestError('Give the email a subject', 'EMAIL_SUBJECT_REQUIRED');
    if (!email?.html?.trim() && !email?.templateId) {
      throw new BadRequestError('Write the email body or pick a template', 'EMAIL_BODY_REQUIRED');
    }
  }

  let resolvedEmail = email ?? {};

  // A template is copied into the campaign rather than referenced at send time:
  // editing the template later must not silently rewrite a campaign that has
  // already been reviewed and approved.
  if (email?.templateId && !email?.html?.trim()) {
    const template = await notificationRepository.findTemplateById(email.templateId);
    if (!template) throw new NotFoundError('Template not found', 'TEMPLATE_NOT_FOUND');

    resolvedEmail = {
      templateId: template._id,
      subject: email.subject || template.subject,
      preheader: email.preheader || template.preheader,
      html: template.html,
    };
  }

  // A repeating campaign knows its first slot the moment it is created, so the
  // admin sees "next run" immediately rather than after the first sweep.
  const repeatConfig = repeat?.rule && repeat.rule !== CAMPAIGN_REPEAT.NONE
    ? { ...repeat, isEnabled: repeat.isEnabled ?? true, nextRunAt: computeNextRun({ ...repeat, isEnabled: true }) }
    : undefined;

  const campaign = await notificationRepository.createCampaign({
    name,
    channel,
    audience: audience ?? {},
    push: push ?? {},
    email: resolvedEmail,
    status: CAMPAIGN_STATUS.DRAFT,
    createdByAdminId: admin.id,
    ...(repeatConfig ? { repeat: repeatConfig } : {}),
  });

  return campaign;
}

/**
 * Hands a campaign to the worker.
 *
 * The audience size is measured and stored now so the progress bar has a
 * denominator, and so the person pressing send has already seen the number.
 */
export async function queueCampaign({ campaignId, scheduledAt = null }) {
  const campaign = await notificationRepository.findCampaignById(campaignId);
  if (!campaign) throw new NotFoundError('Campaign not found', 'CAMPAIGN_NOT_FOUND');

  if (
    campaign.status === CAMPAIGN_STATUS.SENT ||
    campaign.status === CAMPAIGN_STATUS.SENDING ||
    campaign.status === CAMPAIGN_STATUS.QUEUED
  ) {
    throw new ConflictError('This campaign has already been queued or sent', 'CAMPAIGN_ALREADY_SENT');
  }

  const filter = await buildAudienceFilter(campaign.audience);
  const targeted = await notificationRepository.countAudience(filter);

  if (targeted === 0) {
    throw new BadRequestError('Nobody matches this audience', 'EMPTY_AUDIENCE');
  }

  const updated = await notificationRepository.updateCampaign(campaignId, {
    $set: {
      status: CAMPAIGN_STATUS.QUEUED,
      scheduledAt,
      cursorUserId: null,
      'stats.targeted': targeted,
      'stats.pushSent': 0,
      'stats.pushFailed': 0,
      'stats.emailSent': 0,
      'stats.emailFailed': 0,
      'stats.optedOut': 0,
      'stats.tokensRetired': 0,
    },
  });

  logger.info({ campaignId, targeted, scheduledAt }, 'Campaign queued');
  return updated;
}

export async function updateCampaign({ campaignId, admin, name, channel, audience, push, email, repeat }) {
  const existing = await notificationRepository.findCampaignById(campaignId);
  if (!existing) throw new NotFoundError('Campaign not found', 'CAMPAIGN_NOT_FOUND');

  if (existing.status === CAMPAIGN_STATUS.SENDING) {
    throw new ConflictError('Cannot edit a campaign that is currently sending', 'CAMPAIGN_SENDING');
  }

  const update = {};
  if (name !== undefined) update.name = name;
  if (channel !== undefined) update.channel = channel;
  if (audience !== undefined) update.audience = audience;
  if (push !== undefined) update.push = push;
  if (email !== undefined) update.email = email;

  if (repeat !== undefined) {
    const isRecurring = repeat?.rule && repeat.rule !== CAMPAIGN_REPEAT.NONE;
    update.repeat = isRecurring
      ? { ...existing.repeat, ...repeat, isEnabled: repeat?.isEnabled ?? true, nextRunAt: computeNextRun({ ...repeat, isEnabled: true }) }
      : { ...existing.repeat, ...repeat, rule: CAMPAIGN_REPEAT.NONE, nextRunAt: null };
  }

  const updated = await notificationRepository.updateCampaign(campaignId, { $set: update });
  logger.info({ campaignId, adminId: admin.id }, 'Campaign updated');
  return updated;
}

export async function deleteCampaign(campaignId) {
  const existing = await notificationRepository.findCampaignById(campaignId);
  if (!existing) throw new NotFoundError('Campaign not found', 'CAMPAIGN_NOT_FOUND');

  if (existing.status === CAMPAIGN_STATUS.SENDING) {
    throw new ConflictError('Cannot delete a campaign that is currently sending. Please cancel it first.', 'CAMPAIGN_SENDING');
  }

  await notificationRepository.deleteCampaign(campaignId);
  logger.info({ campaignId }, 'Campaign deleted');
  return { deleted: true, id: campaignId };
}

export async function cancelCampaign(campaignId) {
  const campaign = await notificationRepository.findCampaignById(campaignId);
  if (!campaign) throw new NotFoundError('Campaign not found', 'CAMPAIGN_NOT_FOUND');

  if (campaign.status === CAMPAIGN_STATUS.SENT) {
    throw new ConflictError('This campaign has already gone out', 'CAMPAIGN_ALREADY_SENT');
  }

  // Cancelling mid-send stops further batches; messages already delivered
  // cannot be recalled, and the stats keep saying how many went.
  return notificationRepository.updateCampaign(campaignId, {
    $set: { status: CAMPAIGN_STATUS.CANCELLED, completedAt: new Date() },
  });
}

/**
 * Sends one batch and advances the cursor. Returns `done` when the audience is
 * exhausted, so the worker knows to stop without re-counting.
 */
export async function sendCampaignBatch(campaign) {
  const filter = await buildAudienceFilter(campaign.audience);

  const recipients = await notificationRepository.findAudienceBatch({
    filter,
    afterUserId: campaign.cursorUserId,
    limit: CAMPAIGN_BATCH_SIZE,
  });

  if (recipients.length === 0) return { done: true, processed: 0 };

  const increments = {
    pushSent: 0,
    pushFailed: 0,
    emailSent: 0,
    emailFailed: 0,
    optedOut: 0,
    tokensRetired: 0,
  };

  // ----- Push -------------------------------------------------------------
  if (sendsPush(campaign.channel)) {
    const pushable = recipients.filter((user) => user.preferences?.pushEnabled !== false);
    const devices = await notificationRepository.findActiveTokensForUsers(
      pushable.map((user) => user._id),
    );

    if (devices.length > 0) {
      const provider = getPushProvider();

      const tickets = await provider.send(
        devices.map((device) => ({
          token: device.token,
          title: campaign.push.title,
          body: campaign.push.body,
          data: campaign.push.deepLink ? { link: campaign.push.deepLink } : {},
          sound: campaign.push.sound || 'default',
          channelId: PUSH_CHANNEL.ANNOUNCEMENTS,
        })),
      );

      increments.pushSent = tickets.filter((ticket) => ticket.ok).length;
      increments.pushFailed = tickets.filter((ticket) => !ticket.ok).length;

      const dead = tickets.filter((ticket) => ticket.isUnregistered).map((ticket) => ticket.token);
      if (dead.length > 0) {
        await notificationRepository.deactivateTokens(dead, 'DeviceNotRegistered');
        increments.tokensRetired = dead.length;
      }
    }
  }

  // ----- Email ------------------------------------------------------------
  if (sendsEmail(campaign.channel)) {
    const [theme, settings] = await Promise.all([
      themeService.getActiveTheme(),
      settingsService.getSettings(),
    ]);

    const appName = theme?.branding?.appName ?? 'Vibe';
    const baseUrl = env.publicApiUrl;

    for (const user of recipients) {
      // Honouring the opt-out is the whole point of having one.
      if (user.preferences?.marketingEmails === false) {
        increments.optedOut += 1;
        continue;
      }

      const wallet = await walletRepository.findByUserId(user._id);

      const bodyHtml = renderTemplate(campaign.email.html, {
        name: user.name ?? user.nickname,
        nickname: user.nickname,
        coinBalance: wallet?.coinBalance ?? 0,
        appName,
      });

      const html = wrapCampaignHtml({
        bodyHtml,
        appName,
        preheader: campaign.email.preheader,
        unsubscribeUrl: notificationService.buildUnsubscribeUrl(user._id, baseUrl),
        supportEmail: settings.payments.supportEmail,
        colors: theme?.colors,
      });

      const result = await emailService.sendRaw({
        to: user.email,
        subject: renderTemplate(campaign.email.subject, { name: user.name ?? user.nickname, appName }),
        html,
      });

      if (result.delivered) increments.emailSent += 1;
      else increments.emailFailed += 1;
    }
  }

  const lastUserId = recipients[recipients.length - 1]._id;
  const updatedCampaign = await notificationRepository.incrementCampaignStats(campaign._id, increments, lastUserId);

  // Broadcast live progress to Admin Panel WebSocket & active users
  import('#src/realtime/emitter.js')
    .then(({ emitToAdmin, emitToAll }) => {
      emitToAdmin('admin:campaign_progress', {
        campaignId: String(campaign._id),
        stats: updatedCampaign?.stats,
        status: updatedCampaign?.status,
        increments,
        isLive: true,
      });

      // Also broadcast in-app live announcement to active users
      if (campaign.push?.title) {
        emitToAll('app:announcement', {
          id: String(campaign._id),
          title: campaign.push.title,
          body: campaign.push.body,
          deepLink: campaign.push.deepLink,
        });
      }
    })
    .catch(() => undefined);

  return {
    done: recipients.length < CAMPAIGN_BATCH_SIZE,
    processed: recipients.length,
    increments,
    stats: updatedCampaign?.stats,
  };
}

/**
 * Sets or changes a campaign's repeat rule.
 *
 * Recomputing `nextRunAt` here rather than waiting for the sweep means an admin
 * who changes 9am to 7pm sees the new time straight away, instead of wondering
 * whether it took.
 */
export async function setSchedule({ campaignId, repeat }) {
  const campaign = await getCampaign(campaignId);

  const isRecurring = repeat?.rule && repeat.rule !== CAMPAIGN_REPEAT.NONE;
  const merged = { ...campaign.repeat, ...repeat, isEnabled: repeat?.isEnabled ?? true };

  const updated = await notificationRepository.updateCampaign(campaignId, {
    $set: {
      repeat: isRecurring
        ? { ...merged, nextRunAt: computeNextRun(merged) }
        : { ...merged, rule: CAMPAIGN_REPEAT.NONE, nextRunAt: null },
    },
  });

  logger.info(
    { campaignId, schedule: describeSchedule(updated.repeat) },
    'Campaign schedule updated',
  );

  return updated;
}

/**
 * Starts another run of every recurring campaign whose slot has arrived.
 *
 * The audience is recounted each time on purpose: the whole value of a daily
 * "come back" campaign is that it reaches whoever qualifies *today*, not the
 * list captured when it was created.
 */
export async function startDueRecurringCampaigns() {
  const due = await notificationRepository.findDueRecurring();
  if (due.length === 0) return { started: 0 };

  const now = new Date();
  let started = 0;

  for (const campaign of due) {
    const filter = await buildAudienceFilter(campaign.audience);
    const targeted = await notificationRepository.countAudience(filter);

    const nextRunAt = computeNextRun(campaign.repeat, new Date(now.getTime() + 60_000));

    if (targeted === 0) {
      // Nobody qualifies right now. Skip this run and try again next slot
      // rather than treating an empty audience as an error.
      await notificationRepository.updateCampaign(campaign._id, {
        $set: { 'repeat.lastRunAt': now, 'repeat.nextRunAt': nextRunAt },
      });
      logger.info({ campaignId: String(campaign._id) }, 'Recurring campaign skipped: empty audience');
      continue;
    }

    const queued = await notificationRepository.requeueRecurring({
      campaignId: campaign._id,
      targeted,
      nextRunAt,
      now,
    });

    if (queued) {
      started += 1;
      logger.info(
        { campaignId: String(campaign._id), targeted, nextRunAt },
        'Recurring campaign queued',
      );
    }
  }

  return { started };
}

export async function listCampaigns({ status, page, limit }) {
  const { skip, page: safePage, limit: safeLimit } = resolvePagination({ page, limit });
  const filter = status ? { status } : {};

  const { items, total } = await notificationRepository.listCampaigns({ filter, skip, limit: safeLimit });

  return { items, meta: buildPaginationMeta({ page: safePage, limit: safeLimit, total }) };
}

export async function getCampaign(campaignId) {
  const campaign = await notificationRepository.findCampaignById(campaignId);
  if (!campaign) throw new NotFoundError('Campaign not found', 'CAMPAIGN_NOT_FOUND');
  return campaign;
}

/**
 * Sends the campaign to one address so an operator can see it in a real inbox.
 * Rendering is identical to the real send — a preview that goes through a
 * different code path is not a preview.
 */
export async function sendTestEmail({ campaignId, toEmail, admin }) {
  const campaign = await getCampaign(campaignId);

  if (!sendsEmail(campaign.channel)) {
    throw new BadRequestError('This campaign does not send email', 'NOT_AN_EMAIL_CAMPAIGN');
  }

  const [theme, settings] = await Promise.all([
    themeService.getActiveTheme(),
    settingsService.getSettings(),
  ]);

  const appName = theme?.branding?.appName ?? 'Vibe';

  const html = wrapCampaignHtml({
    bodyHtml: renderTemplate(campaign.email.html, {
      name: admin.name ?? 'there',
      nickname: admin.nickname ?? 'admin',
      coinBalance: 60,
      appName,
    }),
    appName,
    preheader: campaign.email.preheader,
    unsubscribeUrl: notificationService.buildUnsubscribeUrl(admin.id, env.publicApiUrl),
    supportEmail: settings.payments.supportEmail,
    colors: theme?.colors,
  });

  const result = await emailService.sendRaw({
    to: toEmail,
    subject: `[Test] ${campaign.email.subject}`,
    html,
  });

  return { delivered: result.delivered, reason: result.reason ?? null };
}

export async function listTemplates() {
  return notificationRepository.listTemplates();
}

export async function createTemplate({ admin, ...data }) {
  const existing = await notificationRepository.findTemplateBySlug(data.slug);
  if (existing) throw new ConflictError('A template with this name already exists', 'TEMPLATE_SLUG_TAKEN');

  return notificationRepository.createTemplate({ ...data, createdByAdminId: admin.id });
}

export async function updateTemplate(templateId, patch) {
  const updated = await notificationRepository.updateTemplate(templateId, { $set: patch });
  if (!updated) throw new NotFoundError('Template not found', 'TEMPLATE_NOT_FOUND');
  return updated;
}

export async function deleteTemplate(templateId) {
  const deleted = await notificationRepository.deleteTemplate(templateId);
  if (!deleted) throw new NotFoundError('Template not found, or it is built in', 'TEMPLATE_NOT_FOUND');
  return { deleted: true };
}

/** Idempotent: gives a fresh install something to start from. */
export async function ensureSystemTemplatesSeeded() {
  for (const template of SYSTEM_EMAIL_TEMPLATES) {
    await notificationRepository.upsertSystemTemplate(template);
  }
}

export const campaignService = {
  setSchedule,
  startDueRecurringCampaigns,
  previewAudience,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  queueCampaign,
  cancelCampaign,
  sendCampaignBatch,
  listCampaigns,
  getCampaign,
  sendTestEmail,
  listTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  ensureSystemTemplatesSeeded,
};
