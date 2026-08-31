import { flattenToDotPaths } from '#src/common/utils/object.util.js';
import { settingsRepository } from '#src/modules/settings/settings.repository.js';

/**
 * Settings are read on every message send, presence tick and discovery query,
 * but change only when an admin saves the panel.
 *
 * Cache key      : process-local singleton (one settings document exists)
 * TTL            : 30s — bounds staleness on a multi-instance deployment
 * Invalidation   : `updateSettings` clears it in-process immediately
 * Source of truth: MongoDB `appsettings` collection
 * On failure     : the read error propagates; no stale-on-error fallback,
 *                  because billing rules must never be guessed.
 */
const CACHE_TTL_MS = 30_000;

let cachedSettings = null;
let cachedAt = 0;

export function invalidateSettingsCache() {
  cachedSettings = null;
  cachedAt = 0;
}

export async function getSettings({ forceRefresh = false } = {}) {
  const isFresh = cachedSettings && Date.now() - cachedAt < CACHE_TTL_MS;
  if (isFresh && !forceRefresh) return cachedSettings;

  cachedSettings = await settingsRepository.findOrCreate();
  cachedAt = Date.now();
  return cachedSettings;
}

export async function getCoinSettings() {
  const settings = await getSettings();
  return settings.coins;
}

export async function getChatSettings() {
  const settings = await getSettings();
  return settings.chat;
}

/**
 * Public, unauthenticated slice — what the mobile app needs before login.
 * Deliberately excludes moderation word lists and admin bookkeeping.
 */
export async function getPublicSettings() {
  const settings = await getSettings();

  return {
    coins: {
      freeTalkMinutes: settings.coins.freeTalkMinutes,
      messagesPerBlock: settings.coins.messagesPerBlock,
      coinsPerBlock: settings.coins.coinsPerBlock,
      dailyBonusCoins: settings.coins.dailyBonusCoins,
      dailyBonusIntervalHours: settings.coins.dailyBonusIntervalHours,
      chargedGenders: settings.coins.chargedGenders,
    },
    chat: {
      maxMessageLength: settings.chat.maxMessageLength,
      autoGreetingText: settings.chat.autoGreetingText,
      autoGreetingEnabled: settings.chat.autoGreetingEnabled,
      heartbeatIntervalSeconds: settings.chat.heartbeatIntervalSeconds,
      typingIndicatorEnabled: settings.chat.typingIndicatorEnabled,
      requireVerifiedEmail: settings.chat.requireVerifiedEmail,
    },
    games: { enabled: settings.games.enabled, leaderboardSize: settings.games.leaderboardSize },
    rooms: {
      enabled: settings.rooms.enabled,
      maxParticipants: settings.rooms.maxParticipants,
      voiceEnabled: settings.rooms.voiceEnabled,
    },
    discovery: settings.discovery,
    payments: {
      currency: settings.payments.currency,
      razorpayEnabled: settings.payments.razorpayEnabled,
      manualUpiEnabled: settings.payments.manualUpiEnabled,
      upiId: settings.payments.upiId,
      upiPayeeName: settings.payments.upiPayeeName,
      upiQrImageUrl: settings.payments.upiQrImageUrl,
      supportEmail: settings.payments.supportEmail,
    },
    appVersion: settings.appVersion ?? {
      latestVersion: '1.0.0',
      minimumVersion: '1.0.0',
      latestVersionCode: 1,
      forceUpdate: false,
      playStoreUrl: 'https://play.google.com/store/apps/details?id=app.vibechat.mobile',
      appStoreUrl: 'https://apps.apple.com/app/id123456789',
      updateMessage: 'A new version of Vibe is available with performance improvements!',
    },
  };
}

export async function updateSettings(patch, adminId) {
  // Ensure the row exists first. A dotted-path upsert ("coins.coinsPerBlock")
  // does not apply the schema defaults of its untouched siblings, which would
  // leave a freshly created document with half-empty nested groups.
  await settingsRepository.findOrCreate();

  const update = flattenToDotPaths(patch);
  const updated = await settingsRepository.update(update, adminId);
  invalidateSettingsCache();
  return updated;
}

export const settingsService = {
  getSettings,
  getCoinSettings,
  getChatSettings,
  getPublicSettings,
  updateSettings,
  invalidateSettingsCache,
};
