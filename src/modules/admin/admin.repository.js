import { AdminAuditModel } from '#src/modules/admin/admin-audit.model.js';

class AdminRepository {
  async recordAction({ adminId, action, targetType, targetId, metadata, ipAddress }) {
    return AdminAuditModel.create({
      adminId,
      action,
      targetType: targetType ?? null,
      targetId: targetId ? String(targetId) : null,
      metadata: metadata ?? {},
      ipAddress: ipAddress ?? '',
    });
  }

  async listActions({ filter = {}, skip = 0, limit = 20 }) {
    const [items, total] = await Promise.all([
      AdminAuditModel.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('adminId', 'name nickname email')
        .lean()
        .exec(),
      AdminAuditModel.countDocuments(filter).exec(),
    ]);

    return { items, total };
  }
}

export const adminRepository = new AdminRepository();
