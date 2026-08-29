import { Router } from 'express';

import {
  authenticate,
  paymentRateLimiter,
  requireAdmin,
  requireVerifiedAccount,
  validate,
} from '#src/common/middleware/index.js';
import { paymentController } from '#src/modules/payments/payment.controller.js';
import {
  createOrderSchema,
  listOrdersSchema,
  manualProofSchema,
  orderIdParamSchema,
  rejectOrderSchema,
  verifyPaymentSchema,
} from '#src/modules/payments/payment.schema.js';

const router = Router();

router.use(authenticate);

router.get('/options', paymentController.getOptions);
router.get('/orders', validate({ query: listOrdersSchema }), paymentController.listMyOrders);

router.use(requireVerifiedAccount, paymentRateLimiter);

router.post('/orders/razorpay', validate({ body: createOrderSchema }), paymentController.createRazorpayOrder);
router.post('/orders/razorpay/verify', validate({ body: verifyPaymentSchema }), paymentController.verifyPayment);
router.post('/orders/upi', validate({ body: createOrderSchema }), paymentController.createManualOrder);
router.post(
  '/orders/:orderId/proof',
  validate({ params: orderIdParamSchema, body: manualProofSchema }),
  paymentController.submitManualProof,
);

// ----- Admin review of manual transfers ----------------------------------

router.get('/admin/orders', requireAdmin, validate({ query: listOrdersSchema }), paymentController.listOrders);
router.post(
  '/admin/orders/:orderId/approve',
  requireAdmin,
  validate({ params: orderIdParamSchema }),
  paymentController.approveOrder,
);
router.post(
  '/admin/orders/:orderId/reject',
  requireAdmin,
  validate({ params: orderIdParamSchema, body: rejectOrderSchema }),
  paymentController.rejectOrder,
);

export const paymentRoutes = router;
