import mongoose from 'mongoose';
import { SupportTicketModel, SupportMessageModel, CannedResponseModel } from './support.model.js';
import { emitToUser, emitToAdmin } from '#src/realtime/emitter.js';
import { SOCKET_EVENT } from '#src/realtime/events.js';
import { BadRequestError, NotFoundError, ForbiddenError } from '#src/common/errors/index.js';
import { sendToUser } from '#src/modules/notifications/notification.service.js';

class SupportService {
  /** Safely find ticket by MongoDB _id or string ticketId without CastErrors */
  async findTicket(ticketId) {
    const isObjId = mongoose.Types.ObjectId.isValid(ticketId);
    const query = isObjId ? { $or: [{ _id: ticketId }, { ticketId: ticketId }] } : { ticketId: ticketId };
    return await SupportTicketModel.findOne(query);
  }

  /** Generate clean ticket reference e.g., SUP-849201 */
  generateTicketId() {
    const randomDigits = Math.floor(100000 + Math.random() * 900000);
    return `SUP-${randomDigits}`;
  }

  /** Helper to safely normalize attachments */
  normalizeAttachments(attachments) {
    if (!attachments || !Array.isArray(attachments)) return [];
    return attachments
      .map((att) => {
        if (typeof att === 'string') {
          return { url: att, type: 'image' };
        }
        if (att && typeof att === 'object' && att.url) {
          return { url: att.url, type: att.type || 'image' };
        }
        return null;
      })
      .filter(Boolean);
  }

  /** Create new support ticket from user */
  async createTicket(userId, { issueType, subject, message = '', attachments = [] }) {
    const safeAttachments = this.normalizeAttachments(attachments);
    const textMessage = typeof message === 'string' ? message.trim() : '';
    const cleanSubject = typeof subject === 'string' ? subject.trim() : '';

    if (!cleanSubject || cleanSubject.length < 3) {
      throw new BadRequestError('Subject is required (at least 3 characters) to open a support ticket.');
    }

    if (!textMessage && safeAttachments.length === 0) {
      throw new BadRequestError('Please provide a message describing your issue or attach a screenshot.');
    }

    const validCategories = new Set(['billing', 'account', 'technical', 'bug', 'other']);
    const safeCategory = validCategories.has(issueType) ? issueType : 'other';

    const ticketId = this.generateTicketId();

    const ticket = await SupportTicketModel.create({
      ticketId,
      userId,
      issueType: safeCategory,
      subject,
      lastMessage: textMessage || (safeAttachments.length > 0 ? '📷 Image attached' : ''),
      lastSenderType: 'user',
      unreadByAdmin: true,
      unreadByUser: false,
      status: 'pending',
    });

    const firstMsg = await SupportMessageModel.create({
      ticketId: ticket._id,
      senderType: 'user',
      senderId: userId,
      message: textMessage,
      attachments: safeAttachments,
    });

    const populatedTicket = await SupportTicketModel.findById(ticket._id).populate(
      'userId',
      'name username email avatarUrl phone',
    );

    // Realtime notification to Admin Panel
    emitToAdmin(SOCKET_EVENT.SUPPORT_TICKET_CREATED, {
      ticket: populatedTicket,
      message: firstMsg,
    });

    return { ticket: populatedTicket, message: firstMsg };
  }

  /** Get active / past support tickets for a user */
  async getUserTickets(userId) {
    const tickets = await SupportTicketModel.find({ userId })
      .sort({ updatedAt: -1 })
      .lean();

    return tickets;
  }

