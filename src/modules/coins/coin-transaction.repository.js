import { CoinTransactionModel } from '#src/modules/coins/coin-transaction.model.js';

class CoinTransactionRepository {
  async create(data, { session } = {}) {
    const [transaction] = await CoinTransactionModel.create([data], { session });
    return transaction;
  }

  async listByUser({ userId, skip = 0, limit = 20, type }) {
    const filter = { userId };
    if (type) filter.type = type;

    const [items, total] = await Promise.all([
      CoinTransactionModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean().exec(),
      CoinTransactionModel.countDocuments(filter).exec(),
    ]);

    return { items, total };
  }

  async list({ filter = {}, skip = 0, limit = 20 }) {
    const [items, total] = await Promise.all([
      CoinTransactionModel.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('userId', 'nickname email gender')
        .lean()
        .exec(),
      CoinTransactionModel.countDocuments(filter).exec(),
    ]);

    return { items, total };
  }

  async existsByReference(referenceId, type) {
    return Boolean(await CoinTransactionModel.exists({ referenceId, type }));
  }

  async sumByType({ since } = {}) {
    const match = since ? { createdAt: { $gte: since } } : {};
    return CoinTransactionModel.aggregate([
      { $match: match },
      { $group: { _id: '$type', totalAmount: { $sum: '$amount' }, count: { $sum: 1 } } },
      { $sort: { totalAmount: -1 } },
    ]).exec();
  }
}

export const coinTransactionRepository = new CoinTransactionRepository();
