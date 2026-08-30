export const CAMPAIGN_CHANNEL = Object.freeze({
  PUSH: 'push',
  EMAIL: 'email',
  BOTH: 'both',
});

export const CAMPAIGN_STATUS = Object.freeze({
  DRAFT: 'draft',
  /** Accepted and waiting for the worker to pick it up. */
  QUEUED: 'queued',
  SENDING: 'sending',
  SENT: 'sent',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
});

export const CAMPAIGN_REPEAT = Object.freeze({
  /** Sends once and finishes. */
  NONE: 'none',
  DAILY: 'daily',
  WEEKLY: 'weekly',
});

export const AUDIENCE_PRESET = Object.freeze({
  EVERYONE: 'everyone',
  BOYS: 'boys',
  GIRLS: 'girls',
  ONLINE_NOW: 'online_now',
  INACTIVE_7_DAYS: 'inactive_7_days',
  NEVER_PURCHASED: 'never_purchased',
  PAYING_USERS: 'paying_users',
  LOW_BALANCE: 'low_balance',
});

export const DEVICE_PLATFORM = Object.freeze({
  IOS: 'ios',
  ANDROID: 'android',
  WEB: 'web',
});

/**
 * How many recipients are processed per tick.
 *
 * Deliberately modest: mail providers throttle aggressively on free and
 * low-tier plans, and a burst that trips a rate limit gets the whole domain
 * flagged. Slower delivery is recoverable; a blocked sending domain is not.
 */
export const CAMPAIGN_BATCH_SIZE = 100;
export const CAMPAIGN_BATCH_DELAY_MS = 1_000;

/** Promotional mail must be unsubscribable; transactional mail must not be. */
export const EMAIL_CATEGORY = Object.freeze({
  TRANSACTIONAL: 'transactional',
  MARKETING: 'marketing',
});
