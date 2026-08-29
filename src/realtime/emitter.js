import { logger } from '#src/config/logger.js';

/**
 * Thin indirection over the Socket.IO server instance.
 *
 * Services need to push events (wallet changed, theme swapped, message
 * delivered) but must not import the socket gateway — that would create a cycle
 * (gateway -> service -> gateway). The gateway registers the instance at boot
 * and services emit through this module instead.
 */
let io = null;

export function registerSocketServer(server) {
  io = server;
}

export function getSocketServer() {
  return io;
}

/** Room name for everything addressed at one account, across all their devices. */
export function userRoom(userId) {
  return `user:${String(userId)}`;
}

export function conversationRoom(conversationId) {
  return `conversation:${String(conversationId)}`;
}

export function chatRoomChannel(roomId) {
  return `room:${String(roomId)}`;
}

function safeEmit(target, event, payload) {
  if (!io) {
    // Realtime delivery is an enhancement, never a correctness requirement:
    // every event has a REST equivalent the client can poll or refetch.
    logger.debug({ event }, 'Socket server not ready; event dropped');
    return false;
  }

  target.emit(event, payload);
  return true;
}

export function emitToUser(userId, event, payload) {
  if (!io) return safeEmit(null, event, payload);
  return safeEmit(io.to(userRoom(userId)), event, payload);
}

export function emitToUsers(userIds, event, payload) {
  for (const userId of userIds) emitToUser(userId, event, payload);
}

export function emitToConversation(conversationId, event, payload) {
  if (!io) return safeEmit(null, event, payload);
  return safeEmit(io.to(conversationRoom(conversationId)), event, payload);
}

export function emitToRoom(roomId, event, payload) {
  if (!io) return safeEmit(null, event, payload);
  return safeEmit(io.to(chatRoomChannel(roomId)), event, payload);
}

export function emitToAll(event, payload) {
  if (!io) return safeEmit(null, event, payload);
  return safeEmit(io, event, payload);
}
