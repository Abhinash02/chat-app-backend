import nodemailer from 'nodemailer';

import { env } from '#src/config/env.js';
import { logger } from '#src/config/logger.js';
import {
  buildPasswordResetEmail,
  buildVerificationEmail,
  buildWelcomeEmail,
} from '#src/integrations/email/email.templates.js';

let transporter = null;

function getTransporter() {
  if (!env.isEmailConfigured) return null;
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
  });

  return transporter;
}

/**
 * Delivery never blocks the caller's business outcome: a failed send is logged
 * and reported, but registration still succeeds and the user can request a
 * resend.
 *
 * Outside production the code is written to the log whenever it could not be
 * delivered — whether SMTP is unconfigured *or* the provider rejected it. That
 * second case matters: a half-configured provider used to leave a developer
 * with no code and no way to finish signing up, which looks like the app is
 * broken when the real problem is an unverified sender address.
 */
async function send({ to, subject, text, html, context = {} }) {
  const mailer = getTransporter();

  if (!mailer) {
    logger.warn({ to, subject, ...context }, 'SMTP not configured — email logged instead of sent');
    return { delivered: false, reason: 'SMTP_NOT_CONFIGURED' };
  }

  try {
    const info = await mailer.sendMail({
      from: `"${env.MAIL_FROM_NAME}" <${env.MAIL_FROM_EMAIL}>`,
      to,
      subject,
      text,
      html,
    });

    logger.info({ to, messageId: info.messageId }, 'Email sent');
    return { delivered: true, messageId: info.messageId };
  } catch (error) {
    // The provider's own words are what identifies the problem — an unverified
    // sender, a bad key, a throttle — so they are logged verbatim.
    logger.error(
      {
        to,
        subject,
        smtpCode: error.responseCode,
        smtpResponse: error.response,
        ...(env.isProduction ? {} : context),
      },
      'Failed to send email',
    );

    return { delivered: false, reason: 'SEND_FAILED' };
  }
}

export const emailService = {
  async sendVerificationCode({ to, name, code, expiresInMinutes, appName }) {
    const message = buildVerificationEmail({ code, name, expiresInMinutes, appName });
    // The code reaches the log only outside production, so the flow stays
    // testable without SMTP. It is never logged on a production deployment.
    return send({ to, ...message, context: env.isProduction ? {} : { devOtp: code } });
  },

  async sendPasswordResetCode({ to, name, code, expiresInMinutes, appName }) {
    const message = buildPasswordResetEmail({ code, name, expiresInMinutes, appName });
    return send({ to, ...message, context: env.isProduction ? {} : { devOtp: code } });
  },

  /**
   * Generic send for admin-composed mail. The caller owns the HTML, including
   * the unsubscribe footer — this only puts it on the wire.
   */
  async sendRaw({ to, subject, html, text }) {
    return send({ to, subject, html, text: text ?? '' });
  },

  async sendWelcome({ to, name, appName, freeTalkMinutes }) {
    const message = buildWelcomeEmail({ name, appName, freeTalkMinutes });
    return send({ to, ...message });
  },
};
