import mongoose from 'mongoose';

import { ADMIN_ACTION } from '#src/modules/admin/admin.constants.js';

/**
 * Append-only record of privileged actions. Rows are never edited or removed:
 * "who gave this account 5000 coins" must stay answerable.
 */
const adminAuditSchema = new mongoose.Schema(
  {
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    action: { type: String, enum: Object.values(ADMIN_ACTION), required: true, index: true },
    targetType: { type: String, maxlength: 40, default: null },
    targetId: { type: String, maxlength: 64, default: null, index: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    ipAddress: { type: String, maxlength: 64, default: '' },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

adminAuditSchema.index({ createdAt: -1 });

export const AdminAuditModel = mongoose.model('AdminAudit', adminAuditSchema);
