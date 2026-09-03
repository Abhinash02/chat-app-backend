import { z } from 'zod';

import { objectIdSchema, paginationSchema } from '#src/common/validators/common.schema.js';
import { PAYMENT_STATUS } from '#src/modules/payments/payment.constants.js';

export const createOrderSchema = z.object({ packageId: objectIdSchema }).strict();

export const verifyPaymentSchema = z
  .object({
    orderId: objectIdSchema,
    razorpayPaymentId: z.string().trim().min(5).max(64).optional(),
    razorpaySignature: z.string().trim().min(16).max(256).optional(),
    status: z.string().optional(),
    reason: z.string().optional(),
  })
  .strict();

export const manualProofSchema = z
  .object({
    // A UPI UTR is 12 digits; some banks pad it, so the range is deliberately loose.
    utr: z
      .string()
      .trim()
      .min(8, 'Enter the UTR from your bank app')
      .max(30)
      .regex(/^[A-Za-z0-9]+$/, 'The UTR contains letters and numbers only'),
    note: z.string().trim().max(200).optional(),
  })
  .strict();

export const orderIdParamSchema = z.object({ orderId: objectIdSchema });

export const rejectOrderSchema = z.object({ reason: z.string().trim().min(3).max(200) }).strict();

export const refundOrderSchema = z
  .object({
    reason: z.string().trim().min(3, 'Provide a reason for the refund').max(200).optional(),
  })
  .strict();

export const listOrdersSchema = paginationSchema.extend({
  status: z.nativeEnum(PAYMENT_STATUS).optional(),
});
