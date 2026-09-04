/** Every socket event name in one place, so client and server cannot drift. */
export const SOCKET_EVENT = Object.freeze({
  // Connection lifecycle
  READY: 'connection:ready',

  // Presence & User
  PRESENCE_UPDATED: 'presence:updated',
  PRESENCE_SUBSCRIBE: 'presence:subscribe',
  FOLLOW_UPDATED: 'user:follow:updated',

  // Chat
  CONVERSATION_JOIN: 'conversation:join',
  CONVERSATION_LEAVE: 'conversation:leave',
  MESSAGE_SEND: 'message:send',
  MESSAGE_NEW: 'message:new',
  MESSAGE_READ: 'message:read',
  MESSAGE_READ_RECEIPT: 'message:read:receipt',
  MESSAGE_DELIVERED: 'message:delivered',
  MESSAGE_DELETED: 'message:deleted',
  MESSAGE_REACTION: 'message:reaction',
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

  // Status / stories
  STATUS_NEW: 'status:new',
  STATUS_VIEWED: 'status:viewed',

  // Games
  LEADERBOARD_UPDATED: 'leaderboard:updated',

  // Admin push
  THEME_UPDATED: 'theme:updated',
  SETTINGS_UPDATED: 'settings:updated',
  FORCE_LOGOUT: 'account:force-logout',
  ACCOUNT_SUSPENDED: 'account:suspended',
  ADMIN_REPORT_NEW: 'admin:report:new',
  ADMIN_REPORT_UPDATED: 'admin:report:updated',
  ADMIN_FEEDBACK_NEW: 'admin:feedback:new',
  ADMIN_FEEDBACK_UPDATED: 'admin:feedback:updated',
  ADMIN_PAYMENT_NEW: 'admin:payment:new',
  ADMIN_PAYMENT_UPDATED: 'admin:payment:updated',

  // Customer Support
  SUPPORT_MESSAGE_SEND: 'support:message:send',
  SUPPORT_MESSAGE_NEW: 'support:message:new',
  SUPPORT_TICKET_CREATED: 'support:ticket:created',
  SUPPORT_TICKET_UPDATED: 'support:ticket:updated',

  // In-app Broadcast Notifications
  NOTIFICATION_NEW: 'notification:new',
  NOTIFICATION_COUNT_UPDATED: 'notification:count:updated',

  // Generic error channel
  ERROR: 'app:error',
});
