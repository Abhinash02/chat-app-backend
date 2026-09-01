import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from '#src/common/errors/index.js';
import { hashPassword, verifyPassword } from '#src/common/utils/crypto.util.js';
import { buildPaginationMeta, resolvePagination } from '#src/common/utils/pagination.util.js';
import { isEmojiOnly, maskBlockedWords, normalizeMessageText } from '#src/common/utils/text.util.js';
import { emitToRoom } from '#src/realtime/emitter.js';
import { SOCKET_EVENT } from '#src/realtime/events.js';
import { MESSAGE_TYPE } from '#src/modules/chat/chat.constants.js';
import { getStorageProvider } from '#src/integrations/storage/index.js';
import { mediaKindOf } from '#src/common/middleware/upload.middleware.js';
import { settingsService } from '#src/modules/settings/settings.service.js';
import { userRepository } from '#src/modules/users/user.repository.js';
import { roomRepository } from '#src/modules/rooms/room.repository.js';
import { ROOM_ROLE, ROOM_STATUS } from '#src/modules/rooms/room.constants.js';

function toParticipantDto(participant) {
  const user = participant.userId;
  const isPopulated = user && typeof user === 'object' && user.nickname;

  return {
    userId: String(isPopulated ? user._id : user),
    nickname: isPopulated ? user.nickname : undefined,
    avatarUrl: isPopulated ? (user.avatarUrl ?? null) : undefined,
    avatarEmoji: isPopulated ? (user.avatarEmoji ?? null) : undefined,
    avatarColor: isPopulated ? (user.avatarColor ?? null) : undefined,
    gender: isPopulated ? user.gender : undefined,
    role: participant.role,
    isMuted: participant.isMuted,
    isVoiceConnected: participant.isVoiceConnected,
    joinedAt: participant.joinedAt,
  };
}

function toRoomDto(room, viewerId) {
  const host = room.hostId;
  const isPopulatedHost = host && typeof host === 'object' && host.nickname;

  return {
    id: String(room._id),
    name: room.name,
    topic: room.topic ?? '',
    host: {
      id: String(isPopulatedHost ? host._id : host),
      nickname: isPopulatedHost ? host.nickname : undefined,
      avatarUrl: isPopulatedHost ? (host.avatarUrl ?? null) : undefined,
      avatarEmoji: isPopulatedHost ? (host.avatarEmoji ?? null) : undefined,
      avatarColor: isPopulatedHost ? (host.avatarColor ?? null) : undefined,
      gender: isPopulatedHost ? host.gender : undefined,
    },
    isHost: viewerId ? String(isPopulatedHost ? host._id : host) === String(viewerId) : false,
    isVoiceEnabled: room.isVoiceEnabled,
    isPrivate: room.isPrivate,
    status: room.status,
    participantCount: room.participantCount ?? 0,
    maxParticipants: room.maxParticipants,
    participants: (room.participants ?? []).map(toParticipantDto),
    distanceKm:
      typeof room.distanceMeters === 'number'
        ? Math.round((room.distanceMeters / 1000) * 10) / 10
        : null,
    city: room.location?.city ?? null,
    isJoined: viewerId
      ? (room.participants ?? []).some((participant) => {
          const id = participant.userId?._id ?? participant.userId;
          return String(id) === String(viewerId);
        })
      : false,
    messageCount: room.messageCount ?? 0,
    lastActivityAt: room.lastActivityAt,
    createdAt: room.createdAt,
  };
}

function toRoomMessageDto(message) {
  const sender = message.senderId;
  const isPopulated = sender && typeof sender === 'object' && sender.nickname;

  return {
    id: String(message._id),
    roomId: String(message.roomId),
    sender: {
      id: String(isPopulated ? sender._id : sender),
      nickname: isPopulated ? sender.nickname : undefined,
      avatarUrl: isPopulated ? (sender.avatarUrl ?? null) : undefined,
      avatarEmoji: isPopulated ? (sender.avatarEmoji ?? null) : undefined,
      avatarColor: isPopulated ? (sender.avatarColor ?? null) : undefined,
      gender: isPopulated ? sender.gender : undefined,
    },
    type: message.type,
    text: message.text,
    media: message.media
      ? {
          url: message.media.url,
          durationSeconds: message.media.durationSeconds,
          width: message.media.width,
          height: message.media.height,
        }
      : null,
    createdAt: message.createdAt,
  };
}

async function assertRoomsEnabled() {
  const settings = await settingsService.getSettings();
  if (!settings.rooms.enabled) {
    throw new ForbiddenError('Rooms are currently unavailable', 'ROOMS_DISABLED');
  }
  return settings.rooms;
}

