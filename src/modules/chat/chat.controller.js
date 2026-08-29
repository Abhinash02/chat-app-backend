import { asyncHandler } from '#src/common/utils/async-handler.util.js';
import { sendCreated, sendSuccess } from '#src/common/utils/response.util.js';
import { chatService } from '#src/modules/chat/chat.service.js';

export const chatController = {
  openConversation: asyncHandler(async (req, res) => {
    const result = await chatService.openConversation({
      user: req.user,
      targetUserId: req.body.userId,
    });
    return sendCreated(res, result);
  }),

  listConversations: asyncHandler(async (req, res) => {
    const { items, meta } = await chatService.listConversations({
      userId: req.user.id,
      ...req.query,
    });
    return sendSuccess(res, items, { meta });
  }),

  getConversation: asyncHandler(async (req, res) => {
    const conversation = await chatService.getConversation({
      userId: req.user.id,
      conversationId: req.params.conversationId,
    });
    return sendSuccess(res, conversation);
  }),

  listMessages: asyncHandler(async (req, res) => {
    const { items, meta } = await chatService.listMessages({
      userId: req.user.id,
      conversationId: req.params.conversationId,
      ...req.query,
    });
    return sendSuccess(res, items, { meta });
  }),

  sendMessage: asyncHandler(async (req, res) => {
    const result = await chatService.sendMessage({
      user: req.user,
      conversationId: req.params.conversationId,
      ...req.body,
    });
    return sendCreated(res, result);
  }),

  markRead: asyncHandler(async (req, res) => {
    const result = await chatService.markConversationRead({
      userId: req.user.id,
      conversationId: req.params.conversationId,
    });
    return sendSuccess(res, result);
  }),

  closeConversation: asyncHandler(async (req, res) => {
    const result = await chatService.closeConversation({
      userId: req.user.id,
      conversationId: req.params.conversationId,
    });
    return sendSuccess(res, result);
  }),

  deleteMessage: asyncHandler(async (req, res) => {
    const result = await chatService.deleteMessage({
      userId: req.user.id,
      messageId: req.params.messageId,
    });
    return sendSuccess(res, result);
  }),

  getUnreadCount: asyncHandler(async (req, res) => {
    const result = await chatService.getTotalUnreadCount(req.user.id);
    return sendSuccess(res, result);
  }),
};
