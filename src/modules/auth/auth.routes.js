import { Router } from 'express';

import { authenticate, authRateLimiter, otpRateLimiter, validate } from '#src/common/middleware/index.js';
import { authController } from '#src/modules/auth/auth.controller.js';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  logoutSchema,
  refreshSchema,
  registerSchema,
  resendCodeSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from '#src/modules/auth/auth.schema.js';

const router = Router();

router.post('/register', otpRateLimiter, validate({ body: registerSchema }), authController.register);
router.post('/verify-email', authRateLimiter, validate({ body: verifyEmailSchema }), authController.verifyEmail);
router.post(
  '/resend-code',
  otpRateLimiter,
  validate({ body: resendCodeSchema }),
  authController.resendVerificationCode,
);

router.post('/login', authRateLimiter, validate({ body: loginSchema }), authController.login);
router.post('/refresh', validate({ body: refreshSchema }), authController.refresh);
router.post('/logout', validate({ body: logoutSchema }), authController.logout);

router.post(
  '/forgot-password',
  otpRateLimiter,
  validate({ body: forgotPasswordSchema }),
  authController.forgotPassword,
);
router.post(
  '/reset-password',
  authRateLimiter,
  validate({ body: resetPasswordSchema }),
  authController.resetPassword,
);

router.get('/me', authenticate, authController.me);
router.get('/sessions', authenticate, authController.listSessions);
router.post('/logout-all', authenticate, authController.logoutAllDevices);
router.post(
  '/change-password',
  authenticate,
  authRateLimiter,
  validate({ body: changePasswordSchema }),
  authController.changePassword,
);

export const authRoutes = router;
