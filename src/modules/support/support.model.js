import mongoose from 'mongoose';

const supportTicketSchema = new mongoose.Schema(
  {
    ticketId: {
      type: String,
      unique: true,
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    issueType: {
      type: String,
      enum: ['billing', 'account', 'technical', 'bug', 'other'],
      default: 'other',
    },
    subject: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    status: {
      type: String,
      enum: ['pending', 'open', 'in_progress', 'resolved', 'closed'],
      default: 'pending',
      index: true,
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium',
    },
    lastMessage: {
      type: String,
      default: '',
    },
    lastSenderType: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user',
    },
    unreadByAdmin: {
      type: Boolean,
      default: true,
    },
    unreadByUser: {
      type: Boolean,
      default: false,
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true },
);

supportTicketSchema.index({ userId: 1, createdAt: -1 });
supportTicketSchema.index({ status: 1, updatedAt: -1 });

const supportAttachmentSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    type: { type: String, default: 'image' },
  },
  { _id: false },
);

const supportMessageSchema = new mongoose.Schema(
  {
    ticketId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SupportTicket',
      required: true,
      index: true,
    },
    senderType: {
      type: String,
      enum: ['user', 'admin'],
      required: true,
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    message: {
      type: String,
      default: '',
      trim: true,
      maxlength: 3000,
    },
    attachments: [supportAttachmentSchema],
    isQuickReply: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

supportMessageSchema.index({ ticketId: 1, createdAt: 1 });

const cannedResponseSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    shortcut: {
      type: String,
      trim: true,
      maxlength: 30,
    },
    content: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },
    category: {
      type: String,
      enum: ['billing', 'account', 'technical', 'general'],
      default: 'general',
    },
  },
  { timestamps: true },
);

export const SupportTicketModel = mongoose.model('SupportTicket', supportTicketSchema);
export const SupportMessageModel = mongoose.model('SupportMessage', supportMessageSchema);
export const CannedResponseModel = mongoose.model('CannedResponse', cannedResponseSchema);
