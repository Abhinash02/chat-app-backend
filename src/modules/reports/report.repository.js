import { ReportModel } from '#src/modules/reports/report.model.js';
import { REPORT_STATUS } from '#src/modules/reports/report.constants.js';

class ReportRepository {
  async create(data) {
    const report = await ReportModel.create(data);
    return report.toObject();
  }

  async findOpenBetween({ reporterId, reportedUserId }) {
    return ReportModel.findOne({ reporterId, reportedUserId, status: REPORT_STATUS.OPEN }).lean().exec();
  }

  async findById(reportId) {
    return ReportModel.findById(reportId)
      .populate('reporterId', 'nickname email gender')
      .populate('reportedUserId', 'nickname email gender status')
      .lean()
      .exec();
  }

  async list({ filter = {}, skip = 0, limit = 20 }) {
    const [items, total] = await Promise.all([
      ReportModel.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('reporterId', 'nickname gender')
        .populate('reportedUserId', 'nickname gender status')
        .lean()
        .exec(),
      ReportModel.countDocuments(filter).exec(),
    ]);

    return { items, total };
  }

  async updateStatus({ reportId, status, adminId, reviewNote }) {
    return ReportModel.findByIdAndUpdate(
      reportId,
      {
        $set: {
          status,
          reviewedByAdminId: adminId,
          reviewNote: reviewNote ?? '',
          reviewedAt: new Date(),
        },
      },
      { new: true },
    )
      .lean()
      .exec();
  }

  async countOpen() {
    return ReportModel.countDocuments({ status: REPORT_STATUS.OPEN }).exec();
  }

  /** How many distinct people have reported this account — the escalation signal. */
  async countDistinctReportersFor(reportedUserId) {
    const result = await ReportModel.distinct('reporterId', { reportedUserId }).exec();
    return result.length;
  }
}

export const reportRepository = new ReportRepository();
