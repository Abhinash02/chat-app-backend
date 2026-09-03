import nodemailer from 'nodemailer';

import { env } from '#src/config/env.js';
import { logger } from '#src/config/logger.js';
import {
  buildPasswordResetEmail,
  buildPaymentFailedEmail,
  buildPaymentSuccessInvoiceEmail,
  buildVerificationEmail,
  buildWelcomeEmail,
} from '#src/integrations/email/email.templates.js';

let primaryTransporter = null;
let gmailTransporter = null;

function isDummyValue(val) {
  if (!val) return true;
  const lower = String(val).toLowerCase();
  return lower.includes('your@') || lower.includes('your_') || lower.includes('example.com');
}

function getPrimaryTransporter() {
  if (!env.SMTP_HOST || !env.SMTP_USER || isDummyValue(env.SMTP_USER) || isDummyValue(env.SMTP_PASSWORD)) {
    return null;
  }
  if (primaryTransporter) return primaryTransporter;

  primaryTransporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 10000,
  });

  return primaryTransporter;
}

function getGmailTransporter() {
  if (!env.isGmailConfigured) return null;
  if (gmailTransporter) return gmailTransporter;

  const pass = (env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '');
  gmailTransporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: env.GMAIL_USER,
      pass,
    },
  });

  return gmailTransporter;
}

/**
 * Delivery never blocks the caller's business outcome: a failed send is logged
 * and reported, but registration still succeeds and the user can request a
 * resend.
 *
 * If the primary SMTP provider fails (or is unconfigured/dummy), delivery
 * seamlessly falls back to Gmail if GMAIL_USER and GMAIL_APP_PASSWORD are set.
 *
 * Outside production the code is written to the log whenever it could not be
 * delivered — whether email is unconfigured *or* both providers rejected it.
 */
async function send({ to, subject, text, html, context = {} }) {
  const primaryMailer = getPrimaryTransporter();
  const gmailMailer = getGmailTransporter();

  if (!primaryMailer && !gmailMailer) {
    logger.warn({ to, subject, ...context }, 'Neither SMTP nor Gmail is configured — email logged instead of sent');
    return { delivered: false, reason: 'EMAIL_NOT_CONFIGURED' };
  }

  // Attempt delivery through primary SMTP first if configured with valid credentials
  if (primaryMailer) {
    try {
      const info = await primaryMailer.sendMail({
        from: `"${env.MAIL_FROM_NAME}" <${env.MAIL_FROM_EMAIL}>`,
        to,
        subject,
        text,
        html,
      });

      logger.info({ to, messageId: info.messageId, provider: 'smtp' }, 'Email sent via primary SMTP');
      return { delivered: true, messageId: info.messageId };
    } catch (error) {
      logger.warn(
        {
          to,
          subject,
          smtpCode: error.responseCode,
          smtpResponse: error.response,
          error: error.message,
        },
        'Primary SMTP failed to send email. Checking Gmail fallback...',
      );

      if (!gmailMailer) {
        logger.error(
          {
            to,
            subject,
            smtpCode: error.responseCode,
            smtpResponse: error.response,
            ...(env.isProduction ? {} : context),
          },
          'Failed to send email and no Gmail fallback configured',
        );

        return { delivered: false, reason: 'SEND_FAILED' };
      }
    }
  }

  // Fall back to Gmail (or use directly if primary SMTP is unconfigured)
  if (gmailMailer) {
    try {
      logger.info({ to, subject }, 'Sending email via Gmail fallback...');
      const senderName = env.MAIL_FROM_NAME || 'CHAT APP';
      const senderEmail = env.GMAIL_USER;

      const info = await gmailMailer.sendMail({
        from: `"${senderName}" <${senderEmail}>`,
        to,
        subject,
        text,
        html,
      });

      logger.info({ to, messageId: info.messageId, provider: 'gmail' }, 'Email sent successfully via Gmail');
      return { delivered: true, messageId: info.messageId };
    } catch (gmailError) {
      logger.error(
        {
          to,
          subject,
          gmailError: gmailError.message,
          gmailResponse: gmailError.response,
          ...(env.isProduction ? {} : context),
        },
        'Gmail fallback failed to send email',
      );

      return { delivered: false, reason: 'GMAIL_SEND_FAILED' };
    }
  }

  return { delivered: false, reason: 'SEND_FAILED' };
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

  async sendPaymentSuccessInvoice({ user, order, invoiceUrl, appName }) {
    if (!user?.email) return { delivered: false, reason: 'NO_RECIPIENT_EMAIL' };
    const name = env.MAIL_FROM_NAME || appName || 'Vibe Chat';
    const message = buildPaymentSuccessInvoiceEmail({ user, order, appName: name, invoiceUrl });
    return send({
      to: user.email,
      ...message,
      context: { orderId: String(order?._id || order?.id || '') },
    });
  },

  async sendPaymentFailedNotice({ user, order, reason, appName }) {
    if (!user?.email) return { delivered: false, reason: 'NO_RECIPIENT_EMAIL' };
    const name = env.MAIL_FROM_NAME || appName || 'Vibe Chat';
    const message = buildPaymentFailedEmail({ user, order, reason, appName: name });
    return send({
      to: user.email,
      ...message,
      context: { orderId: String(order?._id || order?.id || '') },
    });
  },
};
