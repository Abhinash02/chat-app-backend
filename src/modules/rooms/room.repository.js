import { RoomModel } from '#src/modules/rooms/room.model.js';
import { RoomMessageModel } from '#src/modules/rooms/room-message.model.js';
import { ROOM_ROLE, ROOM_STATUS } from '#src/modules/rooms/room.constants.js';

class RoomRepository {
  async create(data) {
    const room = await RoomModel.create(data);
    return room.toObject();
  }

  async findById(roomId, { includePasscode = false } = {}) {
    const query = RoomModel.findById(roomId);
    if (includePasscode) query.select('+passcodeHash');
    return query.lean().exec();
  }

  async listLive({ skip = 0, limit = 20, search }) {
    const filter = { status: ROOM_STATUS.LIVE };
    if (search) {
      const escaped = String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.name = { $regex: escaped, $options: 'i' };
    }

    const [items, total] = await Promise.all([
      RoomModel.find(filter)
        .sort({ participantCount: -1, lastActivityAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('hostId', 'nickname avatarUrl avatarEmoji avatarColor gender')
        .populate('participants.userId', 'nickname avatarUrl avatarEmoji avatarColor gender')
        .lean()
        .exec(),
      RoomModel.countDocuments(filter).exec(),
    ]);

    return { items, total };
  }

  /**
   * Live rooms near a point, nearest first.
   *
   * `$geoNear` has to be the first pipeline stage, so the status filter rides
   * along in its `query` rather than as a later `$match`.
   */
  async findNearby({ coordinates, radiusKm, skip = 0, limit = 20 }) {
    const pipeline = [
      {
        $geoNear: {
          near: { type: 'Point', coordinates },
          distanceField: 'distanceMeters',
          maxDistance: radiusKm * 1000,
          spherical: true,
          key: 'location.coordinates',
          query: { status: ROOM_STATUS.LIVE },
        },
      },
      {
        $facet: {
          items: [
            { $sort: { distanceMeters: 1, participantCount: -1 } },
            { $skip: skip },
            { $limit: limit },
          ],
          total: [{ $count: 'value' }],
        },
      },
    ];

    const [result] = await RoomModel.aggregate(pipeline).exec();
    const items = result?.items ?? [];

    // `aggregate` skips Mongoose population, so the host and participants are
    // filled in afterwards rather than left as bare ids.
    const populated = await RoomModel.populate(items, [
      { path: 'hostId', select: 'nickname avatarUrl avatarEmoji avatarColor gender' },
      { path: 'participants.userId', select: 'nickname avatarUrl avatarEmoji avatarColor gender' },
    ]);

    return { items: populated, total: result?.total?.[0]?.value ?? 0 };
  }

  async findPopulatedById(roomId) {
    return RoomModel.findById(roomId)
      .populate('hostId', 'nickname avatarUrl avatarEmoji avatarColor gender')
      .populate('participants.userId', 'nickname avatarUrl avatarEmoji avatarColor gender isOnline')
      .lean()
      .exec();
  }

  /**
   * Adds a participant only when there is room and they are not already in.
   * The capacity check lives in the filter, so two simultaneous joins cannot
   * both take the last seat.
   */
  async addParticipant({ roomId, userId, role = ROOM_ROLE.LISTENER, capacity }) {
    return RoomModel.findOneAndUpdate(
      {
        _id: roomId,
        status: ROOM_STATUS.LIVE,
        'participants.userId': { $ne: userId },
        participantCount: { $lt: capacity },
      },
      {
        $push: { participants: { userId, role, joinedAt: new Date() } },
        $inc: { participantCount: 1 },
        $set: { lastActivityAt: new Date() },
      },
      { new: true },
    )
      .lean()
      .exec();
  }

  async removeParticipant({ roomId, userId }) {
    return RoomModel.findOneAndUpdate(
      { _id: roomId, 'participants.userId': userId },
      {
        $pull: { participants: { userId } },
        $inc: { participantCount: -1 },
        $set: { lastActivityAt: new Date() },
      },
      { new: true },
    )
      .lean()
      .exec();
  }

  async updateParticipantState({ roomId, userId, patch }) {
    const update = Object.fromEntries(
      Object.entries(patch).map(([key, value]) => [`participants.$.${key}`, value]),
    );

    return RoomModel.findOneAndUpdate(
      { _id: roomId, 'participants.userId': userId },
      { $set: update },
      { new: true },
    )
      .lean()
      .exec();
  }

  async close(roomId) {
    return RoomModel.findByIdAndUpdate(
      roomId,
      { $set: { status: ROOM_STATUS.CLOSED, closedAt: new Date(), participants: [], participantCount: 0 } },
      { new: true },
    )
      .lean()
      .exec();
  }

  async findRoomsContainingUser(userId) {
    return RoomModel.find({ status: ROOM_STATUS.LIVE, 'participants.userId': userId })
      .select('_id hostId')
      .lean()
      .exec();
  }

  async touch(roomId) {
    return RoomModel.updateOne({ _id: roomId }, { $set: { lastActivityAt: new Date() } }).exec();
  }

  async countLive() {
    return RoomModel.countDocuments({ status: ROOM_STATUS.LIVE }).exec();
  }

  /** Housekeeping for rooms whose host vanished without closing them. */
  async closeStaleRooms(inactiveBefore) {
    return RoomModel.updateMany(
      { status: ROOM_STATUS.LIVE, participantCount: 0, lastActivityAt: { $lt: inactiveBefore } },
      { $set: { status: ROOM_STATUS.CLOSED, closedAt: new Date() } },
    ).exec();
  }

  // ----- Room messages ----------------------------------------------------

  async createMessage(data) {
    const message = await RoomMessageModel.create(data);
    await RoomModel.updateOne(
      { _id: data.roomId },
      { $inc: { messageCount: 1 }, $set: { lastActivityAt: new Date() } },
    ).exec();
    return message;
  }

  async listMessages({ roomId, limit = 50, before }) {
    const filter = { roomId, isDeleted: false };
    if (before) filter.createdAt = { $lt: new Date(before) };

    const items = await RoomMessageModel.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit + 1)
      .populate('senderId', 'nickname avatarUrl avatarEmoji avatarColor gender')
      .lean()
      .exec();

    const hasMore = items.length > limit;
    const page = hasMore ? items.slice(0, limit) : items;

    return { items: page.reverse(), hasMore, nextCursor: hasMore ? page[0]?.createdAt : null };
  }
}

export const roomRepository = new RoomRepository();
