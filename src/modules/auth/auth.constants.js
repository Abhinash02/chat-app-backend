export const OTP_PURPOSE = Object.freeze({
  EMAIL_VERIFICATION: 'email_verification',
  PASSWORD_RESET: 'password_reset',
});

export const OTP_LENGTH = 6;
export const OTP_TTL_MINUTES = 10;
/** Wrong guesses tolerated before the code is burned and a resend is required. */
export const OTP_MAX_ATTEMPTS = 5;
/** Minimum gap between two sends to the same address for the same purpose. */
export const OTP_RESEND_COOLDOWN_SECONDS = 60;
