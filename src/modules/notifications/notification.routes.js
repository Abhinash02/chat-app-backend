import { Router } from 'express';

import {
  authenticate,
  requireAdmin,
  requireVerifiedAccount,
  uploadMedia,
  validate,
} from '#src/common/middleware/index.js';
import { notificationController } from '#src/modules/notifications/notification.controller.js';
import {
  audienceSchema,
  campaignIdParamSchema,
  createCampaignSchema,
  listCampaignsSchema,
  queueCampaignSchema,
  registerDeviceSchema,
  setScheduleSchema,
  sendTestSchema,
  templateIdParamSchema,
  templateSchema,
  unregisterDeviceSchema,
  unsubscribeQuerySchema,
  updateTemplateSchema,
} from '#src/modules/notifications/notification.schema.js';

const router = Router();

/**
 * Opened from an email client, where there is no session and no app. The signed
 * token in the query string is the authorisation.
 */
router.get(
  '/unsubscribe',
  validate({ query: unsubscribeQuerySchema }),
  notificationController.unsubscribe,
);

router.use(authenticate);

// ----- App: device registration ------------------------------------------

router.post(
  '/devices',
  validate({ body: registerDeviceSchema }),
  notificationController.registerDevice,
);
router.delete(
  '/devices',
  validate({ body: unregisterDeviceSchema }),
  notificationController.unregisterDevice,
);
router.post(
  '/test',
  notificationController.sendTestPush,
);

// ----- App: In-App Notifications (User) ----------------------------------

router.get('/', notificationController.getUserNotifications);
router.get('/unread-count', notificationController.getUnreadCount);
router.patch('/:id/read', notificationController.markRead);
router.post('/read-all', notificationController.markAllRead);
router.delete('/:id', notificationController.deleteUserNotification);

// ----- Admin: Broadcast & campaigns --------------------------------------

router.use(requireAdmin);

router.post('/broadcast', uploadMedia.single('image'), notificationController.broadcastInApp);
router.get('/admin/list', notificationController.listInAppAdmin);
router.delete('/admin/:id', notificationController.deleteInAppAdmin);

router.get('/reach', notificationController.getReach);
router.post('/audience/preview', validate({ body: audienceSchema }), notificationController.previewAudience);

router.get('/campaigns', validate({ query: listCampaignsSchema }), notificationController.listCampaigns);
router.post('/campaigns', validate({ body: createCampaignSchema }), notificationController.createCampaign);
router.get(
  '/campaigns/:campaignId',
  validate({ params: campaignIdParamSchema }),
  notificationController.getCampaign,
);
router.patch(
  '/campaigns/:campaignId',
  validate({ params: campaignIdParamSchema }),
  notificationController.updateCampaign,
);
router.delete(
  '/campaigns/:campaignId',
  validate({ params: campaignIdParamSchema }),
  notificationController.deleteCampaign,
);
router.post(
  '/campaigns/:campaignId/send',
  validate({ params: campaignIdParamSchema, body: queueCampaignSchema }),
  notificationController.queueCampaign,
);
router.post(
  '/campaigns/:campaignId/schedule',
  validate({ params: campaignIdParamSchema, body: setScheduleSchema }),
  notificationController.setSchedule,
);
router.post(
  '/campaigns/:campaignId/cancel',
  validate({ params: campaignIdParamSchema }),
  notificationController.cancelCampaign,
);
router.post(
  '/campaigns/:campaignId/test',
  validate({ params: campaignIdParamSchema, body: sendTestSchema }),
  notificationController.sendTestEmail,
);

// ----- Admin: email templates --------------------------------------------

router.get('/templates', notificationController.listTemplates);
router.post('/templates', validate({ body: templateSchema }), notificationController.createTemplate);
router.patch(
  '/templates/:templateId',
  validate({ params: templateIdParamSchema, body: updateTemplateSchema }),
  notificationController.updateTemplate,
);
router.delete(
  '/templates/:templateId',
  validate({ params: templateIdParamSchema }),
  notificationController.deleteTemplate,
);

export const notificationRoutes = router;