async function loadLiveRoom(roomId) {
  const room = await roomRepository.findById(roomId);
  if (!room) throw new NotFoundError('Room not found', 'ROOM_NOT_FOUND');
  if (room.status !== ROOM_STATUS.LIVE) throw new ForbiddenError('This room has ended', 'ROOM_CLOSED');
  return room;
}

function isParticipant(room, userId) {
  return (room.participants ?? []).some((participant) => {
    const id = participant.userId?._id ?? participant.userId;
    return String(id) === String(userId);
  });
}

export async function createRoom({ user, name, topic, isVoiceEnabled, isPrivate, passcode, maxParticipants }) {
  const roomSettings = await assertRoomsEnabled();

  const existing = await roomRepository.findRoomsContainingUser(user.id);
  const alreadyHosting = existing.some((room) => String(room.hostId) === String(user.id));
  if (alreadyHosting) {
    throw new ConflictError('You already have a live room. Close it before opening another.', 'ROOM_ALREADY_HOSTED');
  }

  if (isPrivate && !passcode) {
    throw new BadRequestError('Set a passcode for a private room', 'PASSCODE_REQUIRED');
  }

  const capacity = Math.min(maxParticipants ?? roomSettings.maxParticipants, roomSettings.maxParticipants);

  /*
   * The room takes the host's location at the moment it opens, so people
   * nearby can find it. Absent when the host has not shared theirs, which
   * leaves the room out of nearby results but still in the main list — a room
   * without coordinates should not be a room nobody can join.
   */
  const host = await userRepository.findById(user.id);
  const hostCoordinates = host?.location?.coordinates;

  const location =
    Array.isArray(hostCoordinates) && hostCoordinates.length === 2
      ? { type: 'Point', coordinates: hostCoordinates, city: host.location?.city }
      : undefined;

  const room = await roomRepository.create({
    name,
    topic: topic ?? '',
    hostId: user.id,
    isVoiceEnabled: roomSettings.voiceEnabled && isVoiceEnabled !== false,
    isPrivate: Boolean(isPrivate),
    passcodeHash: isPrivate ? await hashPassword(passcode) : null,
    maxParticipants: capacity,
    // The host is seated immediately, unmuted, so the room is never empty.
    participants: [{ userId: user.id, role: ROOM_ROLE.HOST, isMuted: false, joinedAt: new Date() }],
    participantCount: 1,
    ...(location ? { location } : {}),
  });

  const populated = await roomRepository.findPopulatedById(room._id);
  return toRoomDto(populated, user.id);
}

export async function listRooms({ userId, page, limit, search, latitude, longitude, radiusKm }) {
  const settings = await settingsService.getSettings();
  await assertRoomsEnabled();
  const { skip, page: safePage, limit: safeLimit } = resolvePagination({ page, limit });

  // Coordinates switch the list to a distance-ordered feed, the same way user
  // discovery works — one mental model for "near me" across the app.
  const useLocation = latitude !== undefined && longitude !== undefined;

  const { items, total } = useLocation
    ? await roomRepository.findNearby({
        coordinates: [longitude, latitude],
        radiusKm: Math.min(radiusKm ?? settings.discovery.defaultRadiusKm, settings.discovery.maxRadiusKm),
        skip,
        limit: safeLimit,
      })
    : await roomRepository.listLive({ skip, limit: safeLimit, search });

  return {
    items: items.map((room) => toRoomDto(room, userId)),
    meta: buildPaginationMeta({ page: safePage, limit: safeLimit, total }),
  };
}

export async function getRoom({ userId, roomId }) {
  const room = await roomRepository.findPopulatedById(roomId);
  if (!room) throw new NotFoundError('Room not found', 'ROOM_NOT_FOUND');
  return toRoomDto(room, userId);
}

export async function joinRoom({ user, roomId, passcode }) {
  await assertRoomsEnabled();

  const room = await roomRepository.findById(roomId, { includePasscode: true });
  if (!room) throw new NotFoundError('Room not found', 'ROOM_NOT_FOUND');
  if (room.status !== ROOM_STATUS.LIVE) throw new ForbiddenError('This room has ended', 'ROOM_CLOSED');

  if (isParticipant(room, user.id)) {
    const populated = await roomRepository.findPopulatedById(roomId);
    return { room: toRoomDto(populated, user.id), alreadyJoined: true };
  }

  if (room.isPrivate) {
    if (!passcode) throw new UnauthorizedError('This room needs a passcode', 'PASSCODE_REQUIRED');
    if (!(await verifyPassword(passcode, room.passcodeHash))) {
      throw new UnauthorizedError('That passcode is incorrect', 'PASSCODE_INVALID');
    }
  }

  const updated = await roomRepository.addParticipant({
    roomId,
    userId: user.id,
    capacity: room.maxParticipants,
  });

  if (!updated) throw new ConflictError('This room is full', 'ROOM_FULL');

  const populated = await roomRepository.findPopulatedById(roomId);
  const dto = toRoomDto(populated, user.id);

  emitToRoom(roomId, SOCKET_EVENT.ROOM_PARTICIPANTS, {
    roomId: String(roomId),
    participants: dto.participants,
    participantCount: dto.participantCount,
  });

  return { room: dto, alreadyJoined: false };
}

