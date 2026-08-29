import { asyncHandler } from '#src/common/utils/async-handler.util.js';
import { sendCreated, sendSuccess } from '#src/common/utils/response.util.js';
import { roomService } from '#src/modules/rooms/room.service.js';

export const roomController = {
  createRoom: asyncHandler(async (req, res) => {
    const room = await roomService.createRoom({ user: req.user, ...req.body });
    return sendCreated(res, room);
  }),

  listRooms: asyncHandler(async (req, res) => {
    const { items, meta } = await roomService.listRooms({ userId: req.user.id, ...req.query });
    return sendSuccess(res, items, { meta });
  }),

  getRoom: asyncHandler(async (req, res) => {
    const room = await roomService.getRoom({ userId: req.user.id, roomId: req.params.roomId });
    return sendSuccess(res, room);
  }),

  joinRoom: asyncHandler(async (req, res) => {
    const result = await roomService.joinRoom({
      user: req.user,
      roomId: req.params.roomId,
      ...req.body,
    });
    return sendSuccess(res, result);
  }),

  leaveRoom: asyncHandler(async (req, res) => {
    const result = await roomService.leaveRoom({ user: req.user, roomId: req.params.roomId });
    return sendSuccess(res, result);
  }),

  closeRoom: asyncHandler(async (req, res) => {
    const result = await roomService.closeRoom({ user: req.user, roomId: req.params.roomId });
    return sendSuccess(res, result);
  }),

  sendMessage: asyncHandler(async (req, res) => {
    const message = await roomService.sendRoomMessage({
      user: req.user,
      roomId: req.params.roomId,
      ...req.body,
    });
    return sendCreated(res, message);
  }),

  listMessages: asyncHandler(async (req, res) => {
    const { items, meta } = await roomService.listRoomMessages({
      user: req.user,
      roomId: req.params.roomId,
      ...req.query,
    });
    return sendSuccess(res, items, { meta });
  }),

  setVoiceState: asyncHandler(async (req, res) => {
    const result = await roomService.setVoiceState({
      user: req.user,
      roomId: req.params.roomId,
      ...req.body,
    });
    return sendSuccess(res, result);
  }),

  kickParticipant: asyncHandler(async (req, res) => {
    const result = await roomService.kickParticipant({
      user: req.user,
      roomId: req.params.roomId,
      targetUserId: req.params.userId,
    });
    return sendSuccess(res, result);
  }),
};
