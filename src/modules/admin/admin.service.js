import { ForbiddenError, NotFoundError } from '#src/common/errors/index.js';
import { GENDER, USER_ROLE, USER_STATUS } from '#src/common/constants/index.js';
import { ONE_DAY_MS } from '#src/common/utils/date.util.js';
import { buildPaginationMeta, resolvePagination } from '#src/common/utils/pagination.util.js';
import { logger } from '#src/config/logger.js';
import { emitToUser } from '#src/realtime/emitter.js';
import { SOCKET_EVENT } from '#src/realtime/events.js';
import { authService } from '#src/modules/auth/auth.service.js';
import { authRepository } from '#src/modules/auth/auth.repository.js';
import { chatRepository } from '#src/modules/chat/chat.repository.js';
import { coinsService } from '#src/modules/coins/coins.service.js';
import { coinTransactionRepository } from '#src/modules/coins/coin-transaction.repository.js';
import { walletRepository } from '#src/modules/coins/wallet.repository.js';
import { gameRepository } from '#src/modules/games/game.repository.js';
import { paymentRepository } from '#src/modules/payments/payment.repository.js';
import { PAYMENT_STATUS } from '#src/modules/payments/payment.constants.js';
import { roomRepository } from '#src/modules/rooms/room.repository.js';
import { userRepository } from '#src/modules/users/user.repository.js';
import { adminRepository } from '#src/modules/admin/admin.repository.js';
import { ADMIN_ACTION } from '#src/modules/admin/admin.constants.js';

const ADMIN_ROLES = [USER_ROLE.ADMIN, USER_ROLE.SUPER_ADMIN];

/**
 * Admin sign-in reuses the ordinary credential flow and then refuses non-admin
 * accounts. Doing the role check after authentication means a wrong password
 * and a non-admin account are indistinguishable to an attacker probing the
 * panel — neither reveals whether the address belongs to an administrator.
 */
export async function adminLogin({ email, password, userAgent, ipAddress }) {
  const result = await authService.login({ email, password, userAgent, ipAddress });

  if (!ADMIN_ROLES.includes(result.user.role)) {
    await authService.logout({ refreshToken: result.tokens.refreshToken });
    throw new ForbiddenError('This account cannot access the admin panel', 'NOT_AN_ADMIN');
  }

  logger.info({ adminId: result.user.id }, 'Admin signed in');
  return result;
}

let cachedDashboardData = null;
let cachedDashboardExpiry = 0;

export async function getDashboard() {
  const now = Date.now();
  if (cachedDashboardData && now < cachedDashboardExpiry) {
    return cachedDashboardData;
  }

  const since24h = new Date(Date.now() - ONE_DAY_MS);
  const since30d = new Date(Date.now() - 30 * ONE_DAY_MS);

  const [
    totalUsers,
    maleUsers,
    femaleUsers,
    onlineUsers,
    pendingVerification,
    suspendedUsers,
    newUsers24h,
    conversations,
    messages24h,
    walletTotals,
    revenueAllTime,
    revenue30d,
    paymentsByStatus,
    liveRooms,
    gameStats,
  ] = await Promise.all([
    userRepository.countBy({ status: { $ne: USER_STATUS.DELETED } }),
    userRepository.countBy({ gender: GENDER.MALE, status: USER_STATUS.ACTIVE }),
    userRepository.countBy({ gender: GENDER.FEMALE, status: USER_STATUS.ACTIVE }),
    userRepository.countBy({ isOnline: true }),
    userRepository.countBy({ status: USER_STATUS.PENDING_VERIFICATION }),
    userRepository.countBy({ status: USER_STATUS.SUSPENDED }),
    userRepository.countBy({ createdAt: { $gte: since24h } }),
    chatRepository.countConversations(),
    chatRepository.countMessagesSince(since24h),
    walletRepository.aggregateTotals(),
    paymentRepository.aggregateRevenue(),
    paymentRepository.aggregateRevenue({ since: since30d }),
    paymentRepository.countByStatus(),
    roomRepository.countLive(),
    gameRepository.aggregatePlayStats({ since: since30d }),
  ]);

  const awaitingVerification =
    paymentsByStatus.find((row) => row._id === PAYMENT_STATUS.AWAITING_VERIFICATION)?.count ?? 0;

  const result = {
    users: {
      total: totalUsers,
      male: maleUsers,
      female: femaleUsers,
      online: onlineUsers,
      pendingVerification,
      suspended: suspendedUsers,
      newLast24h: newUsers24h,
    },
    chat: { conversations, messagesLast24h: messages24h },
    coins: walletTotals,
    revenue: {
      allTimeInRupees: revenueAllTime.totalRevenueInPaise / 100,
      last30DaysInRupees: revenue30d.totalRevenueInPaise / 100,
      paidOrders: revenueAllTime.orderCount,
      coinsSold: revenueAllTime.coinsSold,
      awaitingVerification,
    },
    rooms: { live: liveRooms },
    games: gameStats.map((row) => ({
      gameKey: row._id,
      plays: row.plays,
      totalPoints: row.totalPoints,
      averageScore: Math.round(row.averageScore ?? 0),
    })),
  };

  cachedDashboardData = result;
  cachedDashboardExpiry = now + 10_000;

  return result;
}

