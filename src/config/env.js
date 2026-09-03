import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const booleanFromString = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  API_PREFIX: z.string().startsWith('/').default('/api/v1'),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  /**
   * This server's own public origin. Unsubscribe links in campaign email are
   * built from it, so they have to resolve from someone's inbox — a localhost
   * link in a sent email is a dead link.
   */
  PUBLIC_API_URL: z.string().optional().default(''),

  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_ACCESS_TTL: z.string().default('7d'),
  JWT_REFRESH_TTL: z.string().default('90d'),
  BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),

  SMTP_HOST: z.string().optional().default(''),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: booleanFromString.default('false'),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASSWORD: z.string().optional().default(''),
  MAIL_FROM_NAME: z.string().default('Vibe Chat'),
  MAIL_FROM_EMAIL: z.string().email().default('no-reply@vibechat.app'),
  GMAIL_USER: z.string().optional().default(''),
  GMAIL_APP_PASSWORD: z.string().optional().default(''),

  STORAGE_PROVIDER: z.enum(['supabase', 'cloudinary', 'local']).default('local'),
  SUPABASE_URL: z.string().optional().default(''),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional().default(''),
  SUPABASE_STORAGE_BUCKET: z.string().default('vibechat-media'),
  CLOUDINARY_CLOUD_NAME: z.string().optional().default(''),
  CLOUDINARY_API_KEY: z.string().optional().default(''),
  CLOUDINARY_API_SECRET: z.string().optional().default(''),
  CLOUDINARY_FOLDER: z.string().default('vibechat'),

  RAZORPAY_KEY_ID: z.string().optional().default(''),
  RAZORPAY_KEY_SECRET: z.string().optional().default(''),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional().default(''),

  STRIPE_SECRET_KEY: z.string().optional().default(''),
  STRIPE_PUBLISHABLE_KEY: z.string().optional().default(''),
  STRIPE_WEBHOOK_SECRET: z.string().optional().default(''),

  CASHFREE_APP_ID: z.string().optional().default(''),
  CASHFREE_SECRET_KEY: z.string().optional().default(''),
  CASHFREE_MERCHANT_ID: z.string().optional().default(''),
  CASHFREE_ENV: z.string().default('TEST'),
  CASHFREE_API_VERSION: z.string().default('2023-08-01'),

  SEED_ADMIN_EMAIL: z.string().email().default('admin@vibechat.app'),
  SEED_ADMIN_PASSWORD: z.string().min(8).default('Admin@12345'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');

  throw new Error(`Invalid environment configuration:\n${details}`);
}

const raw = parsed.data;

export const env = Object.freeze({
  ...raw,
  isProduction: raw.NODE_ENV === 'production',
  isTest: raw.NODE_ENV === 'test',
  corsOrigins: raw.CORS_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  isGmailConfigured: Boolean(raw.GMAIL_USER && raw.GMAIL_APP_PASSWORD),
  isEmailConfigured: Boolean(
    (raw.SMTP_HOST && raw.SMTP_USER && !raw.SMTP_USER.includes('your@email.com')) ||
    (raw.GMAIL_USER && raw.GMAIL_APP_PASSWORD),
  ),
  publicApiUrl: raw.PUBLIC_API_URL || `http://localhost:${raw.PORT}`,
  isRazorpayConfigured: Boolean(raw.RAZORPAY_KEY_ID && raw.RAZORPAY_KEY_SECRET),
  isCashfreeConfigured: Boolean(raw.CASHFREE_APP_ID && raw.CASHFREE_SECRET_KEY),
  isStripeConfigured: Boolean(raw.STRIPE_SECRET_KEY),
});
