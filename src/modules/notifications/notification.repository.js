import mongoose from 'mongoose';

import { CampaignModel } from '#src/modules/notifications/campaign.model.js';
import { DeviceTokenModel } from '#src/modules/notifications/device-token.model.js';
import { EmailTemplateModel } from '#src/modules/notifications/email-template.model.js';
import { CAMPAIGN_STATUS } from '#src/modules/notifications/notification.constants.js';

class NotificationRepository {
  // ----- Device tokens ----------------------------------------------------

  /**
   * Upserts on the token itself. The same token can migrate between accounts
   * when two people share a device, so ownership is always overwritten.
   */
  async registerDeviceToken({ userId, token, platform, deviceId, deviceName, appVersion }) {
    return DeviceTokenModel.findOneAndUpdate(
      { token },
      {
        $set: {
          userId,
          platform,
          deviceId: deviceId ?? null,
          deviceName: deviceName ?? '',
          appVersion: appVersion ?? '',
          isActive: true,
          deactivatedAt: null,
          deactivationReason: null,
          consecutiveFailures: 0,
          lastUsedAt: new Date(),
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    )
      .lean()
      .exec();
  }

  async removeDeviceToken({ userId, token }) {
    return DeviceTokenModel.deleteOne({ userId, token }).exec();
  }

  async findActiveTokensForUsers(userIds) {
    return DeviceTokenModel.find({ userId: { $in: userIds }, isActive: true })
      .select('userId token platform')
      .lean()
      .exec();
  }

  async deactivateTokens(tokens, reason) {
    if (tokens.length === 0) return { modifiedCount: 0 };

    return DeviceTokenModel.updateMany(
      { token: { $in: tokens } },
      { $set: { isActive: false, deactivatedAt: new Date(), deactivationReason: reason } },
    ).exec();
  }

  async countActiveTokens() {
    return DeviceTokenModel.countDocuments({ isActive: true }).exec();
  }

  // ----- Campaigns --------------------------------------------------------

  async createCampaign(data) {
    const campaign = await CampaignModel.create(data);
    return campaign.toObject();
  }

  async findCampaignById(campaignId) {
    return CampaignModel.findById(campaignId).lean().exec();
  }

  async listCampaigns({ filter = {}, skip = 0, limit = 20 }) {
    const [items, total] = await Promise.all([
      CampaignModel.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('createdByAdminId', 'name email')
        .lean()
        .exec(),
      CampaignModel.countDocuments(filter).exec(),
    ]);

    return { items, total };
  }

  async updateCampaign(campaignId, update) {
    return CampaignModel.findByIdAndUpdate(campaignId, update, { new: true }).lean().exec();
  }

  async deleteCampaign(campaignId) {
    return CampaignModel.findByIdAndDelete(campaignId).lean().exec();
  }

  /**
   * Moves a campaign into `sending` only if it is still queued, so two worker
   * ticks (or two server instances) cannot both start the same send.
   */
  async claimCampaignForSending(campaignId) {
    return CampaignModel.findOneAndUpdate(
      { _id: campaignId, status: CAMPAIGN_STATUS.QUEUED },
      { $set: { status: CAMPAIGN_STATUS.SENDING, startedAt: new Date(), failureReason: null } },
      { new: true },
    )
      .lean()
      .exec();
  }

  async findNextQueuedCampaign() {
    return CampaignModel.findOne({
      status: CAMPAIGN_STATUS.QUEUED,
      $or: [{ scheduledAt: null }, { scheduledAt: { $lte: new Date() } }],
    })
      .sort({ createdAt: 1 })
      .lean()
      .exec();
  }

  async incrementCampaignStats(campaignId, increments, cursorUserId) {
    const update = { $inc: {} };
    for (const [key, value] of Object.entries(increments)) {
      if (value) update.$inc[`stats.${key}`] = value;
    }

    if (cursorUserId) update.$set = { cursorUserId };
    if (Object.keys(update.$inc).length === 0) delete update.$inc;

    return CampaignModel.findByIdAndUpdate(campaignId, update, { new: true }).lean().exec();
  }

  /** Recurring campaigns whose next slot has arrived. */
  async findDueRecurring(now = new Date()) {
    return CampaignModel.find({
      'repeat.isEnabled': true,
      'repeat.nextRunAt': { $ne: null, $lte: now },
      // A run still in flight must not be started again on top of itself.
      status: { $nin: [CAMPAIGN_STATUS.QUEUED, CAMPAIGN_STATUS.SENDING] },
    })
      .limit(10)
      .lean()
      .exec();
  }

  /**
   * Starts another run of a recurring campaign.
   *
   * Conditional on the campaign not already being queued or sending, so two
   * instances sweeping at the same second cannot both start the same run — the
   * loser's filter simply does not match.
   */
  async requeueRecurring({ campaignId, targeted, nextRunAt, now }) {
    return CampaignModel.findOneAndUpdate(
      { _id: campaignId, status: { $nin: [CAMPAIGN_STATUS.QUEUED, CAMPAIGN_STATUS.SENDING] } },
      {
        $set: {
          status: CAMPAIGN_STATUS.QUEUED,
          scheduledAt: null,
          cursorUserId: null,
          startedAt: null,
          completedAt: null,
          failureReason: null,
          'repeat.lastRunAt': now,
          'repeat.nextRunAt': nextRunAt,
          // Counters describe the run in progress; `repeat.runCount` is the
          // number that accumulates across runs.
          'stats.targeted': targeted,
          'stats.pushSent': 0,
          'stats.pushFailed': 0,
          'stats.emailSent': 0,
          'stats.emailFailed': 0,
          'stats.optedOut': 0,
          'stats.tokensRetired': 0,
        },
        $inc: { 'repeat.runCount': 1 },
      },
      { new: true },
    )
      .lean()
      .exec();
  }

  /** Rescues campaigns left mid-send by a crash or a deploy. */
  async requeueStuckCampaigns(stuckBefore) {
    return CampaignModel.updateMany(
      { status: CAMPAIGN_STATUS.SENDING, startedAt: { $lt: stuckBefore } },
      { $set: { status: CAMPAIGN_STATUS.QUEUED } },
    ).exec();
  }

  // ----- Templates --------------------------------------------------------

  async createTemplate(data) {
    const template = await EmailTemplateModel.create(data);
    return template.toObject();
  }

  async listTemplates() {
    return EmailTemplateModel.find().sort({ isSystem: -1, name: 1 }).lean().exec();
  }

  async findTemplateById(templateId) {
    return EmailTemplateModel.findById(templateId).lean().exec();
  }

  async findTemplateBySlug(slug) {
    return EmailTemplateModel.findOne({ slug }).lean().exec();
  }

  async updateTemplate(templateId, update) {
    return EmailTemplateModel.findByIdAndUpdate(templateId, update, { new: true, runValidators: true })
      .lean()
      .exec();
  }

  async deleteTemplate(templateId) {
    return EmailTemplateModel.findOneAndDelete({ _id: templateId, isSystem: false }).lean().exec();
  }

  async upsertSystemTemplate(template) {
    return EmailTemplateModel.findOneAndUpdate(
      { slug: template.slug },
      { $setOnInsert: { ...template, isSystem: true } },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    )
      .lean()
      .exec();
  }

  async countTemplates() {
    return EmailTemplateModel.countDocuments().exec();
  }

  /**
   * Streams recipients in id order. Ordering by `_id` gives a stable cursor
   * that new signups cannot shuffle mid-send.
   */
  async findAudienceBatch({ filter, afterUserId, limit }) {
    const query = { ...filter };
    if (afterUserId) query._id = { $gt: new mongoose.Types.ObjectId(String(afterUserId)) };

    return mongoose
      .model('User')
      .find(query)
      .select('_id name nickname email gender preferences')
      .sort({ _id: 1 })
      .limit(limit)
      .lean()
      .exec();
  }

  async countAudience(filter) {
    return mongoose.model('User').countDocuments(filter).exec();
  }
}

export const notificationRepository = new NotificationRepository();
