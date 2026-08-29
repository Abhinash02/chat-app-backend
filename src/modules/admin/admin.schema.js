import { z } from 'zod';

import { GENDER, USER_ROLE, USER_STATUS } from '#src/common/constants/index.js';
import { emailSchema, objectIdSchema, paginationSchema } from '#src/common/validators/common.schema.js';
import { COIN_TRANSACTION_TYPE } from '#src/modules/coins/coins.constants.js';
import { ADMIN_ACTION } from '#src/modules/admin/admin.constants.js';

export const adminLoginSchema = z
  .object({ email: emailSchema, password: z.string().min(1, 'Enter your password').max(128) })
  .strict();

export const listUsersSchema = paginationSchema.extend({
  gender: z.nativeEnum(GENDER).optional(),
  status: z.nativeEnum(USER_STATUS).optional(),
  role: z.nativeEnum(USER_ROLE).optional(),
  search: z.string().trim().min(1).max(60).optional(),
});

export const adminUserIdParamSchema = z.object({ userId: objectIdSchema });

export const suspendUserSchema = z
  .object({ reason: z.string().trim().min(3, 'Give a reason').max(200) })
  .strict();

export const adjustCoinsSchema = z
  .object({
    amount: z
      .number()
      .int()
      .refine((value) => value !== 0, { message: 'Amount cannot be zero' })
      .refine((value) => Math.abs(value) <= 1_000_000, { message: 'Amount is too large' }),
    reason: z.string().trim().min(3, 'Give a reason').max(200),
  })
  .strict();

export const listTransactionsSchema = paginationSchema.extend({
  userId: objectIdSchema.optional(),
  type: z.nativeEnum(COIN_TRANSACTION_TYPE).optional(),
});

export const listAuditSchema = paginationSchema.extend({
  adminId: objectIdSchema.optional(),
  action: z.nativeEnum(ADMIN_ACTION).optional(),
});
