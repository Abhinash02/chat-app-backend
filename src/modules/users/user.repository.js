import mongoose from 'mongoose';

import { USER_STATUS } from '#src/common/constants/index.js';
import { UserModel } from '#src/modules/users/user.model.js';

const PUBLIC_FIELDS =
  'name nickname gender avatarUrl avatarEmoji avatarColor bio interests isOnline lastSeenAt gamePoints location.city location.country createdAt';

class UserRepository {
  async create(data, { session } = {}) {
    const [user] = await UserModel.create([data], { session });
    return user;
  }

  async findById(id, { includePassword = false } = {}) {
    const query = UserModel.findById(id);
    if (includePassword) query.select('+passwordHash');
    return query.exec();
  }

  async findByEmail(email, { includePassword = false } = {}) {
    const query = UserModel.findOne({ email: String(email).toLowerCase() });
    if (includePassword) query.select('+passwordHash');
    return query.exec();
  }

  async findByNickname(nickname) {
    return UserModel.findOne({ nickname }).collation({ locale: 'en', strength: 2 }).exec();
  }

  async existsByEmail(email) {
    return Boolean(await UserModel.exists({ email: String(email).toLowerCase() }));
  }

  async existsByNickname(nickname, { excludeUserId } = {}) {
    const filter = { nickname };
    if (excludeUserId) filter._id = { $ne: excludeUserId };
    const found = await UserModel.findOne(filter)
      .collation({ locale: 'en', strength: 2 })
      .select('_id')
      .exec();
    return Boolean(found);
  }

  async updateById(id, update, { session } = {}) {
    return UserModel.findByIdAndUpdate(id, update, { new: true, runValidators: true, session }).exec();
  }

  async findPublicProfileById(id) {
    return UserModel.findOne({ _id: id, status: USER_STATUS.ACTIVE }).select(PUBLIC_FIELDS).exec();
  }