export async function leaveRoom({ user, roomId }) {
  const room = await roomRepository.findById(roomId);
  if (!room) return { left: true };

  const updated = await roomRepository.removeParticipant({ roomId, userId: user.id });
  if (updated) {
    const populated = await roomRepository.findPopulatedById(roomId);
    const dto = toRoomDto(populated, user.id);
    emitToRoom(roomId, SOCKET_EVENT.ROOM_PARTICIPANTS, {
      roomId: String(roomId),
      participants: dto.participants,
      participantCount: dto.participantCount,
    });
  }

  return { left: true, roomClosed: false };
}

export async function closeRoom({ user, roomId }) {
  const room = await loadLiveRoom(roomId);

  if (String(room.hostId) !== String(user.id)) {
    throw new ForbiddenError('Only the host can close this room', 'NOT_ROOM_HOST');
  }

  await roomRepository.close(roomId);
  emitToRoom(roomId, SOCKET_EVENT.ROOM_CLOSED, { roomId: String(roomId), reason: 'HOST_CLOSED' });

  return { closed: true };
}

export async function sendRoomMessage({ user, roomId, text }) {
  const room = await loadLiveRoom(roomId);

  if (!isParticipant(room, user.id)) {
    throw new ForbiddenError('Join the room before sending a message', 'NOT_IN_ROOM');
  }

  const settings = await settingsService.getSettings();
  const normalized = normalizeMessageText(text);
  if (!normalized) throw new BadRequestError('Write something first', 'EMPTY_MESSAGE');

  const finalText = settings.moderation.profanityFilterEnabled
    ? maskBlockedWords(normalized, settings.moderation.blockedWords).text
    : normalized;

  // Rooms are free by product decision — no billing call on this path.
  const created = await roomRepository.createMessage({
    roomId,
    senderId: user.id,
    type: isEmojiOnly(finalText) ? MESSAGE_TYPE.EMOJI : MESSAGE_TYPE.TEXT,
    text: finalText,
  });

  const dto = toRoomMessageDto({
    ...created.toObject(),
    senderId: { _id: user.id, nickname: user.nickname, avatarUrl: user.avatarUrl, gender: user.gender },
  });

  emitToRoom(roomId, SOCKET_EVENT.ROOM_MESSAGE_NEW, dto);
  return dto;
}

/**
 * Sends a photo, voice note or short video to a room.
 *
 * The file goes to the storage provider and only its URL reaches the database,
 * for the same reason avatars do: a 12MB video in Mongo would exhaust a free
 * tier in a few hundred messages.
 *
 * Duration comes from the provider rather than the client. A phone reporting
 * "5 seconds" for a two-minute recording is the difference between a working
 * limit and a decorative one.
 */
export async function sendRoomMedia({ user, roomId, file, caption = '' }) {
  const room = await loadLiveRoom(roomId);

  if (!isParticipant(room, user.id)) {
    throw new ForbiddenError('Join the room before sending anything', 'NOT_IN_ROOM');
  }

  if (!file) throw new BadRequestError('Choose a file to send', 'FILE_REQUIRED');

  const kind = mediaKindOf(file.mimetype);
  if (!kind) throw new BadRequestError('That file type is not supported', 'UNSUPPORTED_FILE_TYPE');

  const type = {
    image: MESSAGE_TYPE.IMAGE,
    audio: MESSAGE_TYPE.VOICE,
    video: MESSAGE_TYPE.VIDEO,
  }[kind];

  const storage = getStorageProvider();
  const uploaded = await storage.upload({
    buffer: file.buffer,
    mimeType: file.mimetype,
    folder: `rooms/${roomId}`,
    fileName: kind,
  });

  const settings = await settingsService.getSettings();
  const cleanCaption = settings.moderation.profanityFilterEnabled
    ? maskBlockedWords(normalizeMessageText(caption), settings.moderation.blockedWords).text
    : normalizeMessageText(caption);

  const created = await roomRepository.createMessage({
    roomId,
    senderId: user.id,
    type,
    text: cleanCaption,
    media: {
      url: uploaded.url,
      storageKey: uploaded.key,
      resourceType: uploaded.resourceType ?? null,
      mimeType: file.mimetype,
      durationSeconds: uploaded.durationSeconds ?? null,
      sizeBytes: file.size ?? null,
      width: uploaded.width ?? null,
      height: uploaded.height ?? null,
    },
  });

  const dto = toRoomMessageDto({
    ...created.toObject(),
    senderId: {
      _id: user.id,
      nickname: user.nickname,
      avatarUrl: user.avatarUrl,
      avatarEmoji: user.avatarEmoji,
      avatarColor: user.avatarColor,
      gender: user.gender,
    },
  });

  emitToRoom(roomId, SOCKET_EVENT.ROOM_MESSAGE_NEW, dto);
  return dto;
}

