import { Router } from 'express';

import {
  authenticate,
  requireVerifiedAccount,
  uploadMedia,
  validate,
} from '#src/common/middleware/index.js';
import { roomController } from '#src/modules/rooms/room.controller.js';
import {
  createRoomSchema,
  joinRoomSchema,
  listRoomMessagesSchema,
  listRoomsSchema,
  roomIdParamSchema,
  roomParticipantParamSchema,
  sendRoomMessageSchema,
  voiceStateSchema,
} from '#src/modules/rooms/room.schema.js';

const router = Router();

router.use(authenticate, requireVerifiedAccount);

router.post('/', validate({ body: createRoomSchema }), roomController.createRoom);
router.get('/', validate({ query: listRoomsSchema }), roomController.listRooms);
router.get('/:roomId', validate({ params: roomIdParamSchema }), roomController.getRoom);
router.post(
  '/:roomId/join',
  validate({ params: roomIdParamSchema, body: joinRoomSchema }),
  roomController.joinRoom,
);
router.post('/:roomId/leave', validate({ params: roomIdParamSchema }), roomController.leaveRoom);
router.post('/:roomId/close', validate({ params: roomIdParamSchema }), roomController.closeRoom);
router.get(
  '/:roomId/messages',
  validate({ params: roomIdParamSchema, query: listRoomMessagesSchema }),
  roomController.listMessages,
);
router.post(
  '/:roomId/messages',
  validate({ params: roomIdParamSchema, body: sendRoomMessageSchema }),
  roomController.sendMessage,
);
/**
 * Multipart, so multer runs before validation — `req.body` does not exist
 * until the form has been parsed.
 */
router.post(
  '/:roomId/media',
  uploadMedia.single('file'),
  validate({ params: roomIdParamSchema }),
  roomController.sendMedia,
);
router.patch(
  '/:roomId/voice',
  validate({ params: roomIdParamSchema, body: voiceStateSchema }),
  roomController.setVoiceState,
);
router.delete(
  '/:roomId/participants/:userId',
  validate({ params: roomParticipantParamSchema }),
  roomController.kickParticipant,
);

export const roomRoutes = router;