  /**
   * Discovery feed: active accounts of the requested gender, online first.
   * `excludeUserIds` carries the viewer plus both directions of blocking.
   */
  async findDiscoverableUsers({
    gender,
    excludeUserIds = [],
    onlineOnly = false,
    search,
    skip = 0,
    limit = 20,
  }) {
    const filter = {
      gender,
      status: USER_STATUS.ACTIVE,
      _id: { $nin: excludeUserIds },
    };

    if (onlineOnly) filter.isOnline = true;
    if (search) {
      const escaped = String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.nickname = { $regex: escaped, $options: 'i' };
    }

    const [items, total] = await Promise.all([
      UserModel.find(filter)
        .select(PUBLIC_FIELDS)
        .sort({ isOnline: -1, lastSeenAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      UserModel.countDocuments(filter).exec(),
    ]);

    return { items, total };
  }

  /**
   * Same feed ordered by real distance. `$geoNear` must be the first pipeline
   * stage and returns `distanceMeters` for the UI.
   */
  async findNearbyUsers({
    gender,
    coordinates,
    radiusKm,
    excludeUserIds = [],
    onlineOnly = false,
    skip = 0,
    limit = 20,
  }) {
    const match = {
      gender,
      status: USER_STATUS.ACTIVE,
      _id: { $nin: excludeUserIds.map((id) => new mongoose.Types.ObjectId(String(id))) },
      'preferences.shareLocation': true,
    };
    if (onlineOnly) match.isOnline = true;

    const pipeline = [
      {
        $geoNear: {
          near: { type: 'Point', coordinates },
          distanceField: 'distanceMeters',
          maxDistance: radiusKm * 1000,
          spherical: true,
          key: 'location.coordinates',
          query: match,
        },
      },
      {
        $facet: {
          items: [
            { $sort: { isOnline: -1, distanceMeters: 1 } },
            { $skip: skip },
            { $limit: limit },
            {
              $project: {
                name: 1,
                nickname: 1,
                gender: 1,
                avatarUrl: 1,
                avatarEmoji: 1,
                avatarColor: 1,
                bio: 1,
                interests: 1,
                isOnline: 1,
                lastSeenAt: 1,
                gamePoints: 1,
                'location.city': 1,
                'location.country': 1,
                distanceMeters: 1,
                createdAt: 1,
              },
            },
          ],
          total: [{ $count: 'value' }],
        },
      },
    ];

    const [result] = await UserModel.aggregate(pipeline).exec();
    return { items: result?.items ?? [], total: result?.total?.[0]?.value ?? 0 };
  }

  async listForAdmin({ filter = {}, sort = { createdAt: -1 }, skip = 0, limit = 20 }) {
    const [items, total] = await Promise.all([
      UserModel.find(filter).sort(sort).skip(skip).limit(limit).lean().exec(),
      UserModel.countDocuments(filter).exec(),
    ]);
    return { items, total };
  }

  async countBy(filter) {
    return UserModel.countDocuments(filter).exec();
  }

  /**
   * Presence is reference-counted: only the last disconnecting socket flips the
   * user offline, so a second device does not hide them from discovery.
   */
  async incrementConnections(userId, delta) {
    const user = await UserModel.findByIdAndUpdate(
      userId,
      { $inc: { activeConnections: delta } },
      { new: true },
    )
      .select('activeConnections')
      .exec();

    if (!user) return null;

    const connections = Math.max(0, user.activeConnections);
    return UserModel.findByIdAndUpdate(
      userId,
      {
        $set: {
          activeConnections: connections,
          isOnline: connections > 0,
          lastSeenAt: new Date(),
        },
      },
      { new: true },
    )
      .select('isOnline lastSeenAt activeConnections')
      .exec();
  }

  async markAllOffline() {
    return UserModel.updateMany(
      { isOnline: true },
      { $set: { isOnline: false, activeConnections: 0 } },
    ).exec();
  }

  async addBlockedUser(userId, blockedUserId) {
    return UserModel.findByIdAndUpdate(
      userId,
      { $addToSet: { blockedUserIds: blockedUserId } },
      { new: true },
    )
      .select('blockedUserIds')
      .exec();
  }

  async removeBlockedUser(userId, blockedUserId) {
    return UserModel.findByIdAndUpdate(
      userId,
      { $pull: { blockedUserIds: blockedUserId } },
      { new: true },
    )
      .select('blockedUserIds')
      .exec();
  }

  /** Ids of everyone who has blocked this user — they must not see them either. */
  async findUserIdsBlocking(userId) {
    const rows = await UserModel.find({ blockedUserIds: userId }).select('_id').lean().exec();
    return rows.map((row) => row._id);
  }

  /** Detailed list of users who blocked this user. */
  async findUsersBlockingUser(userId) {
    return UserModel.find({ blockedUserIds: userId })
      .select('nickname avatarUrl avatarEmoji avatarColor gender bio')
      .lean()
      .exec();
  }

  async addFollowingUser(userId, targetUserId) {
    return UserModel.findByIdAndUpdate(
      userId,
      { $addToSet: { followingUserIds: targetUserId } },
      { new: true },
    )
      .select('followingUserIds')
      .exec();
  }

  async removeFollowingUser(userId, targetUserId) {
    return UserModel.findByIdAndUpdate(
      userId,
      { $pull: { followingUserIds: targetUserId } },
      { new: true },
    )
      .select('followingUserIds')
      .exec();
  }

  async countFollowers(userId) {
    return UserModel.countDocuments({ followingUserIds: userId }).exec();
  }

  async countFollowing(userId) {
    const user = await UserModel.findById(userId).select('followingUserIds').lean().exec();
    return user?.followingUserIds?.length ?? 0;
  }

  async findFollowers(userId) {
    return UserModel.find({ followingUserIds: userId })
      .select('nickname avatarUrl avatarEmoji avatarColor gender bio isOnline lastSeenAt')
      .lean()
      .exec();
  }

  async findFollowing(userId) {
    const user = await UserModel.findById(userId)
      .populate('followingUserIds', 'nickname avatarUrl avatarEmoji avatarColor gender bio isOnline lastSeenAt')
      .lean()
      .exec();
    return user?.followingUserIds ?? [];
  }

  async incrementGamePoints(userId, points, { session } = {}) {
    return UserModel.findByIdAndUpdate(
      userId,
      { $inc: { gamePoints: points } },
      { new: true, session },
    )
      .select('gamePoints')
      .exec();
  }

  async deductGamePoints(userId, points, { session } = {}) {
    return UserModel.findOneAndUpdate(
      { _id: userId, gamePoints: { $gte: points } },
      { $inc: { gamePoints: -points } },
      { new: true, session },
    )
      .select('gamePoints')
      .exec();
  }

  async findTopByGamePoints(limit) {
    return UserModel.find({ status: USER_STATUS.ACTIVE, gamePoints: { $gt: 0 } })
      .select('nickname avatarUrl avatarEmoji avatarColor gender gamePoints')
      .sort({ gamePoints: -1, updatedAt: 1 })
      .limit(limit)
      .lean()
      .exec();
  }

  async countUsersWithMorePoints(points) {
    return UserModel.countDocuments({
      status: USER_STATUS.ACTIVE,
      gamePoints: { $gt: points },
    }).exec();
  }
}

export const userRepository = new UserRepository();
export { PUBLIC_FIELDS };