export async function listRoomMessages({ user, roomId, limit, before }) {
  const room = await loadLiveRoom(roomId);

  if (room.isPrivate && !isParticipant(room, user.id)) {
    throw new ForbiddenError('Join the room with the passcode to read the chat', 'NOT_IN_ROOM');
  }

  const result = await roomRepository.listMessages({
    roomId,
    limit: Math.min(Number(limit) || 50, 100),
    before,
  });

  return { items: result.items.map(toRoomMessageDto), meta: { hasMore: result.hasMore, nextCursor: result.nextCursor } };
}

export async function setVoiceState({ user, roomId, isMuted, isVoiceConnected }) {
  const room = await loadLiveRoom(roomId);

  if (!isParticipant(room, user.id)) {
    throw new ForbiddenError('Join the room first', 'NOT_IN_ROOM');
  }

  const patch = {};
  if (isMuted !== undefined) patch.isMuted = isMuted;
  if (isVoiceConnected !== undefined) patch.isVoiceConnected = isVoiceConnected;

  await roomRepository.updateParticipantState({ roomId, userId: user.id, patch });

  const payload = { roomId: String(roomId), userId: String(user.id), ...patch };
  emitToRoom(roomId, SOCKET_EVENT.ROOM_VOICE_STATE, payload);

  return payload;
}

/** Host moderation: remove someone and let their client tear down its peers. */
export async function kickParticipant({ user, roomId, targetUserId }) {
  const room = await loadLiveRoom(roomId);

  if (String(room.hostId) !== String(user.id)) {
    throw new ForbiddenError('Only the host can remove someone', 'NOT_ROOM_HOST');
  }

  if (String(targetUserId) === String(user.id)) {
    throw new BadRequestError('Close the room instead of removing yourself', 'CANNOT_KICK_HOST');
  }

  await roomRepository.removeParticipant({ roomId, userId: targetUserId });

  const populated = await roomRepository.findPopulatedById(roomId);
  const dto = toRoomDto(populated, user.id);

  emitToRoom(roomId, SOCKET_EVENT.ROOM_PARTICIPANTS, {
    roomId: String(roomId),
    participants: dto.participants,
    participantCount: dto.participantCount,
    removedUserId: String(targetUserId),
  });

  return { removed: true };
}

/** Called on socket disconnect so a dropped phone does not leave a ghost seat. */
/**
 * Cleans up after a socket drops.
 *
 * A disconnect is not the same as leaving. Backgrounding the app, a tunnel, a
 * screen change — all of these drop the socket, and treating the host's as
 * "the host left" destroyed rooms seconds after they were created. That was
 * the bug: a room appeared to vanish the moment its creator glanced away.
 *
 * So a dropped socket removes the participant but never closes the room. Only
 * an explicit leave or close does that, and the housekeeping sweep collects
 * rooms that sit empty. A host who reconnects finds their room still standing.
 */
export async function handleUserDisconnected(userId) {
  const rooms = await roomRepository.findRoomsContainingUser(userId);

  for (const room of rooms) {
    await roomRepository.removeParticipant({ roomId: room._id, userId });

    const populated = await roomRepository.findPopulatedById(room._id);
    if (!populated) continue;

    const dto = toRoomDto(populated, userId);
    emitToRoom(room._id, SOCKET_EVENT.ROOM_PARTICIPANTS, {
      roomId: String(room._id),
      participants: dto.participants,
      participantCount: dto.participantCount,
    });
  }

  return rooms.length;
}

export const roomService = {
  sendRoomMedia,
  createRoom,
  listRooms,
  getRoom,
  joinRoom,
  leaveRoom,
  closeRoom,
  sendRoomMessage,
  listRoomMessages,
  setVoiceState,
  kickParticipant,
  handleUserDisconnected,
};
