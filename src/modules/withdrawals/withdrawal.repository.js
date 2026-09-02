import { WithdrawalModel } from '#src/modules/withdrawals/withdrawal.model.js';

class WithdrawalRepository {
  async create(data, { session } = {}) {
    const [doc] = await WithdrawalModel.create([data], { session });
    return doc.toObject();
  }

  async findById(id) {
    return WithdrawalModel.findById(id).populate('userId', 'name nickname email phone gender avatarUrl').lean().exec();
  }

  async findByUserId(userId, { page = 1, limit = 20 } = {}) {
    const skip = (page - 1) * limit;
    const filter = { userId };

    const [items, total] = await Promise.all([
      WithdrawalModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean().exec(),
      WithdrawalModel.countDocuments(filter),
    ]);

    return { items, total };
  }

  async listAdmin({ status, search, page = 1, limit = 20 } = {}) {
    const skip = (page - 1) * limit;
    const filter = {};

    if (status && status !== 'all') {
      filter.status = status;
    }

    const query = WithdrawalModel.find(filter)
      .populate('userId', 'name nickname email phone gender avatarUrl')
      .populate('processedByAdminId', 'name nickname email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const [items, total] = await Promise.all([
      query.lean().exec(),
      WithdrawalModel.countDocuments(filter),
    ]);

    return { items, total };
  }

  async updateById(id, patch) {
    return WithdrawalModel.findByIdAndUpdate(id, patch, { new: true }).lean().exec();
  }

  async aggregateStats() {
    const stats = await WithdrawalModel.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalRupees: { $sum: '$amountInRupees' },
          totalCoins: { $sum: '$coins' },
        },
      },
    ]).exec();

    const result = {
      pending: { count: 0, totalRupees: 0, totalCoins: 0 },
      approved: { count: 0, totalRupees: 0, totalCoins: 0 },
      success: { count: 0, totalRupees: 0, totalCoins: 0 },
      processing: { count: 0, totalRupees: 0, totalCoins: 0 },
      rejected: { count: 0, totalRupees: 0, totalCoins: 0 },
      failed: { count: 0, totalRupees: 0, totalCoins: 0 },
      totalPaidRupees: 0,
      totalCoinsRedeemed: 0,
    };

    for (const row of stats) {
      if (result[row._id]) {
        result[row._id] = {
          count: row.count,
          totalRupees: row.totalRupees,
          totalCoins: row.totalCoins,
        };
      }
      if (row._id === 'approved' || row._id === 'success') {
        result.totalPaidRupees += row.totalRupees;
        result.totalCoinsRedeemed += row.totalCoins;
      }
    }

    return result;
  }
}

export const withdrawalRepository = new WithdrawalRepository();
