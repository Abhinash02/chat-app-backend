import { DELETION_REQUEST_STATUS } from '#src/modules/account-deletion/deletion.constants.js';
import { DeletionRequestModel } from '#src/modules/account-deletion/deletion.model.js';

const USER_FIELDS = 'name nickname email gender avatarUrl avatarEmoji avatarColor status createdAt';

class DeletionRepository {
  async create(data) {
    const doc = await DeletionRequestModel.create(data);
    return doc.toObject();
  }

  async findById(id) {
    return DeletionRequestModel.findById(id)
      .populate('userId', USER_FIELDS)
      .populate('reviewedByAdminId', 'name nickname email')
      .lean()
      .exec();
  }

  async findPendingByUserId(userId) {
    return DeletionRequestModel.findOne({
      userId,
      status: DELETION_REQUEST_STATUS.PENDING,
    })
      .lean()
      .exec();
  }

  /** The most recent request of any status — what the app shows the user. */
  async findLatestByUserId(userId) {
    return DeletionRequestModel.findOne({ userId })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
  }

  async updateById(id, update) {
    return DeletionRequestModel.findByIdAndUpdate(id, update, {
      new: true,
      runValidators: true,
    })
      .populate('userId', USER_FIELDS)
      .populate('reviewedByAdminId', 'name nickname email')
      .lean()
      .exec();
  }

  async listAdmin({ status, page = 1, limit = 20 } = {}) {
    const skip = (page - 1) * limit;
    const filter = {};

    if (status && status !== 'all') filter.status = status;

    const [items, total] = await Promise.all([
      DeletionRequestModel.find(filter)
        .populate('userId', USER_FIELDS)
        .populate('reviewedByAdminId', 'name nickname email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      DeletionRequestModel.countDocuments(filter).exec(),
    ]);

    return { items, total };
  }

  async countPending() {
    return DeletionRequestModel.countDocuments({
      status: DELETION_REQUEST_STATUS.PENDING,
    }).exec();
  }
}

export const deletionRepository = new DeletionRepository();
