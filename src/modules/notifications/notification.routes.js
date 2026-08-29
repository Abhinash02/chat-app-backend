import { Router } from 'express';

import {
  authenticate,
  requireAdmin,
  requireVerifiedAccount,
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
  requireVerifiedAccount,
  validate({ body: registerDeviceSchema }),
  notificationController.registerDevice,
);
router.delete(
  '/devices',
  validate({ body: unregisterDeviceSchema }),
  notificationController.unregisterDevice,
);

// ----- Admin: campaigns ---------------------------------------------------

router.use(requireAdmin);

router.get('/reach', notificationController.getReach);
router.post('/audience/preview', validate({ body: audienceSchema }), notificationController.previewAudience);

router.get('/campaigns', validate({ query: listCampaignsSchema }), notificationController.listCampaigns);
router.post('/campaigns', validate({ body: createCampaignSchema }), notificationController.createCampaign);
router.get(
  '/campaigns/:campaignId',
  validate({ params: campaignIdParamSchema }),
  notificationController.getCampaign,
);
router.post(
  '/campaigns/:campaignId/send',
  validate({ params: campaignIdParamSchema, body: queueCampaignSchema }),
  notificationController.queueCampaign,
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
