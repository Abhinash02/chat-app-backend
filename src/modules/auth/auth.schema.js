import { z } from 'zod';

import { GENDER } from '#src/common/constants/index.js';
import { emailSchema, otpSchema, passwordSchema } from '#src/common/validators/common.schema.js';

const nameSchema = z
  .string()
  .trim()
  .min(2, 'Name must be at least 2 characters')
  .max(60)
  .regex(/^[\p{L}\p{M}'\-. ]+$/u, 'Name can only contain letters, spaces, hyphens and apostrophes');

const nicknameSchema = z
  .string()
  .trim()
  .min(2, 'Nickname must be at least 2 characters')
  .max(24)
  .regex(/^[a-zA-Z0-9_.]+$/, 'Nickname can only contain letters, numbers, dots and underscores');

export const registerSchema = z
  .object({
    name: nameSchema,
    nickname: nicknameSchema,
    email: emailSchema,
    password: passwordSchema,
    gender: z.nativeEnum(GENDER, { errorMap: () => ({ message: 'Select your gender' }) }),
    ageGroup: z.string().trim().max(30).optional().nullable(),
    zodiacSign: z.string().trim().max(40).optional().nullable(),
    referralCode: z.string().trim().min(6).max(20).optional().nullable(),
  })
  .strict();

export const verifyEmailSchema = z.object({ email: emailSchema, code: otpSchema }).strict();

export const resendCodeSchema = z.object({ email: emailSchema }).strict();

export const loginSchema = z
  .object({
    email: emailSchema,
    // Deliberately not `passwordSchema`: an existing password predating a rule
    // change must still be able to sign in.
    password: z.string().min(1, 'Enter your password').max(128),
  })
  .strict();

export const refreshSchema = z.object({ refreshToken: z.string().min(20) }).strict();

export const logoutSchema = z.object({ refreshToken: z.string().min(20).optional() }).strict();

export const forgotPasswordSchema = z.object({ email: emailSchema }).strict();

export const resetPasswordSchema = z
  .object({ email: emailSchema, code: otpSchema, newPassword: passwordSchema })
  .strict();

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password').max(128),
    newPassword: passwordSchema,
  })
  .strict()
  .refine((value) => value.currentPassword !== value.newPassword, {
    message: 'Choose a password you have not used before',
    path: ['newPassword'],
  });
