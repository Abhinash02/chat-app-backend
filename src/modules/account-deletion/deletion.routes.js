import { Router } from 'express';

import { authenticate, requireAdmin, validate } from '#src/common/middleware/index.js';
import { deletionController } from '#src/modules/account-deletion/deletion.controller.js';
import {
  approveDeletionSchema,
  listDeletionRequestsSchema,
  rejectDeletionSchema,
  requestDeletionSchema,
} from '#src/modules/account-deletion/deletion.schema.js';

const router = Router();

router.use(authenticate);

// The account holder's own request.
router.get('/my', deletionController.getMyRequest);
router.post(
  '/request',
  validate({ body: requestDeletionSchema }),
  deletionController.requestDeletion,
);
router.post('/my/cancel', deletionController.cancelMyRequest);

// Review queue.
router.get(
  '/admin',
  requireAdmin,
  validate({ query: listDeletionRequestsSchema }),
  deletionController.listAdminRequests,
);
router.post(
  '/admin/:id/approve',
  requireAdmin,
  validate({ body: approveDeletionSchema }),
  deletionController.approveRequest,
);
router.post(
  '/admin/:id/reject',
  requireAdmin,
  validate({ body: rejectDeletionSchema }),
  deletionController.rejectRequest,
);

export const accountDeletionRoutes = router;
