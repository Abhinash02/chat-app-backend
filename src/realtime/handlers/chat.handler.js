import { AppError } from '#src/common/errors/index.js';
import { logger } from '#src/config/logger.js';
import { conversationRoom, emitToConversation } from '#src/realtime/emitter.js';
import { SOCKET_EVENT } from '#src/realtime/events.js';
import { chatService } from '#src/modules/chat/chat.service.js';
import { coinsService } from '#src/modules/coins/coins.service.js';
import { settingsService } from '#src/modules/settings/settings.service.js';

/**
 * Turns a thrown error into a structured `app:error` frame. Sockets have no
 * status codes, so the client relies on `code` to decide what to show.
 */
function emitError(socket, event, error) {
  const isOperational = error instanceof AppError;

  if (!isOperational) {
    logger.error({ err: error, event, userId: socket.data.user?.id }, 'Unhandled socket error');
  }

  socket.emit(SOCKET_EVENT.ERROR, {
    event,
    code: isOperational ? error.code : 'INTERNAL_ERROR',
    message: isOperational ? error.message : 'Something went wrong. Please try again.',
    details: isOperational ? error.details : undefined,
  });
}

function ack(callback, payload) {
  if (typeof callback === 'function') callback(payload);
}

export function registerChatHandlers(socket) {
  const user = socket.data.user;

  /**
   * Free-talk seconds are burned here rather than on a server timer, because
   * the allowance should only run down while the user actually has a chat open.
   * The server decides how many seconds each tick is worth and refuses ticks
   * that arrive faster than that, so a client cannot spam heartbeats to look
   * busy — nor slow them down to stretch the allowance.
   */
  let lastHeartbeatAt = 0;

  socket.on(SOCKET_EVENT.CONVERSATION_JOIN, async ({ conversationId } = {}, callback) => {
    try {
      await chatService.loadParticipantConversation({ conversationId, userId: user.id });
      socket.join(conversationRoom(conversationId));
      ack(callback, { joined: true, conversationId });
    } catch (error) {
      emitError(socket, SOCKET_EVENT.CONVERSATION_JOIN, error);
      ack(callback, { joined: false });
    }
  });

  socket.on(SOCKET_EVENT.CONVERSATION_LEAVE, ({ conversationId } = {}) => {
    socket.leave(conversationRoom(conversationId));
  });

  socket.on(SOCKET_EVENT.MESSAGE_SEND, async ({ conversationId, text, type } = {}, callback) => {
    try {
      const result = await chatService.sendMessage({ user, conversationId, text, type });
      ack(callback, { success: true, ...result });
    } catch (error) {
      emitError(socket, SOCKET_EVENT.MESSAGE_SEND, error);
      ack(callback, {
        success: false,
        code: error instanceof AppError ? error.code : 'INTERNAL_ERROR',
        details: error instanceof AppError ? error.details : undefined,
      });
    }
  });

  socket.on(SOCKET_EVENT.MESSAGE_READ, async ({ conversationId } = {}, callback) => {
    try {
      const result = await chatService.markConversationRead({ userId: user.id, conversationId });
      ack(callback, { success: true, ...result });
    } catch (error) {
      emitError(socket, SOCKET_EVENT.MESSAGE_READ, error);
    }
  });

  socket.on(SOCKET_EVENT.CHAT_HEARTBEAT, async ({ conversationId, seconds } = {}) => {
    try {
      const now = Date.now();
      const chatSettings = await settingsService.getChatSettings();
      let burnSeconds = chatSettings.heartbeatIntervalSeconds || 5;

      if (typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0) {
        burnSeconds = Math.min(Math.max(1, Math.round(seconds)), 120);
      }

      // Minimum rate limit between rapid consecutive ticks
      if (lastHeartbeatAt > 0 && now - lastHeartbeatAt < 800 && (!seconds || seconds <= 1)) {
        return;
      }
      lastHeartbeatAt = now;

      if (conversationId) {
        await chatService.loadParticipantConversation({ conversationId, userId: user.id });
      }

      await coinsService.consumeFreeTalk({
        userId: user.id,
        gender: user.gender,
        seconds: burnSeconds,
      });
    } catch (error) {
      emitError(socket, SOCKET_EVENT.CHAT_HEARTBEAT, error);
    }
  });

  socket.on(SOCKET_EVENT.TYPING_START, async ({ conversationId } = {}) => {
    const chatSettings = await settingsService.getChatSettings();
    if (!chatSettings.typingIndicatorEnabled) return;

    socket.to(conversationRoom(conversationId)).emit(SOCKET_EVENT.TYPING_UPDATE, {
      conversationId,
      userId: user.id,
      isTyping: true,
    });
  });

  socket.on(SOCKET_EVENT.TYPING_STOP, ({ conversationId } = {}) => {
    socket.to(conversationRoom(conversationId)).emit(SOCKET_EVENT.TYPING_UPDATE, {
      conversationId,
      userId: user.id,
      isTyping: false,
    });
  });

  socket.on('disconnecting', () => {
    // Clear any typing indicator this socket left behind.
    for (const room of socket.rooms) {
      if (room.startsWith('conversation:')) {
        emitToConversation(room.slice('conversation:'.length), SOCKET_EVENT.TYPING_UPDATE, {
          conversationId: room.slice('conversation:'.length),
          userId: user.id,
          isTyping: false,
        });
      }
    }
  });
}

export { emitError };
