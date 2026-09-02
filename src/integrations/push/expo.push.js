import { logger } from '#src/config/logger.js';

const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';

/** Expo accepts at most 100 messages per request. */
const MAX_BATCH_SIZE = 100;
const REQUEST_TIMEOUT_MS = 20_000;

const EXPO_TOKEN_PATTERN = /^Expo(nent)?PushToken\[[^\]]+\]$/;

function chunk(items, size) {
  const batches = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}

/**
 * Expo's push service. Chosen because the mobile app is an Expo build: it
 * forwards to APNs and FCM without this server holding either set of
 * credentials.
 *
 * @type {import('#src/integrations/push/push.provider.js').PushProvider}
 */
export const expoPushProvider = {
  name: 'expo',

  isValidToken(token) {
    if (typeof token !== 'string' || !token.trim()) return false;
    return (
      EXPO_TOKEN_PATTERN.test(token) ||
      token.startsWith('ExponentPushToken[') ||
      token.startsWith('ExpoPushToken[') ||
      /^[a-zA-Z0-9_\-:.]{15,}$/.test(token)
    );
  },

  async send(messages) {
    if (messages.length === 0) return [];

    const tickets = [];

    for (const batch of chunk(messages, MAX_BATCH_SIZE)) {
      const payload = batch.map((message) => ({
        to: message.token,
        title: message.title,
        body: message.body,
        data: message.data ?? {},
        sound: message.sound ?? 'default',
        badge: message.badge,
        channelId: message.channelId,
        priority: 'high',
      }));

      try {
        const response = await fetch(EXPO_PUSH_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'Accept-Encoding': 'gzip, deflate',
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });

        if (!response.ok) {
          // A whole-batch failure is transport-level; nothing about these
          // specific tokens is known to be wrong, so none are retired.
          logger.error({ status: response.status }, 'Expo push request failed');
          tickets.push(
            ...batch.map((message) => ({ token: message.token, ok: false, error: `HTTP_${response.status}` })),
          );
          continue;
        }

        const body = await response.json();
        const results = body.data ?? [];

        batch.forEach((message, index) => {
          const result = results[index];

          if (result?.status === 'ok') {
            tickets.push({ token: message.token, ok: true });
            return;
          }

          const error = result?.details?.error ?? result?.message ?? 'UNKNOWN';
          tickets.push({
            token: message.token,
            ok: false,
            error,
            // The app was uninstalled or the token was reissued. Keeping it
            // would mean retrying a dead address on every future campaign.
            isUnregistered: error === 'DeviceNotRegistered',
          });
        });
      } catch (error) {
        logger.error({ err: error }, 'Expo push batch threw');
        tickets.push(
          ...batch.map((message) => ({ token: message.token, ok: false, error: 'REQUEST_FAILED' })),
        );
      }
    }

    return tickets;
  },
};
