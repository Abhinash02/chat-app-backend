import { Router } from 'express';

import {
  authenticate,
  requireVerifiedAccount,
  uploadImage,
  validate,
} from '#src/common/middleware/index.js';
import { chatController } from '#src/modules/chat/chat.controller.js';
import {
  conversationIdParamSchema,
  deleteMessageSchema,
  listConversationsSchema,
  listMessagesSchema,
  messageIdParamSchema,
  openConversationSchema,
  reactToMessageSchema,
  sendImageMessageSchema,
  sendMessageSchema,
} from '#src/modules/chat/chat.schema.js';

const router = Router();

router.use(authenticate, requireVerifiedAccount);

router.get('/unread-count', chatController.getUnreadCount);

router.post(
  '/conversations',
  validate({ body: openConversationSchema }),
  chatController.openConversation,
);
router.get(
  '/conversations',
  validate({ query: listConversationsSchema }),
  chatController.listConversations,
);
router.get(
  '/conversations/:conversationId',
  validate({ params: conversationIdParamSchema }),
  chatController.getConversation,
);
router.get(
  '/conversations/:conversationId/messages',
  validate({ params: conversationIdParamSchema, query: listMessagesSchema }),
  chatController.listMessages,
);
router.post(
  '/conversations/:conversationId/messages',
  validate({ params: conversationIdParamSchema, body: sendMessageSchema }),
  chatController.sendMessage,
);
/**
 * Photos. Multer runs before validation, because `req.body` does not exist
 * until the multipart form has been parsed.
 */
router.post(
  '/conversations/:conversationId/media',
  uploadImage.single('file'),
  validate({ params: conversationIdParamSchema, body: sendImageMessageSchema }),
  chatController.sendImageMessage,
);
router.post(
  '/conversations/:conversationId/read',
  validate({ params: conversationIdParamSchema }),
  chatController.markRead,
);
router.post(
  '/conversations/:conversationId/close',
  validate({ params: conversationIdParamSchema }),
  chatController.closeConversation,
);
/** `scope` rides in the query: DELETE bodies are dropped by some proxies. */
router.delete(
  '/messages/:messageId',
  validate({ params: messageIdParamSchema, query: deleteMessageSchema }),
  chatController.deleteMessage,
);
router.post(
  '/messages/:messageId/reactions',
  validate({ params: messageIdParamSchema, body: reactToMessageSchema }),
  chatController.reactToMessage,
);

export const chatRoutes = router;
