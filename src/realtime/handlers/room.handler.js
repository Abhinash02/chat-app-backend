import { chatRoomChannel } from '#src/realtime/emitter.js';
import { SOCKET_EVENT } from '#src/realtime/events.js';
import { VOICE_SIGNAL_TYPE } from '#src/modules/rooms/room.constants.js';
import { roomService } from '#src/modules/rooms/room.service.js';
import { emitError } from '#src/realtime/handlers/chat.handler.js';

const VALID_SIGNAL_TYPES = new Set(Object.values(VOICE_SIGNAL_TYPE));

export function registerRoomHandlers(socket) {
  const user = socket.data.user;

  socket.on(SOCKET_EVENT.ROOM_JOIN, async ({ roomId, passcode } = {}, callback) => {
    try {
      const result = await roomService.joinRoom({ user, roomId, passcode });
      socket.join(chatRoomChannel(roomId));
      if (typeof callback === 'function') callback({ success: true, ...result });
    } catch (error) {
      emitError(socket, SOCKET_EVENT.ROOM_JOIN, error);
      if (typeof callback === 'function') callback({ success: false, code: error.code });
    }
  });

  socket.on(SOCKET_EVENT.ROOM_LEAVE, async ({ roomId } = {}) => {
    try {
      await roomService.leaveRoom({ user, roomId });
      socket.leave(chatRoomChannel(roomId));
    } catch (error) {
      emitError(socket, SOCKET_EVENT.ROOM_LEAVE, error);
    }
  });

  socket.on(SOCKET_EVENT.ROOM_MESSAGE_SEND, async ({ roomId, text } = {}, callback) => {
    try {
      const message = await roomService.sendRoomMessage({ user, roomId, text });
      if (typeof callback === 'function') callback({ success: true, message });
    } catch (error) {
      emitError(socket, SOCKET_EVENT.ROOM_MESSAGE_SEND, error);
      if (typeof callback === 'function') callback({ success: false, code: error.code });
    }
  });

  /**
   * WebRTC signalling relay.
   *
   * The server never inspects or stores the SDP/ICE payload — it only forwards
   * it to the named peer, and stamps `fromUserId` itself so a participant
   * cannot impersonate another. Audio flows peer to peer, never through here.
   */
  socket.on(SOCKET_EVENT.ROOM_VOICE_SIGNAL, ({ roomId, targetUserId, signalType, payload } = {}) => {
    if (!roomId || !targetUserId || !VALID_SIGNAL_TYPES.has(signalType)) return;

    // Only forward inside a room this socket has actually joined.
    if (!socket.rooms.has(chatRoomChannel(roomId))) return;

    socket.to(`user:${targetUserId}`).emit(SOCKET_EVENT.ROOM_VOICE_SIGNAL, {
      roomId,
      fromUserId: user.id,
      signalType,
      payload,
    });
  });

  socket.on(SOCKET_EVENT.ROOM_VOICE_STATE, async ({ roomId, isMuted, isVoiceConnected } = {}) => {
    try {
      await roomService.setVoiceState({ user, roomId, isMuted, isVoiceConnected });
    } catch (error) {
      emitError(socket, SOCKET_EVENT.ROOM_VOICE_STATE, error);
    }
  });
}
