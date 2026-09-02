import { z } from 'zod';

import { emailSchema, objectIdSchema, paginationSchema } from '#src/common/validators/common.schema.js';
import {
  AUDIENCE_PRESET,
  CAMPAIGN_CHANNEL,
  CAMPAIGN_REPEAT,
  CAMPAIGN_STATUS,
  DEVICE_PLATFORM,
} from '#src/modules/notifications/notification.constants.js';

/**
 * A repeat rule. The time is a wall-clock hour and minute in a named zone, not
 * a UTC instant, so "every day at 7pm" stays 7pm across a daylight-saving
 * change instead of drifting by an hour twice a year.
 */
export const repeatTimeSchema = z.object({
  hour: z.number().int().min(0).max(23),
  minute: z.number().int().min(0).max(59),
});

export const repeatSchema = z
  .object({
    rule: z.nativeEnum(CAMPAIGN_REPEAT).default(CAMPAIGN_REPEAT.NONE),
    hour: z.number().int().min(0).max(23).optional().default(9),
    minute: z.number().int().min(0).max(59).optional().default(0),
    times: z.array(repeatTimeSchema).optional(),
    weekday: z.number().int().min(0).max(6).optional(),
    weekdays: z.array(z.number().int().min(0).max(6)).optional(),
    timezone: z
      .string()
      .trim()
      .max(64)
      .refine((zone) => {
        try {
          new Intl.DateTimeFormat('en-US', { timeZone: zone });
          return true;
        } catch {
          return false;
        }
      }, 'Unknown timezone')
      .default('Asia/Kolkata'),
    isEnabled: z.boolean().default(true),
  })
  .strict();

export const registerDeviceSchema = z
  .object({
    token: z.string().trim().min(10).max(200),
    platform: z.nativeEnum(DEVICE_PLATFORM),
    deviceId: z.string().trim().max(120).optional(),
    deviceName: z.string().trim().max(120).optional(),
    appVersion: z.string().trim().max(20).optional(),
  })
  .strict();

export const unregisterDeviceSchema = z.object({ token: z.string().trim().min(10).max(200) }).strict();

export const audienceSchema = z
  .object({
    preset: z.nativeEnum(AUDIENCE_PRESET).default(AUDIENCE_PRESET.EVERYONE),
    gender: z.enum(['male', 'female']).nullable().optional(),
    onlineOnly: z.boolean().optional(),
    inactiveForDays: z.number().int().min(1).max(365).nullable().optional(),
    maxCoinBalance: z.number().int().min(0).nullable().optional(),
    hasPurchased: z.boolean().nullable().optional(),
  })
  .strict();

const pushContentSchema = z
  .object({
    title: z.string().trim().min(1, 'Give the notification a title').max(100),
    body: z.string().trim().max(300).optional().default(''),
    deepLink: z.string().trim().max(200).optional().default(''),
    sound: z.string().trim().max(40).optional().default('default'),
  })
  .strict();

const emailContentSchema = z
  .object({
    subject: z.string().trim().min(1, 'Give the email a subject').max(200),
    preheader: z.string().trim().max(200).optional().default(''),
    // Authored by an administrator and rendered only into an email, never into
    // a page — the length cap is a payload guard, not a sanitiser.
    html: z.string().max(200_000).optional().default(''),
    templateId: objectIdSchema.optional(),
  })
  .strict();

export const createCampaignSchema = z
  .object({
    name: z.string().trim().min(2, 'Name this campaign').max(100),
    channel: z.nativeEnum(CAMPAIGN_CHANNEL),
    audience: audienceSchema.optional(),
    push: pushContentSchema.optional(),
    email: emailContentSchema.optional(),
    repeat: repeatSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const needsPush = value.channel === CAMPAIGN_CHANNEL.PUSH || value.channel === CAMPAIGN_CHANNEL.BOTH;
    const needsEmail = value.channel === CAMPAIGN_CHANNEL.EMAIL || value.channel === CAMPAIGN_CHANNEL.BOTH;

    if (needsPush && !value.push) {
      ctx.addIssue({ code: 'custom', path: ['push'], message: 'Write the notification' });
    }

    if (needsEmail && !value.email) {
      ctx.addIssue({ code: 'custom', path: ['email'], message: 'Write the email' });
    }

    if (needsEmail && value.email && !value.email.html?.trim() && !value.email.templateId) {
      ctx.addIssue({
        code: 'custom',
        path: ['email', 'html'],
        message: 'Write the email body or pick a template',
      });
    }
  });

export const queueCampaignSchema = z
  .object({ scheduledAt: z.coerce.date().nullable().optional() })
  .strict();

export const sendTestSchema = z.object({ toEmail: emailSchema }).strict();

export const campaignIdParamSchema = z.object({ campaignId: objectIdSchema });

export const listCampaignsSchema = paginationSchema.extend({
  status: z.nativeEnum(CAMPAIGN_STATUS).optional(),
});

export const templateSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .min(2)
      .max(60)
      .regex(/^[a-z0-9-]+$/, 'Use lowercase letters, numbers and hyphens only'),
    description: z.string().trim().max(200).optional(),
    subject: z.string().trim().min(1).max(200),
    preheader: z.string().trim().max(200).optional(),
    html: z.string().min(1).max(200_000),
    variables: z.array(z.string().trim().max(40)).max(20).optional(),
  })
  .strict();

export const updateTemplateSchema = templateSchema
  .partial()
  .omit({ slug: true })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: 'Nothing to update' });

export const templateIdParamSchema = z.object({ templateId: objectIdSchema });

export const unsubscribeQuerySchema = z.object({ token: z.string().min(10).max(300) });

export const setScheduleSchema = z.object({ repeat: repeatSchema }).strict();
