import { ConflictError, ForbiddenError, NotFoundError } from '#src/common/errors/index.js';
import { USER_STATUS } from '#src/common/constants/index.js';
import { buildPaginationMeta, resolvePagination } from '#src/common/utils/pagination.util.js';
import { omitUndefined, flattenToDotPaths } from '#src/common/utils/object.util.js';
import { logger } from '#src/config/logger.js';
import { getStorageProvider } from '#src/integrations/storage/index.js';
import { emitToAll, emitToUser } from '#src/realtime/emitter.js';
import { SOCKET_EVENT } from '#src/realtime/events.js';
import { notificationService } from '#src/modules/notifications/notification.service.js';
import { settingsService } from '#src/modules/settings/settings.service.js';
import { userRepository } from '#src/modules/users/user.repository.js';
import { oppositeGenderOf } from '#src/modules/users/user.types.js';
import { UserModel } from '#src/modules/users/user.model.js';

function toPublicProfile(user, { showDistance = false, isFollowing = false, followersCount = 0, followingCount = 0 } = {}) {
  const distanceKm =
    showDistance && typeof user.distanceMeters === 'number'
      ? Math.round((user.distanceMeters / 1000) * 10) / 10
      : null;

  return {
    id: String(user._id),
    name: user.name,
    nickname: user.nickname,
    gender: user.gender,
    ageGroup: user.ageGroup ?? '18-21',
    zodiacSign: user.zodiacSign ?? null,
    avatarUrl: user.avatarUrl ?? null,
    avatarEmoji: user.avatarEmoji ?? null,
    avatarColor: user.avatarColor ?? null,
    bio: user.bio ?? '',
    interests: user.interests ?? [],
    isOnline: Boolean(user.isOnline),
    lastSeenAt: user.lastSeenAt ?? null,
    gamePoints: user.gamePoints ?? 0,
    city: user.location?.city ?? null,
    country: user.location?.country ?? null,
    distanceKm,
    followersCount: typeof user.followersCount === 'number' ? user.followersCount : followersCount,
    followingCount: Array.isArray(user.followingUserIds) ? user.followingUserIds.length : followingCount,
    isFollowing: Boolean(isFollowing),
  };
}

function toOwnProfile(user, { followersCount = 0 } = {}) {
  return {
    id: String(user._id),
    name: user.name,
    nickname: user.nickname,
    email: user.email,
    gender: user.gender,
    ageGroup: user.ageGroup ?? '18-21',
    zodiacSign: user.zodiacSign ?? null,
    role: user.role,
    status: user.status,
    avatarUrl: user.avatarUrl ?? null,
    avatarEmoji: user.avatarEmoji ?? null,
    avatarColor: user.avatarColor ?? null,
    /** True once a real photo replaces the generated emoji. */
    hasPhoto: Boolean(user.avatarUrl),
    bio: user.bio ?? '',
    interests: user.interests ?? [],
    preferences: user.preferences,
    gamePoints: user.gamePoints ?? 0,
    isOnline: Boolean(user.isOnline),
    lastSeenAt: user.lastSeenAt ?? null,
    location: {
      city: user.location?.city ?? null,
      country: user.location?.country ?? null,
      hasCoordinates: Array.isArray(user.location?.coordinates) && user.location.coordinates.length === 2,
      updatedAt: user.location?.updatedAt ?? null,
    },
    isEmailVerified: Boolean(user.emailVerifiedAt),
    blockedCount: user.blockedUserIds?.length ?? 0,
    followersCount: typeof user.followersCount === 'number' ? user.followersCount : followersCount,
    followingCount: Array.isArray(user.followingUserIds) ? user.followingUserIds.length : 0,
    createdAt: user.createdAt,
  };
}

/**
 * Blocking hides people in both directions: someone I blocked and anyone who
 * blocked me both disappear from my feed.
 */
async function buildExclusionList(user) {
  const blockedByOthers = await userRepository.findUserIdsBlocking(user.id);
  return [user.id, ...(user.blockedUserIds ?? []), ...blockedByOthers];
}

