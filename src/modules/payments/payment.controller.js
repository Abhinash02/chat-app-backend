import { asyncHandler } from '#src/common/utils/async-handler.util.js';
import { sendCreated, sendSuccess } from '#src/common/utils/response.util.js';
import { paymentService } from '#src/modules/payments/payment.service.js';

export const paymentController = {
  getOptions: asyncHandler(async (_req, res) => {
    const options = await paymentService.getPaymentOptions();
    return sendSuccess(res, options);
  }),

  createCashfreeOrder: asyncHandler(async (req, res) => {
    const result = await paymentService.createCashfreeOrder({ user: req.user, ...req.body });
    return sendCreated(res, result);
  }),

  verifyCashfreePayment: asyncHandler(async (req, res) => {
    const result = await paymentService.verifyCashfreePayment({ user: req.user, ...req.body });
    return sendSuccess(res, result);
  }),

  handleCashfreeWebhook: asyncHandler(async (req, res) => {
    const result = await paymentService.handleCashfreeWebhook({
      rawBody: req.body,
      signature: req.headers['x-webhook-signature'],
      timestamp: req.headers['x-webhook-timestamp'],
    });
    return sendSuccess(res, result);
  }),

  handleCashfreeReturn: asyncHandler(async (req, res) => {
    const orderId = req.query.order_id || req.query.orderId;
    const result = await paymentService.handleCashfreeReturn({ orderId });

    const isPaid = result.status === 'paid' || result.status === 'already_paid';
    // Redirect to mobile app coins page with payment outcome
    const targetUrl = `http://localhost:8081/coins?payment=${isPaid ? 'success' : 'pending'}&order_id=${orderId || ''}`;
    return res.redirect(targetUrl);
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

  getOrderInvoice: asyncHandler(async (req, res) => {
    const isPdfRequested =
      req.query.format === 'pdf' ||
      req.query.download === '1' ||
      req.query.download === 'true' ||
      req.headers.accept?.includes('application/pdf');

    if (req.query.format === 'json') {
      const pdfData = await paymentService.generateAndSaveOrderInvoicePdf(req.params.orderId, req.user);
      return sendSuccess(res, { invoiceUrl: pdfData.invoiceUrl });
    }

    if (isPdfRequested) {
      const pdfData = await paymentService.generateAndSaveOrderInvoicePdf(req.params.orderId, req.user);
      if (pdfData.invoiceUrl && pdfData.invoiceUrl.startsWith('http')) {
        return res.redirect(pdfData.invoiceUrl);
      }
      if (pdfData.pdfBuffer) {
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="Invoice-${req.params.orderId}.pdf"`);
        return res.send(pdfData.pdfBuffer);
      }
    }

    const html = await paymentService.getOrderInvoiceHtml({
      user: req.user,
      orderId: req.params.orderId,
    });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
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

  refundOrder: asyncHandler(async (req, res) => {
    const order = await paymentService.refundOrder({
      orderId: req.params.orderId,
      adminId: req.user.id,
      ...req.body,
    });
    return sendSuccess(res, order);
  }),

  // ----- Redeem Codes & Vouchers -----------------------------------------

  redeemCode: asyncHandler(async (req, res) => {
    const result = await paymentService.redeemCode({
      code: req.body.code,
      user: req.user,
    });
    return sendSuccess(res, result);
  }),

  validateCoupon: asyncHandler(async (req, res) => {
    const result = await paymentService.validateCoupon({
      code: req.body.code,
      user: req.user,
      packagePriceInRupees: Number(req.body.priceInRupees) || 0,
    });
    return sendSuccess(res, result);
  }),

  createRedeemCode: asyncHandler(async (req, res) => {
    const result = await paymentService.createRedeemCode({
      ...req.body,
      adminId: req.user.id,
    });
    return sendCreated(res, result);
  }),

  listRedeemCodes: asyncHandler(async (req, res) => {
    const result = await paymentService.listRedeemCodesForAdmin(req.query);
    return sendSuccess(res, result.items, { meta: result.meta });
  }),

  deleteRedeemCode: asyncHandler(async (req, res) => {
    const result = await paymentService.deleteRedeemCode(req.params.id);
    return sendSuccess(res, result);
  }),

  deleteOrder: asyncHandler(async (req, res) => {
    const result = await paymentService.deleteOrder({ orderId: req.params.orderId });
    return sendSuccess(res, result);
  }),
};
