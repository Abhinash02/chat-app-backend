import { z } from 'zod';

import {
  BLOG_STATUS,
  FAQ_CATEGORY,
  LEGAL_DOC_SLUG,
  SITE_FEEDBACK_CATEGORY,
} from '#src/modules/site/site.constants.js';

export const listPostsSchema = z.object({
  tag: z.string().trim().max(40).optional(),
  search: z.string().trim().max(120).optional(),
  status: z.union([z.nativeEnum(BLOG_STATUS), z.literal('all')]).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

export const createPostSchema = z.object({
  title: z.string().trim().min(3, 'Give the post a title').max(160),
  content: z.string().trim().min(1, 'A post needs a body'),
  excerpt: z.string().trim().max(400).optional(),
  coverImageUrl: z.string().trim().url('Cover image must be a URL').or(z.literal('')).optional(),
  tags: z.array(z.string().trim().max(40)).max(10).optional(),
  status: z.nativeEnum(BLOG_STATUS).optional(),
  authorName: z.string().trim().max(80).optional(),
  seoTitle: z.string().trim().max(160).optional(),
  seoDescription: z.string().trim().max(300).optional(),
});

/* Every field optional, but not an empty body — that is always a mistake. */
export const updatePostSchema = createPostSchema.partial().refine(
  (data) => Object.keys(data).length > 0,
  { message: 'Nothing to update' },
);

export const faqSchema = z.object({
  question: z.string().trim().min(3, 'Write the question').max(300),
  answer: z.string().trim().min(1, 'Write the answer').max(4000),
  category: z.nativeEnum(FAQ_CATEGORY).optional(),
  order: z.coerce.number().int().optional(),
  isActive: z.boolean().optional(),
});

export const updateFaqSchema = faqSchema.partial().refine(
  (data) => Object.keys(data).length > 0,
  { message: 'Nothing to update' },
);

export const testimonialSchema = z.object({
  name: z.string().trim().min(1, 'Who said it?').max(80),
  quote: z.string().trim().min(1, 'The quote is missing').max(600),
  role: z.string().trim().max(120).optional(),
  avatarUrl: z.string().trim().url().or(z.literal('')).optional(),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  order: z.coerce.number().int().optional(),
  isActive: z.boolean().optional(),
});

export const updateTestimonialSchema = testimonialSchema.partial().refine(
  (data) => Object.keys(data).length > 0,
  { message: 'Nothing to update' },
);

export const heroSlideSchema = z.object({
  title: z.string().trim().min(2, 'Give the slide a title').max(120),
  subtitle: z.string().trim().max(300).optional(),
  eyebrow: z.string().trim().max(60).optional(),
  imageUrl: z.string().trim().url().or(z.literal('')).optional(),
  ctaLabel: z.string().trim().max(40).optional(),
  ctaHref: z.string().trim().max(400).optional(),
  order: z.coerce.number().int().optional(),
  isActive: z.boolean().optional(),
});

export const updateHeroSlideSchema = heroSlideSchema.partial().refine(
  (data) => Object.keys(data).length > 0,
  { message: 'Nothing to update' },
);

export const legalDocSchema = z.object({
  title: z.string().trim().min(2, 'Give the document a title').max(160),
  body: z.string().trim().min(1, 'The document is empty'),
  effectiveFrom: z.coerce.date().optional(),
});

export const legalSlugParamSchema = z.object({
  slug: z.nativeEnum(LEGAL_DOC_SLUG),
});

/*
 * The website's feedback form. No account is required — a visitor who has not
 * installed the app yet is exactly the person whose feedback is hardest to get
 * and most worth having.
 *
 * The address is required, though, and that is the one place this differs from
 * the in-app form. A signed-in user can be replied to through their account; a
 * visitor cannot, so without an address their feedback is a message nobody can
 * answer — which is worse for them than being asked for it.
 */
export const siteFeedbackSchema = z.object({
  message: z.string().trim().min(4, 'Tell us a little more').max(2000),
  category: z.enum(SITE_FEEDBACK_CATEGORY).optional(),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  email: z.string().trim().min(1, 'We need an email to reply to').email('That email does not look right'),
});

const hex = z
  .string()
  .trim()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Use a hex colour such as #1f5fe0');

export const appearanceSchema = z
  .object({
    followAppTheme: z.boolean().optional(),
    primary: hex.optional(),
    primaryDark: hex.optional(),
    onPrimary: hex.optional(),
    accent: hex.optional(),
    background: hex.optional(),
    surface: hex.optional(),
    surfaceAlt: hex.optional(),
    border: hex.optional(),
    textPrimary: hex.optional(),
    textSecondary: hex.optional(),
    textMuted: hex.optional(),
    gradientStart: hex.optional(),
    gradientEnd: hex.optional(),
    heroTop: hex.optional(),
    heroMid: hex.optional(),
    heroLow: hex.optional(),
    heroBase: hex.optional(),
    ink: hex.optional(),
    coinGold: hex.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'Nothing to update' });
