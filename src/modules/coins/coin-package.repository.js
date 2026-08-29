import { CoinPackageModel } from '#src/modules/coins/coin-package.model.js';

class CoinPackageRepository {
  async listActive() {
    return CoinPackageModel.find({ isActive: true }).sort({ sortOrder: 1, priceInPaise: 1 }).lean().exec();
  }

  async listAll() {
    return CoinPackageModel.find().sort({ sortOrder: 1, priceInPaise: 1 }).lean().exec();
  }

  async findById(id) {
    return CoinPackageModel.findById(id).lean().exec();
  }

  async findActiveById(id) {
    return CoinPackageModel.findOne({ _id: id, isActive: true }).lean().exec();
  }

  async create(data) {
    const created = await CoinPackageModel.create(data);
    return created.toObject({ virtuals: true });
  }

  async updateById(id, update) {
    return CoinPackageModel.findByIdAndUpdate(id, update, { new: true, runValidators: true }).lean().exec();
  }

  async deleteById(id) {
    return CoinPackageModel.findByIdAndDelete(id).lean().exec();
  }

  async count() {
    return CoinPackageModel.countDocuments().exec();
  }

  async insertMany(packages) {
    return CoinPackageModel.insertMany(packages);
  }
}

export const coinPackageRepository = new CoinPackageRepository();