export async function listUsers({ gender, status, search, role, page, limit }) {
  const { skip, page: safePage, limit: safeLimit } = resolvePagination({ page, limit });

  const filter = {};
  if (gender) filter.gender = gender;
  if (status) filter.status = status;
  if (role) filter.role = role;

  if (search) {
    const escaped = String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { nickname: { $regex: escaped, $options: 'i' } },
      { name: { $regex: escaped, $options: 'i' } },
      { email: { $regex: escaped, $options: 'i' } },
    ];
  }

  const { items, total } = await userRepository.listForAdmin({ filter, skip, limit: safeLimit });

  // One wallet lookup per page, not per row.
  const wallets = await Promise.all(items.map((user) => walletRepository.findByUserId(user._id)));

  return {
    items: items.map((user, index) => ({
      id: String(user._id),
      name: user.name,
      nickname: user.nickname,
      email: user.email,
      gender: user.gender,
      role: user.role,
      status: user.status,
      avatarUrl: user.avatarUrl ?? null,
      isOnline: user.isOnline,
      lastSeenAt: user.lastSeenAt,
      gamePoints: user.gamePoints ?? 0,
      coinBalance: wallets[index]?.coinBalance ?? 0,
      isEmailVerified: Boolean(user.emailVerifiedAt),
      createdAt: user.createdAt,
    })),
    meta: buildPaginationMeta({ page: safePage, limit: safeLimit, total }),
  };
}

export async function getUserDetail(userId) {
  const user = await userRepository.findById(userId);
  if (!user) throw new NotFoundError('Account not found', 'USER_NOT_FOUND');

  const [wallet, transactions, orders, sessions, unread] = await Promise.all([
    walletRepository.findOrCreate(user._id, {}),
    coinTransactionRepository.listByUser({ userId: user._id, limit: 20 }),
    paymentRepository.listByUser({ userId: user._id, limit: 10 }),
    authRepository.listActiveSessions(user._id),
    chatRepository.countTotalUnread(user._id),
  ]);

  const walletSnapshot = await coinsService.getWalletSnapshot({
    userId: user._id,
    gender: user.gender,
  });

  return {
    user: {
      id: String(user._id),
      name: user.name,
      nickname: user.nickname,
      email: user.email,
      gender: user.gender,
      role: user.role,
      status: user.status,
      avatarUrl: user.avatarUrl ?? null,
      bio: user.bio,
      interests: user.interests,
      isOnline: user.isOnline,
      lastSeenAt: user.lastSeenAt,
      lastLoginAt: user.lastLoginAt,
      gamePoints: user.gamePoints ?? 0,
      city: user.location?.city ?? null,
      country: user.location?.country ?? null,
      isEmailVerified: Boolean(user.emailVerifiedAt),
      suspendedReason: user.suspendedReason,
      blockedCount: user.blockedUserIds?.length ?? 0,
      createdAt: user.createdAt,
    },
    wallet: { ...walletSnapshot, raw: wallet },
    transactions: transactions.items,
    orders: orders.items,
    activeSessions: sessions,
    unreadMessages: unread,
  };
}

/**
 * Suspending takes effect immediately: sessions are revoked, tokens minted
 * before now are rejected, and any connected device is told to sign out.
 */
export async function suspendUser({ adminId, userId, reason, ipAddress }) {
  const user = await userRepository.findById(userId);
  if (!user) throw new NotFoundError('Account not found', 'USER_NOT_FOUND');

  if (ADMIN_ROLES.includes(user.role)) {
    throw new ForbiddenError('Administrator accounts cannot be suspended here', 'CANNOT_SUSPEND_ADMIN');
  }

  await userRepository.updateById(userId, {
    $set: {
      status: USER_STATUS.SUSPENDED,
      suspendedReason: reason,
      tokensValidFrom: new Date(),
      isOnline: false,
      activeConnections: 0,
    },
  });

  await authRepository.revokeAllSessionsForUser(userId);
  emitToUser(userId, SOCKET_EVENT.ACCOUNT_SUSPENDED, { reason });

  await adminRepository.recordAction({
    adminId,
    action: ADMIN_ACTION.USER_SUSPENDED,
    targetType: 'user',
    targetId: userId,
    metadata: { reason },
    ipAddress,
  });

  return { suspended: true };
}

