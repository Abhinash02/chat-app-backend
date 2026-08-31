import { Router } from 'express';
import { authenticate } from '#src/common/middleware/authenticate.middleware.js';
import { requireAdmin } from '#src/common/middleware/authorize.middleware.js';
import * as eventController from './event.controller.js';

export const eventRouter = Router();

// Public / Mobile app route (for authenticated users)
eventRouter.get('/', authenticate, eventController.listPublicEvents);

// Admin-only management routes
eventRouter.get('/admin', authenticate, requireAdmin, eventController.listAdminEvents);
eventRouter.post('/admin', authenticate, requireAdmin, eventController.createEvent);
eventRouter.patch('/admin/:id', authenticate, requireAdmin, eventController.updateEvent);
eventRouter.delete('/admin/:id', authenticate, requireAdmin, eventController.deleteEvent);
eventRouter.post('/admin/:id/broadcast', authenticate, requireAdmin, eventController.broadcastEvent);