export async function getMyProfile(userId) {
  const user = await userRepository.findById(userId);
  if (!user) throw new NotFoundError('Account not found', 'USER_NOT_FOUND');
  const followersCount = await userRepository.countFollowers(userId);
  return toOwnProfile(user, { followersCount });
}

export async function updateMyProfile(userId, patch) {
  if (patch.nickname) {
    const taken = await userRepository.existsByNickname(patch.nickname, { excludeUserId: userId });
    if (taken) throw new ConflictError('That nickname is taken, try another', 'NICKNAME_TAKEN');
  }

  const update = flattenToDotPaths(omitUndefined(patch));
  const updated = await userRepository.updateById(userId, { $set: update });
  if (!updated) throw new NotFoundError('Account not found', 'USER_NOT_FOUND');
  const followersCount = await userRepository.countFollowers(userId);

  return toOwnProfile(updated, { followersCount });
}

/**
 * Replaces the profile photo. The previous object is deleted only after the new
 * one is safely stored, so a failed upload never leaves the user with no avatar.
 */
export async function updateAvatar({ userId, file }) {
  const storage = getStorageProvider();

  const uploaded = await storage.upload({
    buffer: file.buffer,
    mimeType: file.mimetype,
    folder: 'avatars',
    fileName: `user-${userId}`,
  });

  const previous = await UserModel.findById(userId).select('+avatarStorageKey').lean().exec();

  const updated = await userRepository.updateById(userId, {
    $set: { avatarUrl: uploaded.url, avatarStorageKey: uploaded.key },
  });

  if (previous?.avatarStorageKey && previous.avatarStorageKey !== uploaded.key) {
    storage
      .remove(previous.avatarStorageKey)
      .catch((error) => logger.warn({ err: error }, 'Failed to remove replaced avatar'));
  }

  return { avatarUrl: updated.avatarUrl };
}

export async function removeAvatar(userId) {
  const storage = getStorageProvider();
  const current = await UserModel.findById(userId).select('+avatarStorageKey').lean().exec();

  const updated = await userRepository.updateById(userId, {
    $set: { avatarUrl: null, avatarStorageKey: null },
  });

  if (current?.avatarStorageKey) {
    storage
      .remove(current.avatarStorageKey)
      .catch((error) => logger.warn({ err: error }, 'Failed to remove avatar'));
  }

  // Deleting a photo reveals the generated emoji again rather than leaving the
  // profile blank, so there is no state where a user has no avatar at all.
  return {
    avatarUrl: null,
    avatarEmoji: updated?.avatarEmoji ?? null,
    avatarColor: updated?.avatarColor ?? null,
  };
}

