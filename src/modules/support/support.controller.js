import { asyncHandler } from '#src/common/utils/async-handler.util.js';
import { sendCreated, sendSuccess } from '#src/common/utils/response.util.js';
import { BadRequestError } from '#src/common/errors/index.js';
import { getStorageProvider } from '#src/integrations/storage/index.js';
import { supportService } from './support.service.js';

export const supportController = {
  /** User creates a ticket */
  createTicket: asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { issueType, subject, message, attachments } = req.body;
    const result = await supportService.createTicket(userId, { issueType, subject, message, attachments });
    return sendCreated(res, result);
  }),

  /** User lists their tickets */
  getMyTickets: asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const tickets = await supportService.getUserTickets(userId);
    return sendSuccess(res, tickets);
  }),

  /** Upload support image attachment to Cloudinary / storage */
  uploadAttachment: asyncHandler(async (req, res) => {
    const file = req.file || req.files?.[0];
    if (!file) {
      throw new BadRequestError('No image file provided.');
    }
    const storage = getStorageProvider();
    const uploaded = await storage.upload({
      buffer: file.buffer,
      mimeType: file.mimetype,
      folder: 'support',
      fileName: `support-${Date.now()}`,
    });
    return sendSuccess(res, { url: uploaded.url, key: uploaded.key });
  }),

  /** User or Admin views ticket details + messages */
  getTicketDetails: asyncHandler(async (req, res) => {
    const { ticketId } = req.params;
    const userId = req.user.id;
    const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
    const result = await supportService.getTicketDetails(ticketId, userId, isAdmin);
    return sendSuccess(res, result);
  }),

  /** User or Admin posts a message */
  addMessage: asyncHandler(async (req, res) => {
    const { ticketId } = req.params;
    const userId = req.user.id;
    const senderType = (req.user.role === 'admin' || req.user.role === 'super_admin') ? 'admin' : 'user';
    const { message, attachments, isQuickReply } = req.body;

    const newMsg = await supportService.addMessage(ticketId, userId, senderType, {
      message,
      attachments,
      isQuickReply,
    });
    return sendCreated(res, newMsg);
  }),

  /** Admin lists tickets */
  getAdminTickets: asyncHandler(async (req, res) => {
    const result = await supportService.getAdminTickets(req.query);
    return sendSuccess(res, result.tickets, {
      meta: {
        total: result.pagination.total,
        page: result.pagination.page,
        limit: result.pagination.limit,
        unreadCount: result.unreadCount,
      },
    });
  }),

  /** Admin updates ticket status */
  updateStatus: asyncHandler(async (req, res) => {
    const { ticketId } = req.params;
    const { status } = req.body;
    const adminId = req.user.id;
    const updated = await supportService.updateTicketStatus(ticketId, status, adminId);
    return sendSuccess(res, updated);
  }),

  /** Admin deletes support ticket */
  deleteTicket: asyncHandler(async (req, res) => {
    const { ticketId } = req.params;
    const result = await supportService.deleteTicket(ticketId);
    return sendSuccess(res, result);
  }),

  /** Canned responses (Admin & User view) */
  getCannedResponses: asyncHandler(async (req, res) => {
    const responses = await supportService.getCannedResponses();
    return sendSuccess(res, responses);
  }),

  createCannedResponse: asyncHandler(async (req, res) => {
    const created = await supportService.createCannedResponse(req.body);
    return sendCreated(res, created);
  }),

  updateCannedResponse: asyncHandler(async (req, res) => {
    const updated = await supportService.updateCannedResponse(req.params.id, req.body);
    return sendSuccess(res, updated);
  }),

  deleteCannedResponse: asyncHandler(async (req, res) => {
    const result = await supportService.deleteCannedResponse(req.params.id);
    return sendSuccess(res, result);
  }),
};
