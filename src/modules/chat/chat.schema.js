import { z } from 'zod';

import { objectIdSchema, paginationSchema } from '#src/common/validators/common.schema.js';
import {
  CLIENT_MESSAGE_TYPES,
  DELETE_SCOPE,
  QUICK_REACTIONS,
} from '#src/modules/chat/chat.constants.js';

export const openConversationSchema = z.object({ userId: objectIdSchema }).strict();

export const sendMessageSchema = z
  .object({
    // The hard cap here is a denial-of-service guard; the real, admin-editable
    // limit is enforced in the service against current settings.
    text: z.string().min(1, 'Write something first').max(5000),
    type: z.enum(CLIENT_MESSAGE_TYPES).optional(),
  })
  .strict();

export const conversationIdParamSchema = z.object({ conversationId: objectIdSchema });

export const messageIdParamSchema = z.object({ messageId: objectIdSchema });

export const listConversationsSchema = paginationSchema.extend({
  onlyUnread: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional()
    .default('false'),
});

export const listMessagesSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
  before: z.coerce.date().optional(),
});

/**
 * Which copy of the message to remove.
 *
 * Defaults to "me": a delete that guesses wrongly in the other direction
 * reaches into someone else's conversation, so the safer reading wins when a
 * client says nothing.
 */
export const deleteMessageSchema = z
  .object({
    scope: z.enum([DELETE_SCOPE.ME, DELETE_SCOPE.EVERYONE]).optional().default(DELETE_SCOPE.ME),
  })
  .strict();

export const reactToMessageSchema = z
  .object({
    emoji: z.enum(QUICK_REACTIONS),
  })
  .strict();

