import { SystemLogModel } from './system-log.model.js';
import { LOG_CATEGORY, LOG_LEVEL } from './system-log.constants.js';
import { buildPaginationMeta, resolvePagination } from '#src/common/utils/pagination.util.js';
import { logger } from '#src/config/logger.js';
import { emitToAdmin } from '#src/realtime/emitter.js';
import { SOCKET_EVENT } from '#src/realtime/events.js';

export async function createLog({
  level = LOG_LEVEL.INFO,
  category = LOG_CATEGORY.SYSTEM,
  action,
  message,
  details = {},
  stack = null,
  userId = null,
  userEmail = null,
  ip = null,
  path = null,
  method = null,
  statusCode = null,
}) {
  try {
    const doc = await SystemLogModel.create({
      level,
      category,
      action: action || 'log',
      message: message || 'System activity',
      details,
      stack,
      userId,
      userEmail,
      ip,
      path,
      method,
      statusCode,
    });

    const dto = doc.toJSON();

    if (level === LOG_LEVEL.ERROR || level === LOG_LEVEL.WARN) {
      emitToAdmin(SOCKET_EVENT.ADMIN_LOG_ENTRY || 'admin:log_entry', dto);
    }

    return dto;
  } catch (err) {
    logger.warn({ err: err?.message }, 'Failed to record system log');
    return null;
  }
}

export function logError(params) {
  return createLog({ ...params, level: LOG_LEVEL.ERROR });
}

export function logWarn(params) {
  return createLog({ ...params, level: LOG_LEVEL.WARN });
}

export function logInfo(params) {
  return createLog({ ...params, level: LOG_LEVEL.INFO });
}

export async function listLogs(query = {}) {
  const { page, limit, skip } = resolvePagination(query);

  const filter = {};

  if (query.category && query.category !== 'all') {
    filter.category = query.category;
  }

  if (query.level && query.level !== 'all') {
    filter.level = query.level;
  }

  if (query.action) {
    filter.action = query.action;
  }

  if (query.search) {
    const regex = new RegExp(query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [
      { message: regex },
      { action: regex },
      { path: regex },
      { userEmail: regex },
      { stack: regex },
    ];
  }

  if (query.startDate || query.endDate) {
    filter.createdAt = {};
    if (query.startDate) filter.createdAt.$gte = new Date(query.startDate);
    if (query.endDate) filter.createdAt.$lte = new Date(query.endDate);
  }

  const [items, total] = await Promise.all([
    SystemLogModel.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean()
      .exec(),
    SystemLogModel.countDocuments(filter).exec(),
  ]);

  return {
    items: items.map((doc) => {
      doc.id = String(doc._id);
      return doc;
    }),
    meta: buildPaginationMeta({ page, limit, total }),
  };
}

export async function getLogStats() {
  const past24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [totalErrors24h, totalWarnings24h, categoryCounts, recentErrors] = await Promise.all([
    SystemLogModel.countDocuments({ level: LOG_LEVEL.ERROR, createdAt: { $gte: past24h } }),
    SystemLogModel.countDocuments({ level: LOG_LEVEL.WARN, createdAt: { $gte: past24h } }),
    SystemLogModel.aggregate([
      { $group: { _id: '$category', count: { $sum: 1 }, errorCount: { $sum: { $cond: [{ $eq: ['$level', 'error'] }, 1, 0] } } } },
    ]),
    SystemLogModel.find({ level: LOG_LEVEL.ERROR }).sort({ createdAt: -1 }).limit(5).lean(),
  ]);

  return {
    totalErrors24h,
    totalWarnings24h,
    byCategory: categoryCounts.reduce((acc, curr) => {
      acc[curr._id] = { total: curr.count, errors: curr.errorCount };
      return acc;
    }, {}),
    recentErrors: recentErrors.map((e) => {
      e.id = String(e._id);
      return e;
    }),
  };
}

export async function clearLogs({ category, level, olderThanDays = 0 } = {}) {
  const filter = {};
  if (category && category !== 'all') filter.category = category;
  if (level && level !== 'all') filter.level = level;
  if (olderThanDays > 0) {
    filter.createdAt = { $lte: new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000) };
  }

  const res = await SystemLogModel.deleteMany(filter).exec();
  return { deletedCount: res.deletedCount };
}

export const systemLogService = {
  createLog,
  logError,
  logWarn,
  logInfo,
  listLogs,
  getLogStats,
  clearLogs,
};
