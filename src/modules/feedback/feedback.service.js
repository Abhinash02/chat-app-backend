import { FeedbackModel } from './feedback.model.js';
import { BadRequestError, NotFoundError } from '#src/common/errors/index.js';
import { UserModel } from '#src/modules/users/user.model.js';
import { notificationService } from '#src/modules/notifications/notification.service.js';
import { emailService } from '#src/integrations/email/email.service.js';
import { emitToAdmin, emitToUser } from '#src/realtime/emitter.js';
import { SOCKET_EVENT } from '#src/realtime/events.js';
import { logger } from '#src/config/logger.js';

export async function submitFeedback({ userId, category, rating, message, deviceInfo }) {
  if (!message || !message.trim()) {
    throw new BadRequestError('Please provide a feedback message', 'MESSAGE_REQUIRED');
  }

  const feedback = await FeedbackModel.create({
    userId: userId ?? null,
    category: category || 'suggestion',
    rating: Number(rating) || 5,
    message: message.trim(),
    deviceInfo: deviceInfo || null,
  });

  const totalNew = await FeedbackModel.countDocuments({ status: 'new' });
  emitToAdmin(SOCKET_EVENT.ADMIN_FEEDBACK_NEW, { feedbackId: String(feedback._id), totalNew });

  return {
    id: String(feedback._id),
    category: feedback.category,
    rating: feedback.rating,
    status: feedback.status,
    createdAt: feedback.createdAt,
  };
}

export async function listFeedback({ limit = 50, page = 1, status, category, search } = {}) {
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 50));
  const safePage = Math.max(1, Number(page) || 1);
  const skip = (safePage - 1) * safeLimit;

  const query = {};
  if (status && status !== 'all') {
    query.status = status;
  }
  if (category && category !== 'all') {
    query.category = category;
  }
  if (search && search.trim()) {
    query.message = { $regex: search.trim(), $options: 'i' };
  }

  const [items, total] = await Promise.all([
    FeedbackModel.find(query)
      .populate('userId', 'nickname name email avatarUrl avatarEmoji avatarColor gender isOnline')
      .populate('resolvedBy', 'name nickname email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .lean()
      .exec(),
    FeedbackModel.countDocuments(query),
  ]);

  return {
    items: items.map((f) => ({
      id: String(f._id),
      category: f.category,
      rating: f.rating,
      message: f.message,
      adminNote: f.adminNote ?? '',
      status: f.status,
      deviceInfo: f.deviceInfo ?? null,
      user: f.userId
        ? {
            id: String(f.userId._id),
            name: f.userId.name,
            nickname: f.userId.nickname,
            email: f.userId.email,
            avatarUrl: f.userId.avatarUrl,
            avatarEmoji: f.userId.avatarEmoji,
            avatarColor: f.userId.avatarColor,
            gender: f.userId.gender,
            isOnline: Boolean(f.userId.isOnline),
          }
        : null,
      resolvedBy: f.resolvedBy
        ? {
            id: String(f.resolvedBy._id),
            name: f.resolvedBy.name,
            email: f.resolvedBy.email,
          }
        : null,
      resolvedAt: f.resolvedAt ?? null,
      createdAt: f.createdAt,
    })),
    total,
    page: safePage,
    limit: safeLimit,
  };
}

export async function listMyFeedback(userId) {
  const items = await FeedbackModel.find({ userId })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean()
    .exec();

  return items.map((f) => ({
    id: String(f._id),
    category: f.category,
    rating: f.rating,
    message: f.message,
    adminNote: f.adminNote ?? '',
    status: f.status,
    resolvedAt: f.resolvedAt ?? null,
    createdAt: f.createdAt,
  }));
}

