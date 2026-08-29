import { z } from 'zod';

import { paginationSchema } from '#src/common/validators/common.schema.js';
import { COIN_TRANSACTION_TYPE } from '#src/modules/coins/coins.constants.js';

export const listTransactionsSchema = paginationSchema.extend({
  type: z.nativeEnum(COIN_TRANSACTION_TYPE).optional(),
});

export const createPackageSchema = z
  .object({
    name: z.string().trim().min(2).max(60),
    description: z.string().trim().max(160).optional(),
    priceInPaise: z.number().int().min(100, 'Minimum price is ₹1').max(10_000_000),
    currency: z.string().trim().length(3).toUpperCase().default('INR'),
    coins: z.number().int().min(1).max(1_000_000),
    bonusCoins: z.number().int().min(0).max(1_000_000).default(0),
    badge: z.string().trim().max(24).optional(),
    isPopular: z.boolean().default(false),
    isActive: z.boolean().default(true),
    sortOrder: z.number().int().min(0).max(999).default(0),
  })
  .strict();

export const updatePackageSchema = createPackageSchema.partial().strict().refine(
  (value) => Object.keys(value).length > 0,
  { message: 'Nothing to update' },
);

export const adjustBalanceSchema = z
  .object({
    amount: z
      .number()
      .int()
      .refine((value) => value !== 0, { message: 'Amount cannot be zero' })
      .refine((value) => Math.abs(value) <= 1_000_000, { message: 'Amount is too large' }),
    reason: z.string().trim().min(3).max(200),
  })
  .strict();