export async function reactivateUser({ adminId, userId, ipAddress }) {
  const user = await userRepository.findById(userId);
  if (!user) throw new NotFoundError('Account not found', 'USER_NOT_FOUND');

  // A never-verified account goes back to pending, not straight to active.
  const status = user.emailVerifiedAt ? USER_STATUS.ACTIVE : USER_STATUS.PENDING_VERIFICATION;

  await userRepository.updateById(userId, { $set: { status, suspendedReason: null } });

  await adminRepository.recordAction({
    adminId,
    action: ADMIN_ACTION.USER_REACTIVATED,
    targetType: 'user',
    targetId: userId,
    ipAddress,
  });

  return { reactivated: true, status };
}

/**
 * Soft delete. The row stays so message history, ledger entries and paid orders
 * keep referring to something real; the account can no longer be used.
 */
export async function deleteUser({ adminId, userId, ipAddress }) {
  const user = await userRepository.findById(userId);
  if (!user) throw new NotFoundError('Account not found', 'USER_NOT_FOUND');

  if (ADMIN_ROLES.includes(user.role)) {
    throw new ForbiddenError('Administrator accounts cannot be deleted here', 'CANNOT_DELETE_ADMIN');
  }

  await userRepository.updateById(userId, {
    $set: {
      status: USER_STATUS.DELETED,
      tokensValidFrom: new Date(),
      isOnline: false,
      activeConnections: 0,
    },
  });

  await authRepository.revokeAllSessionsForUser(userId);
  emitToUser(userId, SOCKET_EVENT.FORCE_LOGOUT, { reason: 'ACCOUNT_DELETED' });

  await adminRepository.recordAction({
    adminId,
    action: ADMIN_ACTION.USER_DELETED,
    targetType: 'user',
    targetId: userId,
    ipAddress,
  });

  return { deleted: true };
}

export async function forceLogout({ adminId, userId, ipAddress }) {
  await authService.logoutAllDevices({ userId });
  emitToUser(userId, SOCKET_EVENT.FORCE_LOGOUT, { reason: 'ADMIN_ACTION' });

  await adminRepository.recordAction({
    adminId,
    action: ADMIN_ACTION.USER_FORCE_LOGGED_OUT,
    targetType: 'user',
    targetId: userId,
    ipAddress,
  });

  return { loggedOut: true };
}

export async function adjustUserCoins({ adminId, userId, amount, reason, ipAddress }) {
  const user = await userRepository.findById(userId);
  if (!user) throw new NotFoundError('Account not found', 'USER_NOT_FOUND');

  const snapshot = await coinsService.adjustBalance({
    userId,
    gender: user.gender,
    amount,
    reason,
    adminId,
  });

  await adminRepository.recordAction({
    adminId,
    action: ADMIN_ACTION.COINS_ADJUSTED,
    targetType: 'user',
    targetId: userId,
    metadata: { amount, reason, balanceAfter: snapshot.coinBalance },
    ipAddress,
  });

  return snapshot;
}

export async function resetUserFreeTalk({ adminId, userId, ipAddress }) {
  const user = await userRepository.findById(userId);
  if (!user) throw new NotFoundError('Account not found', 'USER_NOT_FOUND');

  const snapshot = await coinsService.resetFreeTalk({ userId, gender: user.gender });

  await adminRepository.recordAction({
    adminId,
    action: ADMIN_ACTION.FREE_TALK_RESET,
    targetType: 'user',
    targetId: userId,
    ipAddress,
  });

  return snapshot;
}

export async function listCoinTransactions({ userId, type, page, limit }) {
  const { skip, page: safePage, limit: safeLimit } = resolvePagination({ page, limit });

  const filter = {};
  if (userId) filter.userId = userId;
  if (type) filter.type = type;

  const { items, total } = await coinTransactionRepository.list({ filter, skip, limit: safeLimit });

  return { items, meta: buildPaginationMeta({ page: safePage, limit: safeLimit, total }) };
}

export async function listAuditLog({ adminId, action, page, limit }) {
  const { skip, page: safePage, limit: safeLimit } = resolvePagination({ page, limit });

  const filter = {};
  if (adminId) filter.adminId = adminId;
  if (action) filter.action = action;

  const { items, total } = await adminRepository.listActions({ filter, skip, limit: safeLimit });

  return { items, meta: buildPaginationMeta({ page: safePage, limit: safeLimit, total }) };
}

export const adminService = {
  adminLogin,
  getDashboard,
  listUsers,
  getUserDetail,
  suspendUser,
  reactivateUser,
  deleteUser,
  forceLogout,
  adjustUserCoins,
  resetUserFreeTalk,
  listCoinTransactions,
  listAuditLog,
  recordAction: adminRepository.recordAction.bind(adminRepository),
};
