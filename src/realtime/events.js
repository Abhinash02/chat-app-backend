/** Every socket event name in one place, so client and server cannot drift. */
export const SOCKET_EVENT = Object.freeze({
  // Connection lifecycle
  READY: 'connection:ready',

  // Presence
  PRESENCE_UPDATED: 'presence:updated',
  PRESENCE_SUBSCRIBE: 'presence:subscribe',

  // Chat
  CONVERSATION_JOIN: 'conversation:join',
  CONVERSATION_LEAVE: 'conversation:leave',
  MESSAGE_SEND: 'message:send',
  MESSAGE_NEW: 'message:new',
  MESSAGE_READ: 'message:read',
  MESSAGE_READ_RECEIPT: 'message:read:receipt',
  TYPING_START: 'typing:start',
  TYPING_STOP: 'typing:stop',
  TYPING_UPDATE: 'typing:update',

  // Wallet / billing — drives the live coin counter in the app header
  WALLET_UPDATED: 'wallet:updated',
  FREE_TALK_TICK: 'freetalk:tick',
  FREE_TALK_EXHAUSTED: 'freetalk:exhausted',
  CHAT_HEARTBEAT: 'chat:heartbeat',
  DAILY_BONUS_READY: 'coins:daily-bonus-ready',

  // Rooms
  ROOM_JOIN: 'room:join',
  ROOM_LEAVE: 'room:leave',
  ROOM_MESSAGE_SEND: 'room:message:send',
  ROOM_MESSAGE_NEW: 'room:message:new',
  ROOM_PARTICIPANTS: 'room:participants',
  ROOM_VOICE_SIGNAL: 'room:voice:signal',
  ROOM_VOICE_STATE: 'room:voice:state',
  ROOM_CLOSED: 'room:closed',

  // Games
  LEADERBOARD_UPDATED: 'leaderboard:updated',

  // Admin push
  THEME_UPDATED: 'theme:updated',
  SETTINGS_UPDATED: 'settings:updated',
  FORCE_LOGOUT: 'account:force-logout',
  ACCOUNT_SUSPENDED: 'account:suspended',

  // Generic error channel
  ERROR: 'app:error',
});