export async function updateLocation({ userId, latitude, longitude, city, country }) {
  // If client didn't send a city name, try to resolve it via Nominatim reverse geocode
  let resolvedCity = city ?? null;
  let resolvedCountry = country ?? null;

  if (!resolvedCity && latitude != null && longitude != null) {
    try {
      const geoRes = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&zoom=10&accept-language=en`,
        { headers: { 'User-Agent': 'VibeChat/1.0 (contact@vibechat.app)' }, signal: AbortSignal.timeout(5000) }
      );
      if (geoRes.ok) {
        const geoData = await geoRes.json();
        resolvedCity = geoData.address?.city || geoData.address?.town || geoData.address?.village ||
                       geoData.address?.suburb || geoData.address?.county || geoData.address?.state_district ||
                       geoData.name || null;
        resolvedCountry = geoData.address?.country ?? null;
      }
    } catch (err) {
      logger.warn({ err: err?.message, userId }, 'Reverse geocode failed, skipping city resolution');
    }
  }

  const updated = await userRepository.updateById(userId, {
    $set: {
      'location.type': 'Point',
      'location.coordinates': [longitude, latitude],
      ...(resolvedCity ? { 'location.city': resolvedCity } : {}),
      ...(resolvedCountry ? { 'location.country': resolvedCountry } : {}),
      'location.updatedAt': new Date(),
    },
  });

  if (!updated) throw new NotFoundError('Account not found', 'USER_NOT_FOUND');

  return {
    city: updated.location?.city ?? null,
    country: updated.location?.country ?? null,
    updatedAt: updated.location?.updatedAt ?? null,
  };
}

/**
 * The discovery feed. A boy sees girls, a girl sees boys — always active
 * accounts only, online ones first. Passing coordinates switches to a
 * distance-ordered feed backed by the 2dsphere index.
 */
export async function discoverUsers({ viewer, page, limit, onlineOnly, search, latitude, longitude, radiusKm }) {
  const settings = await settingsService.getSettings();
  const { skip, page: safePage, limit: safeLimit } = resolvePagination({ page, limit });

  const me = await userRepository.findById(viewer.id);
  if (!me) throw new NotFoundError('Account not found', 'USER_NOT_FOUND');

  const excludeUserIds = await buildExclusionList({ id: me._id, blockedUserIds: me.blockedUserIds });
  const targetGender = oppositeGenderOf(me.gender);

  const useLocation = latitude !== undefined && longitude !== undefined;

  if (useLocation) {
    const cappedRadius = Math.min(
      radiusKm ?? settings.discovery.defaultRadiusKm,
      settings.discovery.maxRadiusKm,
    );

    const { items, total } = await userRepository.findNearbyUsers({
      gender: targetGender,
      coordinates: [longitude, latitude],
      radiusKm: cappedRadius,
      excludeUserIds,
      onlineOnly,
      skip,
      limit: safeLimit,
    });

    return {
      items: items.map((item) => toPublicProfile(item, {
        showDistance: settings.discovery.showDistance,
        isFollowing: (me.followingUserIds ?? []).some((id) => String(id) === String(item._id)),
      })),
      meta: { ...buildPaginationMeta({ page: safePage, limit: safeLimit, total }), radiusKm: cappedRadius },
    };
  }

  const { items, total } = await userRepository.findDiscoverableUsers({
    gender: targetGender,
    excludeUserIds,
    onlineOnly,
    search,
    skip,
    limit: safeLimit,
  });

  return {
    items: items.map((item) => toPublicProfile(item, {
      isFollowing: (me.followingUserIds ?? []).some((id) => String(id) === String(item._id)),
    })),
    meta: buildPaginationMeta({ page: safePage, limit: safeLimit, total }),
  };
}

export async function getPublicProfile({ viewerId, targetUserId }) {
  const [viewer, target] = await Promise.all([
    userRepository.findById(viewerId),
    userRepository.findPublicProfileById(targetUserId),
  ]);

  if (!target) throw new NotFoundError('This profile is not available', 'USER_NOT_FOUND');

  const viewerBlockedTarget = (viewer?.blockedUserIds ?? []).some(
    (id) => String(id) === String(targetUserId),
  );
  if (viewerBlockedTarget) {
    throw new ForbiddenError('You have blocked this user', 'USER_BLOCKED');
  }

  const blockedByTarget = await UserModel.exists({ _id: targetUserId, blockedUserIds: viewerId });
  if (blockedByTarget) throw new NotFoundError('This profile is not available', 'USER_NOT_FOUND');

  const [followersCount, followingCount] = await Promise.all([
    userRepository.countFollowers(targetUserId),
    userRepository.countFollowing(targetUserId),
  ]);

  const isFollowing = (viewer?.followingUserIds ?? []).some((id) => String(id) === String(targetUserId));

  return toPublicProfile(target, { isFollowing, followersCount, followingCount });
}

export async function blockUser({ userId, targetUserId }) {
  if (String(userId) === String(targetUserId)) {
    throw new ConflictError('You cannot block yourself', 'CANNOT_BLOCK_SELF');
  }

  const target = await userRepository.findById(targetUserId);
  if (!target) throw new NotFoundError('This profile is not available', 'USER_NOT_FOUND');

  const updated = await userRepository.addBlockedUser(userId, targetUserId);
  // Auto unfollow when blocking
  await userRepository.removeFollowingUser(userId, targetUserId);
  return { blockedCount: updated.blockedUserIds.length };
}

export async function unblockUser({ userId, targetUserId }) {
  const updated = await userRepository.removeBlockedUser(userId, targetUserId);
  return { blockedCount: updated.blockedUserIds.length };
}

export async function listBlockedUsers(userId) {
  const user = await UserModel.findById(userId)
    .populate('blockedUserIds', 'nickname avatarUrl avatarEmoji avatarColor gender bio')
    .lean()
    .exec();

  return (user?.blockedUserIds ?? []).map((blocked) => ({
    id: String(blocked._id),
    nickname: blocked.nickname,
    avatarUrl: blocked.avatarUrl ?? null,
    avatarEmoji: blocked.avatarEmoji ?? null,
    avatarColor: blocked.avatarColor ?? null,
    gender: blocked.gender,
    bio: blocked.bio ?? '',
  }));
}

export async function listUsersBlockingMe(userId) {
  const list = await userRepository.findUsersBlockingUser(userId);
  return list.map((user) => ({
    id: String(user._id),
    nickname: user.nickname,
    avatarUrl: user.avatarUrl ?? null,
    avatarEmoji: user.avatarEmoji ?? null,
    avatarColor: user.avatarColor ?? null,
    gender: user.gender,
    bio: user.bio ?? '',
  }));
}

export async function followUser({ userId, targetUserId }) {
  if (String(userId) === String(targetUserId)) {
    throw new ConflictError('You cannot follow yourself', 'CANNOT_FOLLOW_SELF');
  }

  const target = await userRepository.findById(targetUserId);
  if (!target) throw new NotFoundError('This profile is not available', 'USER_NOT_FOUND');

  const isBlocked = await areUsersBlocked(userId, targetUserId);
  if (isBlocked) {
    throw new ForbiddenError('Cannot follow a blocked user', 'USER_BLOCKED');
  }

  await userRepository.addFollowingUser(userId, targetUserId);
  const [followersCount, followingCount, actor] = await Promise.all([
    userRepository.countFollowers(targetUserId),
    userRepository.countFollowing(userId),
    userRepository.findById(userId),
  ]);

  const followerName = actor?.nickname || actor?.name || 'A user';

  // Real-time notification to both target user and follower
  emitToUser(targetUserId, SOCKET_EVENT.FOLLOW_UPDATED, {
    actorId: String(userId),
    actorName: followerName,
    targetUserId: String(targetUserId),
    isFollowing: true,
    followersCount,
  });
  emitToUser(userId, SOCKET_EVENT.FOLLOW_UPDATED, {
    actorId: String(userId),
    targetUserId: String(targetUserId),
    isFollowing: true,
    followingCount,
  });

  // Push notification to target user
  notificationService
    .sendToUser({
      userId: targetUserId,
      title: 'New Follower! 🎉',
      body: `${followerName} started following you now.`,
      data: { type: 'new_follower', userId: String(userId) },
    })
    .catch((err) => logger.warn({ err }, 'Failed to send follow push notification'));

  return { isFollowing: true, followersCount, followingCount };
}

export async function unfollowUser({ userId, targetUserId }) {
  await userRepository.removeFollowingUser(userId, targetUserId);
  const [followersCount, followingCount] = await Promise.all([
    userRepository.countFollowers(targetUserId),
    userRepository.countFollowing(userId),
  ]);

  // Real-time notification to both target user and follower
  emitToUser(targetUserId, SOCKET_EVENT.FOLLOW_UPDATED, {
    actorId: String(userId),
    targetUserId: String(targetUserId),
    isFollowing: false,
    followersCount,
  });
  emitToUser(userId, SOCKET_EVENT.FOLLOW_UPDATED, {
    actorId: String(userId),
    targetUserId: String(targetUserId),
    isFollowing: false,
    followingCount,
  });

  return { isFollowing: false, followersCount, followingCount };
}

export async function deleteMyAccount(userId) {
  const updated = await userRepository.updateById(userId, {
    $set: {
      status: USER_STATUS.INACTIVE,
      isOnline: false,
      activeConnections: 0,
      tokensValidFrom: new Date(),
    },
  });
  if (!updated) throw new NotFoundError('Account not found', 'USER_NOT_FOUND');

  emitToAll(SOCKET_EVENT.PRESENCE_UPDATED, {
    userId: String(userId),
    isOnline: false,
    lastSeenAt: new Date(),
  });

  return { success: true };
}

export async function listFollowers(userId) {
  const followers = await userRepository.findFollowers(userId);
  return followers.map((user) => ({
    id: String(user._id),
    nickname: user.nickname,
    avatarUrl: user.avatarUrl ?? null,
    avatarEmoji: user.avatarEmoji ?? null,
    avatarColor: user.avatarColor ?? null,
    gender: user.gender,
    bio: user.bio ?? '',
    isOnline: Boolean(user.isOnline),
    lastSeenAt: user.lastSeenAt ?? null,
  }));
}

export async function listFollowing(userId) {
  const following = await userRepository.findFollowing(userId);
  return following.map((user) => ({
    id: String(user._id),
    nickname: user.nickname,
    avatarUrl: user.avatarUrl ?? null,
    avatarEmoji: user.avatarEmoji ?? null,
    avatarColor: user.avatarColor ?? null,
    gender: user.gender,
    bio: user.bio ?? '',
    isOnline: Boolean(user.isOnline),
    lastSeenAt: user.lastSeenAt ?? null,
  }));
}

export async function areUsersBlocked(userIdA, userIdB) {
  const blocked = await UserModel.exists({
    $or: [
      { _id: userIdA, blockedUserIds: userIdB },
      { _id: userIdB, blockedUserIds: userIdA },
    ],
  });

  return Boolean(blocked);
}

/**
 * Presence is reference counted so a second device does not flip the user
 * offline. Broadcasting the change is what drives the green dot everywhere.
 */
export async function setPresence({ userId, delta }) {
  const presence = await userRepository.incrementConnections(userId, delta);
  if (!presence) return null;

  const payload = {
    userId: String(userId),
    isOnline: presence.isOnline,
    lastSeenAt: presence.lastSeenAt,
  };

  emitToAll(SOCKET_EVENT.PRESENCE_UPDATED, payload);
  return payload;
}

/** Called at boot: sockets from a previous process are gone, so nobody is online. */
export async function resetAllPresence() {
  const result = await userRepository.markAllOffline();
  if (result.modifiedCount > 0) {
    logger.info({ count: result.modifiedCount }, 'Reset stale presence flags on boot');
  }
  return result.modifiedCount;
}

export async function getActiveUserCounts() {
  const [onlineMale, onlineFemale, totalActive] = await Promise.all([
    userRepository.countBy({ isOnline: true, gender: 'male', status: USER_STATUS.ACTIVE }),
    userRepository.countBy({ isOnline: true, gender: 'female', status: USER_STATUS.ACTIVE }),
    userRepository.countBy({ status: USER_STATUS.ACTIVE }),
  ]);

  return { onlineMale, onlineFemale, onlineTotal: onlineMale + onlineFemale, totalActive };
}

export const userService = {
  getMyProfile,
  updateMyProfile,
  updateAvatar,
  removeAvatar,
  updateLocation,
  discoverUsers,
  getPublicProfile,
  blockUser,
  unblockUser,
  listBlockedUsers,
  listUsersBlockingMe,
  followUser,
  unfollowUser,
  listFollowers,
  listFollowing,
  deleteMyAccount,
  areUsersBlocked,
  setPresence,
  resetAllPresence,
  getActiveUserCounts,
  toPublicProfile,
};