  /** Get ticket details and full message history */
  async getTicketDetails(ticketId, requesterUserId, isAdmin = false) {
    let ticket = await this.findTicket(ticketId);

    if (!ticket) {
      throw new NotFoundError('Support ticket not found.');
    }

    await ticket.populate('userId', 'name username email avatarUrl phone');

    if (!isAdmin && String(ticket.userId._id || ticket.userId) !== String(requesterUserId)) {
      throw new ForbiddenError('You do not have access to this support ticket.');
    }

    let hasChanged = false;

    // Auto-advance status from pending -> open when Admin views ticket
    if (isAdmin && ticket.status === 'pending') {
      ticket.status = 'open';
      hasChanged = true;
    }

    // Update unread status
    if (isAdmin && ticket.unreadByAdmin) {
      ticket.unreadByAdmin = false;
      hasChanged = true;
    } else if (!isAdmin && ticket.unreadByUser) {
      ticket.unreadByUser = false;
      hasChanged = true;
    }

    if (hasChanged) {
      await ticket.save();
      const payload = {
        ticketId: ticket.ticketId,
        dbTicketId: ticket._id,
        status: ticket.status,
        ticket,
      };
      emitToUser(ticket.userId._id || ticket.userId, SOCKET_EVENT.SUPPORT_TICKET_UPDATED, payload);
      emitToAdmin(SOCKET_EVENT.SUPPORT_TICKET_UPDATED, payload);
    }

    const messages = await SupportMessageModel.find({ ticketId: ticket._id })
      .sort({ createdAt: 1 })
      .populate('senderId', 'name username avatarUrl role')
      .lean();

    return { ticket, messages };
  }

  /** Add message to an existing support ticket */
  async addMessage(ticketId, senderId, senderType, { message = '', attachments = [], isQuickReply = false }) {
    const safeAttachments = this.normalizeAttachments(attachments);
    const textMessage = typeof message === 'string' ? message.trim() : '';

    if (!textMessage && safeAttachments.length === 0) {
      throw new BadRequestError('Please provide a message or an image attachment.');
    }

    const ticket = await this.findTicket(ticketId);

    if (!ticket) {
      throw new NotFoundError('Support ticket not found.');
    }

    // Status Workflow Transitions: pending -> open -> in_progress
    if (senderType === 'user' && (ticket.status === 'resolved' || ticket.status === 'closed')) {
      ticket.status = 'open';
    } else if (senderType === 'admin' && (ticket.status === 'pending' || ticket.status === 'open')) {
      ticket.status = 'in_progress';
    }

    ticket.lastMessage = textMessage || (safeAttachments.length > 0 ? '📷 Image attached' : '');
    ticket.lastSenderType = senderType;

    if (senderType === 'user') {
      ticket.unreadByAdmin = true;
      ticket.unreadByUser = false;
    } else {
      ticket.unreadByUser = true;
      ticket.unreadByAdmin = false;
    }

    await ticket.save();

    const newMsg = await SupportMessageModel.create({
      ticketId: ticket._id,
      senderType,
      senderId,
      message: textMessage,
      attachments: safeAttachments,
      isQuickReply,
    });

    const populatedMsg = await SupportMessageModel.findById(newMsg._id)
      .populate('senderId', 'name username avatarUrl role')
      .lean();

    const payload = {
      ticketId: ticket.ticketId,
      dbTicketId: ticket._id,
      message: populatedMsg,
      ticketStatus: ticket.status,
    };

    // Emit socket event to both user and admin
    emitToUser(ticket.userId, SOCKET_EVENT.SUPPORT_MESSAGE_NEW, payload);
    emitToAdmin(SOCKET_EVENT.SUPPORT_MESSAGE_NEW, payload);

    // Send push notification to user if admin replied
    if (senderType === 'admin') {
      sendToUser({
        userId: ticket.userId,
        title: '🎧 Support Team Replied',
        body: textMessage || 'Support team sent an attachment',
        data: {
          type: 'support_reply',
          ticketId: ticket.ticketId,
          dbTicketId: String(ticket._id),
        },
      }).catch(() => undefined);
    }

    return populatedMsg;
  }

