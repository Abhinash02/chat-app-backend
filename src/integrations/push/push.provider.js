/**
 * Application-facing push contract.
 *
 * @typedef {object} PushMessage
 * @property {string}  token     Device push token.
 * @property {string}  title
 * @property {string}  body
 * @property {object}  [data]    Delivered to the app for deep linking.
 * @property {string}  [sound]   Sound name, or 'default'.
 * @property {number}  [badge]   iOS badge count.
 * @property {string}  [channelId] Android notification channel.
 *
 * @typedef {object} PushTicket
 * @property {string}  token
 * @property {boolean} ok
 * @property {string}  [error]
 * @property {boolean} [isUnregistered]  The token is dead and should be retired.
 *
 * @typedef {object} PushProvider
 * @property {string} name
 * @property {(messages: PushMessage[]) => Promise<PushTicket[]>} send
 * @property {(token: string) => boolean} isValidToken
 */

/** Android notification channels the app registers. Keep in sync with the app. */
export const PUSH_CHANNEL = Object.freeze({
  MESSAGES: 'messages',
  ANNOUNCEMENTS: 'announcements',
});

export const PUSH_SOUND = Object.freeze({
  DEFAULT: 'default',
  MESSAGE: 'message.wav',
  COIN: 'coin.wav',
});
