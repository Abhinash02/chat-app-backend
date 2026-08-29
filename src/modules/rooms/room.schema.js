import { z } from 'zod';

import { objectIdSchema, paginationSchema } from '#src/common/validators/common.schema.js';

export const createRoomSchema = z
  .object({
    name: z.string().trim().min(2, 'Give your room a name').max(60),
    topic: z.string().trim().max(140).optional(),
    isVoiceEnabled: z.boolean().optional().default(true),
    isPrivate: z.boolean().optional().default(false),
    passcode: z.string().trim().min(4).max(32).optional(),
    maxParticipants: z.number().int().min(2).max(100).optional(),
  })
  .strict()
  .refine((value) => !value.isPrivate || Boolean(value.passcode), {
    message: 'Set a passcode for a private room',
    path: ['passcode'],
  });

export const joinRoomSchema = z.object({ passcode: z.string().trim().max(32).optional() }).strict();

export const roomIdParamSchema = z.object({ roomId: objectIdSchema });

export const roomParticipantParamSchema = z.object({
  roomId: objectIdSchema,
  userId: objectIdSchema,
});

export const listRoomsSchema = paginationSchema.extend({
  search: z.string().trim().min(1).max(40).optional(),
});

export const sendRoomMessageSchema = z.object({ text: z.string().min(1).max(2000) }).strict();

export const listRoomMessagesSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  before: z.coerce.date().optional(),
});

export const voiceStateSchema = z
  .object({
    isMuted: z.boolean().optional(),
    isVoiceConnected: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: 'Nothing to update' });
