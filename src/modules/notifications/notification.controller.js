import { asyncHandler } from '#src/common/utils/async-handler.util.js';
import { sendCreated, sendSuccess } from '#src/common/utils/response.util.js';
import { getStorageProvider } from '#src/integrations/storage/index.js';
import { campaignService } from '#src/modules/notifications/campaign.service.js';
import { notificationService } from '#src/modules/notifications/notification.service.js';

export const notificationController = {
  // ----- Device registration (app) ---------------------------------------

  registerDevice: asyncHandler(async (req, res) => {
    const result = await notificationService.registerDevice({ userId: req.user.id, ...req.body });
    return sendCreated(res, result);
  }),

  unregisterDevice: asyncHandler(async (req, res) => {
    const result = await notificationService.unregisterDevice({
      userId: req.user.id,
      token: req.body.token,
    });
    return sendSuccess(res, result);
  }),

  sendTestPush: asyncHandler(async (req, res) => {
    const result = await notificationService.sendToUser({
      userId: req.user.id,
      title: req.body?.title || 'Test Notification 🚀',
      body: req.body?.body || 'Push notifications are working perfectly on Vibe!',
      data: req.body?.data || { type: 'test' },
    });
    return sendSuccess(res, result);
  }),

  /**
   * Public, unauthenticated, and reachable from an email client. Responds with
   * a small HTML page rather than JSON because a person is reading it.
   */
  unsubscribe: asyncHandler(async (req, res) => {
    await notificationService.unsubscribeByToken(req.query.token);

    res.status(200).type('html').send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Unsubscribed</title></head>
<body style="margin:0;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#fff7fa;">
  <div style="max-width:440px;margin:12vh auto;padding:32px;background:#fff;border-radius:18px;text-align:center;">
    <h1 style="font-size:20px;margin:0 0 10px;color:#1b1024;">You are unsubscribed</h1>
    <p style="font-size:14px;line-height:1.6;color:#5c4a63;margin:0;">
      You will not receive promotional emails from us again. You will still get
      important account emails, such as sign-in codes and payment receipts.
    </p>
  </div>
</body></html>`);
  }),

  // ----- Campaigns (admin) -----------------------------------------------

  previewAudience: asyncHandler(async (req, res) => {
    const preview = await campaignService.previewAudience(req.body);
    return sendSuccess(res, preview);
  }),

  createCampaign: asyncHandler(async (req, res) => {
    const campaign = await campaignService.createCampaign({ admin: req.user, ...req.body });
    return sendCreated(res, campaign);
  }),

  listCampaigns: asyncHandler(async (req, res) => {
    const { items, meta } = await campaignService.listCampaigns(req.query);
    return sendSuccess(res, items, { meta });
  }),

  getCampaign: asyncHandler(async (req, res) => {
    const campaign = await campaignService.getCampaign(req.params.campaignId);
    return sendSuccess(res, campaign);
  }),

  updateCampaign: asyncHandler(async (req, res) => {
    const campaign = await campaignService.updateCampaign({
      campaignId: req.params.campaignId,
      admin: req.user,
      ...req.body,
    });
    return sendSuccess(res, campaign);
  }),

  deleteCampaign: asyncHandler(async (req, res) => {
    const result = await campaignService.deleteCampaign(req.params.campaignId);
    return sendSuccess(res, result);
  }),

  queueCampaign: asyncHandler(async (req, res) => {
    const campaign = await campaignService.queueCampaign({
      campaignId: req.params.campaignId,
      scheduledAt: req.body.scheduledAt ?? null,
    });
    return sendSuccess(res, campaign);
  }),

  setSchedule: asyncHandler(async (req, res) => {
    const campaign = await campaignService.setSchedule({
      campaignId: req.params.campaignId,
      repeat: req.body.repeat,
    });
    return sendSuccess(res, campaign);
  }),

  cancelCampaign: asyncHandler(async (req, res) => {
    const campaign = await campaignService.cancelCampaign(req.params.campaignId);
    return sendSuccess(res, campaign);
  }),

  sendTestEmail: asyncHandler(async (req, res) => {
    const result = await campaignService.sendTestEmail({
      campaignId: req.params.campaignId,
      toEmail: req.body.toEmail,
      admin: req.user,
    });
    return sendSuccess(res, result);
  }),

  getReach: asyncHandler(async (_req, res) => {
    const reach = await notificationService.getDeliveryReach();
    return sendSuccess(res, reach);
  }),

  // ----- Email templates (admin) -----------------------------------------

  listTemplates: asyncHandler(async (_req, res) => {
    const templates = await campaignService.listTemplates();
    return sendSuccess(res, templates);
  }),

  createTemplate: asyncHandler(async (req, res) => {
    const template = await campaignService.createTemplate({ admin: req.user, ...req.body });
    return sendCreated(res, template);
  }),

  updateTemplate: asyncHandler(async (req, res) => {
    const template = await campaignService.updateTemplate(req.params.templateId, req.body);
    return sendSuccess(res, template);
  }),

  deleteTemplate: asyncHandler(async (req, res) => {
    const result = await campaignService.deleteTemplate(req.params.templateId);
    return sendSuccess(res, result);
  }),

  // ----- In-App Broadcast Notifications (Admin & User) -------------------

  broadcastInApp: asyncHandler(async (req, res) => {
    let imageUrl = req.body.imageUrl || null;

    if (req.file) {
      const storage = getStorageProvider();
      const uploaded = await storage.upload({
        buffer: req.file.buffer,
        mimeType: req.file.mimetype,
        folder: 'notifications',
        fileName: 'broadcast-image',
      });
      imageUrl = uploaded.url;
    }

    const sendPush = req.body.sendPush === 'true' || req.body.sendPush === true;

    const result = await notificationService.broadcastInAppNotification({
      adminId: req.user.id,
      title: req.body.title,
      body: req.body.body || req.body.message,
      imageUrl,
      actionUrl: req.body.actionUrl,
      targetAudience: req.body.targetAudience,
      sound: req.body.sound,
      sendPush,
    });
    return sendCreated(res, result);
  }),

  listInAppAdmin: asyncHandler(async (req, res) => {
    const skip = Number(req.query.skip) || 0;
    const limit = Number(req.query.limit) || 20;
    const result = await notificationService.listInAppNotificationsForAdmin({ skip, limit });
    return sendSuccess(res, result);
  }),

  deleteInAppAdmin: asyncHandler(async (req, res) => {
    const result = await notificationService.deleteInAppNotificationByAdmin(req.params.id);
    return sendSuccess(res, result);
  }),

  getUserNotifications: asyncHandler(async (req, res) => {
    const skip = Number(req.query.skip) || 0;
    const limit = Number(req.query.limit) || 20;
    const homeOnly = req.query.homeOnly === 'true';

    const result = await notificationService.getUserInAppNotifications({
      userId: req.user.id,
      gender: req.user.gender,
      skip,
      limit,
      homeOnly,
    });
    return sendSuccess(res, result);
  }),

  getUnreadCount: asyncHandler(async (req, res) => {
    const result = await notificationService.getUnreadInAppCount({
      userId: req.user.id,
      gender: req.user.gender,
    });
    return sendSuccess(res, result);
  }),

  markRead: asyncHandler(async (req, res) => {
    const result = await notificationService.markInAppNotificationAsRead({
      notificationId: req.params.id,
      userId: req.user.id,
      gender: req.user.gender,
    });
    return sendSuccess(res, result);
  }),

  markAllRead: asyncHandler(async (req, res) => {
    const result = await notificationService.markAllInAppNotificationsAsRead({
      userId: req.user.id,
      gender: req.user.gender,
    });
    return sendSuccess(res, result);
  }),

  deleteUserNotification: asyncHandler(async (req, res) => {
    const result = await notificationService.deleteUserInAppNotification({
      notificationId: req.params.id,
      userId: req.user.id,
      gender: req.user.gender,
    });
    return sendSuccess(res, result);
  }),
};
