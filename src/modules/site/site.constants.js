/**
 * Content the marketing website shows, and the admin panel owns.
 *
 * Kept in its own module rather than folded into `settings` because these are
 * collections that grow — posts, questions, quotes — not a fixed document of
 * toggles.
 */
export const BLOG_STATUS = Object.freeze({
  DRAFT: 'draft',
  PUBLISHED: 'published',
});

/** Groups the FAQ page renders as sections, in this order. */
export const FAQ_CATEGORY = Object.freeze({
  GENERAL: 'general',
  ACCOUNT: 'account',
  COINS: 'coins',
  SAFETY: 'safety',
  TECHNICAL: 'technical',
});

/** Words per minute used to estimate a post's reading time. */
export const READING_WPM = 200;

/**
 * The policy pages the website routes to. Fixed, because each one has its own
 * URL and its own link in the footer.
 */
export const LEGAL_DOC_SLUG = Object.freeze({
  PRIVACY: 'privacy',
  TERMS: 'terms',
  REFUND: 'refund',
});

/** Categories the website's feedback form offers, mirroring the app's. */
export const SITE_FEEDBACK_CATEGORY = Object.freeze([
  'suggestion',
  'bug',
  'compliment',
  'other',
]);