export async function updateFeedbackStatus({ feedbackId, adminId, status, adminNote = '' }) {
  const allowedStatuses = ['new', 'reviewed', 'resolved', 'rejected'];
  if (!allowedStatuses.includes(status)) {
    throw new BadRequestError('Invalid feedback status', 'INVALID_STATUS');
  }

  const feedback = await FeedbackModel.findById(feedbackId).populate('userId');
  if (!feedback) {
    throw new NotFoundError('Feedback not found', 'FEEDBACK_NOT_FOUND');
  }

  feedback.status = status;
  feedback.adminNote = adminNote.trim();
  feedback.resolvedBy = adminId || null;
  feedback.resolvedAt = new Date();
  await feedback.save();

  const totalNew = await FeedbackModel.countDocuments({ status: 'new' });
  emitToAdmin(SOCKET_EVENT.ADMIN_FEEDBACK_UPDATED, {
    feedbackId: String(feedback._id),
    status,
    totalNew,
  });

  const user = feedback.userId;
  if (user && user._id) {
    const userIdStr = String(user._id);

    // 1. Realtime Socket Event
    emitToUser(userIdStr, 'feedback:status:updated', {
      feedbackId: String(feedback._id),
      category: feedback.category,
      status: feedback.status,
      adminNote: feedback.adminNote,
    });

    // 2. Push Notification
    const statusLabel = {
      reviewed: 'under review',
      resolved: 'resolved ✓',
      rejected: 'reviewed',
    }[status] ?? status;

    const pushTitle = `Feedback Update: ${status.toUpperCase()}`;
    const pushBody = adminNote.trim()
      ? `Your ${feedback.category} is now ${statusLabel}. Response: "${adminNote.trim()}"`
      : `Your ${feedback.category} has been marked as ${statusLabel}. Thank you!`;

    notificationService
      .sendToUser({
        userId: userIdStr,
        title: pushTitle,
        body: pushBody,
        data: { type: 'feedback_update', feedbackId: String(feedback._id) },
      })
      .catch((err) => logger.warn({ err }, 'Failed to send feedback push notification'));

    // 3. Email Notification (if user has an email)
    if (user.email) {
      const emailSubject = `Update on your feedback (#${String(feedback._id).slice(-6).toUpperCase()})`;
      const emailHtml = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b;">
          <h2 style="color: #6366f1; margin-bottom: 16px;">Feedback Status Update</h2>
          <p>Hi <strong>${user.nickname || user.name || 'there'}</strong>,</p>
          <p>The status of your feedback regarding <strong>"${feedback.category}"</strong> has been updated to:</p>
          <div style="display: inline-block; background-color: ${status === 'resolved' ? '#10b981' : status === 'reviewed' ? '#3b82f6' : '#f59e0b'}; color: #ffffff; padding: 6px 14px; border-radius: 9999px; font-weight: bold; margin: 8px 0 16px 0; text-transform: uppercase; font-size: 12px;">
            ${status}
          </div>
          
          <div style="background-color: #f8fafc; border-left: 4px solid #6366f1; padding: 14px; margin: 16px 0; border-radius: 4px;">
            <p style="margin: 0; font-size: 13px; color: #64748b;"><strong>Your message:</strong></p>
            <p style="margin: 6px 0 0 0; font-style: italic; color: #334155;">"${feedback.message}"</p>
          </div>

          ${
            adminNote.trim()
              ? `
          <div style="background-color: #f0fdf4; border-left: 4px solid #10b981; padding: 14px; margin: 16px 0; border-radius: 4px;">
            <p style="margin: 0; font-size: 13px; color: #166534;"><strong>Admin Response:</strong></p>
            <p style="margin: 6px 0 0 0; color: #15803d;">${adminNote.trim()}</p>
          </div>
          `
              : ''
          }

          <p style="margin-top: 24px; color: #64748b; font-size: 13px;">Thank you for helping us make Vibe Chat better!</p>
          <p style="color: #94a3b8; font-size: 11px; margin-top: 32px; border-top: 1px solid #e2e8f0; padding-top: 12px;">Vibe Chat Team</p>
        </div>
      `;

      emailService
        .sendRaw({
          to: user.email,
          subject: emailSubject,
          html: emailHtml,
          text: `Hi ${user.nickname || 'there'}, your feedback status is now ${status}. ${adminNote ? 'Response: ' + adminNote : ''}`,
        })
        .catch((err) => logger.warn({ err }, 'Failed to send feedback email update'));
    }
  }

  return {
    id: String(feedback._id),
    status: feedback.status,
    adminNote: feedback.adminNote,
    resolvedAt: feedback.resolvedAt,
  };
}

export const feedbackService = {
  submitFeedback,
  listFeedback,
  listMyFeedback,
  updateFeedbackStatus,
};
