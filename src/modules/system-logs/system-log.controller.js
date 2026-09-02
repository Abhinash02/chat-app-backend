import { asyncHandler } from '#src/common/utils/async-handler.util.js';
import { sendSuccess } from '#src/common/utils/response.util.js';
import { systemLogService } from './system-log.service.js';

export const systemLogController = {
  listLogs: asyncHandler(async (req, res) => {
    const { items, meta } = await systemLogService.listLogs(req.query);
    return sendSuccess(res, items, { meta });
  }),

  getStats: asyncHandler(async (_req, res) => {
    const stats = await systemLogService.getLogStats();
    return sendSuccess(res, stats);
  }),

  clearLogs: asyncHandler(async (req, res) => {
    const result = await systemLogService.clearLogs(req.body);
    return sendSuccess(res, result);
  }),
};
