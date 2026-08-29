import { expoPushProvider } from '#src/integrations/push/expo.push.js';

/**
 * Only one provider exists today, but business code resolves it through here so
 * moving to raw FCM later is a change in this file rather than in every caller.
 */
export function getPushProvider() {
  return expoPushProvider;
}

export { PUSH_CHANNEL, PUSH_SOUND } from '#src/integrations/push/push.provider.js';