  /** List tickets for Admin Panel */
  async getAdminTickets({ status, issueType, search, page = 1, limit = 20 }) {
    const query = {};
    if (status && status !== 'all') {
      query.status = status;
    }
    if (issueType && issueType !== 'all') {
      query.issueType = issueType;
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [tickets, total, unreadCount] = await Promise.all([
      SupportTicketModel.find(query)
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate('userId', 'name username email avatarUrl phone')
        .lean(),
      SupportTicketModel.countDocuments(query),
      SupportTicketModel.countDocuments({ unreadByAdmin: true }),
    ]);

    return {
      tickets,
      unreadCount,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit)) || 1,
      },
    };
  }

  /** Admin changes ticket status */
  async updateTicketStatus(ticketId, status, adminUserId) {
    const ticket = await this.findTicket(ticketId);

    if (!ticket) {
      throw new NotFoundError('Support ticket not found.');
    }

    ticket.status = status;
    if (status === 'resolved' || status === 'closed') {
      ticket.resolvedAt = new Date();
      ticket.resolvedBy = adminUserId;
    }

    await ticket.save();

    const updated = await SupportTicketModel.findById(ticket._id).populate(
      'userId',
      'name username email avatarUrl phone',
    );

    const payload = {
      ticketId: ticket.ticketId,
      status: ticket.status,
      ticket: updated,
    };

    emitToUser(ticket.userId, SOCKET_EVENT.SUPPORT_TICKET_UPDATED, payload);
    emitToAdmin(SOCKET_EVENT.SUPPORT_TICKET_UPDATED, payload);

    return updated;
  }

  /** Admin permanently deletes ticket & associated messages */
  async deleteTicket(ticketId) {
    const ticket = await this.findTicket(ticketId);
    if (!ticket) {
      throw new NotFoundError('Support ticket not found.');
    }

    await SupportMessageModel.deleteMany({ ticketId: ticket._id });
    await SupportTicketModel.findByIdAndDelete(ticket._id);

    const payload = {
      ticketId: ticket.ticketId,
      dbTicketId: ticket._id,
      deleted: true,
    };

    emitToUser(ticket.userId, SOCKET_EVENT.SUPPORT_TICKET_UPDATED, payload);
    emitToAdmin(SOCKET_EVENT.SUPPORT_TICKET_UPDATED, payload);

    return { message: 'Support ticket deleted successfully.' };
  }

  /** Canned Responses / Pre-defined Quick Messages */
  async getCannedResponses() {
    let responses = await CannedResponseModel.find().sort({ title: 1 }).lean();

    // Seed defaults if empty
    if (!responses || responses.length === 0) {
      const defaults = [
        {
          title: 'Greeting & Assistance',
          shortcut: '!hello',
          category: 'general',
          content: 'Hello! Thank you for contacting Support. How can we assist you today?',
        },
        {
          title: 'Coins / Payment Investigating',
          shortcut: '!checking',
          category: 'billing',
          content: 'Thank you for providing the details. We are currently verifying your transaction with our payment gateway and will update you shortly.',
        },
        {
          title: 'Coins Credited Successful',
          shortcut: '!credited',
          category: 'billing',
          content: 'Good news! We have verified your transaction and credited the coins to your account balance. Please refresh your app.',
        },
        {
          title: 'Request Screenshot / Transaction ID',
          shortcut: '!txid',
          category: 'billing',
          content: 'Could you please share your Transaction ID or a screenshot of your payment receipt so we can resolve this faster?',
        },
        {
          title: 'Issue Resolved',
          shortcut: '!resolved',
          category: 'general',
          content: 'We have marked this issue as resolved. If you have any further questions, feel free to reply back anytime!',
        },
      ];

      responses = await CannedResponseModel.insertMany(defaults);
    }

    return responses;
  }

  async createCannedResponse({ title, shortcut, content, category }) {
    if (!title || !content) {
      throw new BadRequestError('Title and content are required for a quick reply template.');
    }
    const created = await CannedResponseModel.create({
      title,
      shortcut: shortcut || `!${title.toLowerCase().replace(/\s+/g, '')}`,
      content,
      category: category || 'general',
    });
    return created;
  }

  async updateCannedResponse(id, data) {
    const updated = await CannedResponseModel.findByIdAndUpdate(id, data, { new: true });
    if (!updated) {
      throw new NotFoundError('Canned response not found.');
    }
    return updated;
  }

  async deleteCannedResponse(id) {
    await CannedResponseModel.findByIdAndDelete(id);
    return { success: true };
  }
}

export const supportService = new SupportService();
