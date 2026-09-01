import { Router } from 'express';
import { authenticate, requireAdmin, uploadImage } from '#src/common/middleware/index.js';
import { supportController } from './support.controller.js';

const router = Router();

router.use(authenticate);

// Support image upload
router.post('/upload', uploadImage.any(), supportController.uploadAttachment);

// User endpoints
router.post('/tickets', supportController.createTicket);
router.get('/my-tickets', supportController.getMyTickets);
router.get('/tickets/:ticketId', supportController.getTicketDetails);
router.post('/tickets/:ticketId/messages', supportController.addMessage);

// Canned Responses (Available to read by auth users, managed by Admin)
router.get('/canned-responses', supportController.getCannedResponses);
router.post('/canned-responses', requireAdmin, supportController.createCannedResponse);
router.patch('/canned-responses/:id', requireAdmin, supportController.updateCannedResponse);
router.delete('/canned-responses/:id', requireAdmin, supportController.deleteCannedResponse);

// Admin ticket management
router.get('/admin/tickets', requireAdmin, supportController.getAdminTickets);
router.patch('/admin/tickets/:ticketId/status', requireAdmin, supportController.updateStatus);
router.delete('/admin/tickets/:ticketId', requireAdmin, supportController.deleteTicket);

export const supportRoutes = router;
