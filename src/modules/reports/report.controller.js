import { asyncHandler } from '#src/common/utils/async-handler.util.js';
import { sendCreated, sendSuccess } from '#src/common/utils/response.util.js';
import { reportService } from '#src/modules/reports/report.service.js';

export const reportController = {
  createReport: asyncHandler(async (req, res) => {
    const result = await reportService.createReport({ user: req.user, ...req.body });
    return sendCreated(res, result);
  }),

  listReports: asyncHandler(async (req, res) => {
    const { items, meta } = await reportService.listReports(req.query);
    return sendSuccess(res, items, { meta });
  }),

  getReport: asyncHandler(async (req, res) => {
    const report = await reportService.getReport(req.params.reportId);
    return sendSuccess(res, report);
  }),

  reviewReport: asyncHandler(async (req, res) => {
    const report = await reportService.reviewReport({
      reportId: req.params.reportId,
      adminId: req.user.id,
      ...req.body,
    });
    return sendSuccess(res, report);
  }),
};
