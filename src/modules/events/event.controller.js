import { eventService } from './event.service.js';
import { asyncHandler } from '#src/common/utils/async-handler.util.js';

export const listPublicEvents = asyncHandler(async (req, res) => {
  const events = await eventService.listPublicEvents({ userGender: req.user?.gender });
  res.json({ status: 'success', data: events });
});

export const listAdminEvents = asyncHandler(async (req, res) => {
  const { page, limit, search } = req.query;
  const result = await eventService.listAdminEvents({ page, limit, search });
  res.json({ status: 'success', data: result.items, meta: result.meta });
});

export const createEvent = asyncHandler(async (req, res) => {
  const event = await eventService.createEvent({
    ...req.body,
    adminId: req.user.id,
  });
  res.status(201).json({ status: 'success', data: event });
});

export const updateEvent = asyncHandler(async (req, res) => {
  const event = await eventService.updateEvent(req.params.id, req.body);
  res.json({ status: 'success', data: event });
});

export const deleteEvent = asyncHandler(async (req, res) => {
  const result = await eventService.deleteEvent(req.params.id);
  res.json({ status: 'success', data: result });
});

export const broadcastEvent = asyncHandler(async (req, res) => {
  const event = await eventService.updateEvent(req.params.id, {});
  const stats = await eventService.broadcastEvent({
    event,
    sendPush: req.body.sendPush !== false,
    sendEmail: req.body.sendEmail !== false,
  });
  res.json({ status: 'success', data: stats });
});
