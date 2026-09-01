import { PaymentOrderModel } from '#src/modules/payments/payment.model.js';
import { PAYMENT_STATUS } from '#src/modules/payments/payment.constants.js';

class PaymentRepository {
  async create(data) {
    const order = await PaymentOrderModel.create(data);
    return order.toObject({ virtuals: true });
  }

  async findById(orderId) {
    return PaymentOrderModel.findById(orderId).lean({ virtuals: true }).exec();
  }

  async findByProviderOrderId(providerOrderId) {
    return PaymentOrderModel.findOne({ providerOrderId }).lean({ virtuals: true }).exec();
  }

  async updateById(orderId, update) {
    return PaymentOrderModel.findByIdAndUpdate(orderId, update, { new: true })
      .lean({ virtuals: true })
      .exec();
  }

  /**
   * Marks an order paid exactly once. The `creditedAt: null` guard is what makes
   * a replayed webhook and a client callback racing each other safe: only the
   * first one matches, so coins are credited a single time.
   */
  async markPaidOnce({ orderId, providerPaymentId, providerSignature }) {
    return PaymentOrderModel.findOneAndUpdate(
      { _id: orderId, creditedAt: null, status: { $ne: PAYMENT_STATUS.PAID } },
      {
        $set: {
          status: PAYMENT_STATUS.PAID,
          providerPaymentId: providerPaymentId ?? null,
          providerSignature: providerSignature ?? null,
          creditedAt: new Date(),
        },
      },
      { new: true },
    )
      .lean({ virtuals: true })
      .exec();
  }

  async listByUser({ userId, skip = 0, limit = 20 }) {
    const [items, total] = await Promise.all([
      PaymentOrderModel.find({ userId }).sort({ createdAt: -1 }).skip(skip).limit(limit).lean({ virtuals: true }).exec(),
      PaymentOrderModel.countDocuments({ userId }).exec(),
    ]);

    return { items, total };
  }

  async list({ filter = {}, skip = 0, limit = 20 }) {
    const [items, total] = await Promise.all([
      PaymentOrderModel.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('userId', 'nickname email gender')
        .lean({ virtuals: true })
        .exec(),
      PaymentOrderModel.countDocuments(filter).exec(),
    ]);

    return { items, total };
  }

  async expireStaleOrders(before) {
    return PaymentOrderModel.updateMany(
      { status: PAYMENT_STATUS.CREATED, createdAt: { $lt: before } },
      { $set: { status: PAYMENT_STATUS.EXPIRED } },
    ).exec();
  }

  async aggregateRevenue({ since } = {}) {
    const match = { status: PAYMENT_STATUS.PAID };
    if (since) match.creditedAt = { $gte: since };

    const [result] = await PaymentOrderModel.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          totalRevenueInPaise: { $sum: '$amountInPaise' },
          orderCount: { $sum: 1 },
          coinsSold: { $sum: { $add: ['$coins', '$bonusCoins'] } },
        },
      },
    ]).exec();

    return result ?? { totalRevenueInPaise: 0, orderCount: 0, coinsSold: 0 };
  }

  async countByStatus() {
    return PaymentOrderModel.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]).exec();
  }

  async deleteById(orderId) {
    return PaymentOrderModel.findByIdAndDelete(orderId).exec();
  }
}

export const paymentRepository = new PaymentRepository();
