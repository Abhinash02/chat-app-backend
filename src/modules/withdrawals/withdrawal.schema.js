import { z } from 'zod';

import { PAYOUT_METHOD } from '#src/modules/withdrawals/withdrawal.constants.js';

export const requestWithdrawalSchema = z
  .object({
    coins: z.number().int().min(1, 'Coin amount must be at least 1'),
    payoutMethod: z.nativeEnum(PAYOUT_METHOD).default(PAYOUT_METHOD.UPI),
    upiId: z
      .string()
      .trim()
      .regex(/^[\w.-]+@[\w.-]+$/, 'Please enter a valid UPI ID (e.g. name@okhdfcbank)')
      .optional(),
    bankDetails: z
      .object({
        accountNumber: z.string().trim().min(6, 'Account number must be at least 6 digits').max(30),
        ifsc: z.string().trim().min(11, 'IFSC must be 11 characters').max(11),
        accountHolderName: z.string().trim().min(2, 'Account holder name is required').max(100),
        bankName: z.string().trim().max(100).optional(),
        phone: z.string().trim().max(15).optional(),
      })
      .optional(),
  })
  .refine(
    (data) => {
      if (data.payoutMethod === PAYOUT_METHOD.UPI) {
        return Boolean(data.upiId);
      }
      if (data.payoutMethod === PAYOUT_METHOD.BANK_TRANSFER) {
        return Boolean(
          data.bankDetails?.accountNumber &&
            data.bankDetails?.ifsc &&
            data.bankDetails?.accountHolderName,
        );
      }
      return true;
    },
    {
      message: 'Please provide valid payment details for the selected payout method',
    },
  );

export const approveWithdrawalSchema = z.object({
  mode: z.enum(['cashfree', 'manual']).default('cashfree'),
  adminNotes: z.string().trim().max(300).optional(),
  utr: z.string().trim().max(100).optional(),
});

export const rejectWithdrawalSchema = z.object({
  reason: z.string().trim().min(2, 'Please specify a rejection reason').max(300),
  adminNotes: z.string().trim().max(300).optional(),
});
