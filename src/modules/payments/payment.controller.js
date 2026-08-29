import { asyncHandler } from '#src/common/utils/async-handler.util.js';
import { sendCreated, sendSuccess } from '#src/common/utils/response.util.js';
import { paymentService } from '#src/modules/payments/payment.service.js';

export const paymentController = {
  getOptions: asyncHandler(async (_req, res) => {
    const options = await paymentService.getPaymentOptions();
    return sendSuccess(res, options);
  }),

  createRazorpayOrder: asyncHandler(async (req, res) => {
    const result = await paymentService.createRazorpayOrder({ user: req.user, ...req.body });
    return sendCreated(res, result);
  }),

  verifyPayment: asyncHandler(async (req, res) => {
    const result = await paymentService.verifyRazorpayPayment({ user: req.user, ...req.body });
    return sendSuccess(res, result);
  }),

  createManualOrder: asyncHandler(async (req, res) => {
    const result = await paymentService.createManualUpiOrder({ user: req.user, ...req.body });
    return sendCreated(res, result);
  }),

  submitManualProof: asyncHandler(async (req, res) => {
    const order = await paymentService.submitManualPaymentProof({
      user: req.user,
      orderId: req.params.orderId,
      ...req.body,
    });
    return sendSuccess(res, order);
  }),

  listMyOrders: asyncHandler(async (req, res) => {
    const { items, meta } = await paymentService.listMyOrders({ userId: req.user.id, ...req.query });
    return sendSuccess(res, items, { meta });
  }),

  /**
   * Razorpay calls this. It authenticates by HMAC over the raw body, so the
   * route is mounted with a raw body parser and no session middleware.
   */
  handleWebhook: asyncHandler(async (req, res) => {
    const result = await paymentService.handleRazorpayWebhook({
      rawBody: req.body,
      signature: req.headers['x-razorpay-signature'],
    });
    return sendSuccess(res, result);
  }),

  // ----- Admin -----------------------------------------------------------

  listOrders: asyncHandler(async (req, res) => {
    const { items, meta } = await paymentService.listOrdersForAdmin(req.query);
    return sendSuccess(res, items, { meta });
  }),

  approveOrder: asyncHandler(async (req, res) => {
    const result = await paymentService.approveManualPayment({
      orderId: req.params.orderId,
      adminId: req.user.id,
    });
    return sendSuccess(res, result);
  }),

  rejectOrder: asyncHandler(async (req, res) => {
    const order = await paymentService.rejectManualPayment({
      orderId: req.params.orderId,
      adminId: req.user.id,
      ...req.body,
    });
    return sendSuccess(res, order);
  }),
};
