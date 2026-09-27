import { NotFoundError } from '#src/common/errors/index.js';
import { feedbackService } from '#src/modules/feedback/feedback.service.js';
import { BLOG_STATUS, READING_WPM } from '#src/modules/site/site.constants.js';
import { siteRepository } from '#src/modules/site/site.repository.js';

/**
 * Turns a title into a URL segment: lowercase, accents stripped, anything that
 * is not a letter or digit collapsed to a single hyphen.
 */
function slugify(title) {
  return String(title)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 180);
}

/**
 * A slug nobody else is using.
 *
 * Two posts called "Staying safe on Vibe" are entirely plausible, and the
 * second one must not fail to save because of it — so a counter is appended
 * until the slug is free.
 */
async function uniqueSlug(title) {
  const base = slugify(title) || 'post';
  let candidate = base;

  for (let suffix = 2; await siteRepository.slugExists(candidate); suffix += 1) {
    candidate = `${base}-${suffix}`;
    if (suffix > 50) {
      candidate = `${base}-${Date.now()}`;
      break;
    }
  }

  return candidate;
}

function readMinutesFor(content) {
  const words = String(content).trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / READING_WPM));
}

/** Strips markdown-ish syntax so an auto excerpt reads as prose, not source. */
function autoExcerpt(content) {
  return String(content)
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`~-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240);
}

function toPostCard(post) {
  if (!post) return null;
  return {
    id: String(post._id),
    title: post.title,
    slug: post.slug,
    excerpt: post.excerpt ?? '',
    coverImageUrl: post.coverImageUrl ?? null,
    tags: post.tags ?? [],
    status: post.status,
    publishedAt: post.publishedAt ?? null,
    authorName: post.authorName ?? 'Vibe Team',
    readMinutes: post.readMinutes ?? 1,
    viewCount: post.viewCount ?? 0,
    createdAt: post.createdAt,
  };
}

function toPostDetail(post) {
  if (!post) return null;
  return {
    ...toPostCard(post),
    content: post.content,
    seoTitle: post.seoTitle || post.title,
    seoDescription: post.seoDescription || post.excerpt || '',
  };
}

// ----- Blog -----------------------------------------------------------------

/** The website's list. Drafts are not reachable here by any query string. */
export async function listPublishedPosts({ tag, page = 1, limit = 12 } = {}) {
  const { items, total } = await siteRepository.listPosts({
    status: BLOG_STATUS.PUBLISHED,
    tag,
    page,
    limit,
  });

  return { items: items.map(toPostCard), total, page, limit };
}

export async function getPublishedPost(slug) {
  const post = await siteRepository.findPostBySlug(slug, { publishedOnly: true });
  if (!post) throw new NotFoundError('Post not found', 'POST_NOT_FOUND');

  // Fire and forget: a view counter must never delay or fail the read.
  siteRepository.incrementPostViews(post._id).catch(() => undefined);

  return toPostDetail(post);
}

export async function listAdminPosts({ status, search, page = 1, limit = 20 } = {}) {
  const { items, total } = await siteRepository.listPosts({ status, search, page, limit });
  return { items: items.map(toPostCard), total, page, limit };
}

export async function createPost({ adminId, ...input }) {
  const slug = await uniqueSlug(input.title);
  const isPublished = input.status === BLOG_STATUS.PUBLISHED;

  const created = await siteRepository.createPost({
    ...input,
    slug,
    excerpt: input.excerpt?.trim() || autoExcerpt(input.content),
    coverImageUrl: input.coverImageUrl || null,
    readMinutes: readMinutesFor(input.content),
    authorAdminId: adminId ?? null,
    publishedAt: isPublished ? new Date() : null,
  });

  return toPostDetail(created);
}

export async function updatePost({ postId, ...input }) {
  const existing = await siteRepository.findPostById(postId);
  if (!existing) throw new NotFoundError('Post not found', 'POST_NOT_FOUND');

  const update = { ...input };

  if (input.content !== undefined) {
    update.readMinutes = readMinutesFor(input.content);
    if (!input.excerpt && !existing.excerpt) update.excerpt = autoExcerpt(input.content);
  }

  /*
   * `publishedAt` is the date the post went live, not the date it last
   * changed — so it is stamped on the first publish and never rewritten by a
   * later edit. Unpublishing back to draft clears it, so re-publishing dates
   * it correctly rather than back-dating to a version nobody saw.
   */
  if (input.status === BLOG_STATUS.PUBLISHED && !existing.publishedAt) {
    update.publishedAt = new Date();
  } else if (input.status === BLOG_STATUS.DRAFT) {
    update.publishedAt = null;
  }

  const updated = await siteRepository.updatePostById(postId, { $set: update });
  return toPostDetail(updated);
}

export async function deletePost(postId) {
  const deleted = await siteRepository.deletePostById(postId);
  if (!deleted) throw new NotFoundError('Post not found', 'POST_NOT_FOUND');
  return { deleted: true };
}

// ----- FAQ ------------------------------------------------------------------

function toFaq(faq) {
  return {
    id: String(faq._id),
    question: faq.question,
    answer: faq.answer,
    category: faq.category,
    order: faq.order ?? 0,
    isActive: faq.isActive !== false,
  };
}

export async function listFaqs({ includeInactive = false } = {}) {
  const items = await siteRepository.listFaqs({ activeOnly: !includeInactive });
  return items.map(toFaq);
}

export async function createFaq(input) {
  const created = await siteRepository.createFaq(input);
  return toFaq(created);
}

export async function updateFaq({ faqId, ...input }) {
  const updated = await siteRepository.updateFaqById(faqId, { $set: input });
  if (!updated) throw new NotFoundError('Question not found', 'FAQ_NOT_FOUND');
  return toFaq(updated);
}

export async function deleteFaq(faqId) {
  const deleted = await siteRepository.deleteFaqById(faqId);
  if (!deleted) throw new NotFoundError('Question not found', 'FAQ_NOT_FOUND');
  return { deleted: true };
}

// ----- Testimonials ---------------------------------------------------------

function toTestimonial(item) {
  return {
    id: String(item._id),
    name: item.name,
    role: item.role ?? '',
    avatarUrl: item.avatarUrl ?? null,
    quote: item.quote,
    rating: item.rating ?? 5,
    order: item.order ?? 0,
    isActive: item.isActive !== false,
  };
}

export async function listTestimonials({ includeInactive = false } = {}) {
  const items = await siteRepository.listTestimonials({ activeOnly: !includeInactive });
  return items.map(toTestimonial);
}

export async function createTestimonial(input) {
  const created = await siteRepository.createTestimonial(input);
  return toTestimonial(created);
}

export async function updateTestimonial({ testimonialId, ...input }) {
  const updated = await siteRepository.updateTestimonialById(testimonialId, { $set: input });
  if (!updated) throw new NotFoundError('Testimonial not found', 'TESTIMONIAL_NOT_FOUND');
  return toTestimonial(updated);
}

export async function deleteTestimonial(testimonialId) {
  const deleted = await siteRepository.deleteTestimonialById(testimonialId);
  if (!deleted) throw new NotFoundError('Testimonial not found', 'TESTIMONIAL_NOT_FOUND');
  return { deleted: true };
}


// ----- Hero slides ----------------------------------------------------------

function toHeroSlide(slide) {
  return {
    id: String(slide._id),
    title: slide.title,
    subtitle: slide.subtitle ?? '',
    eyebrow: slide.eyebrow ?? '',
    imageUrl: slide.imageUrl ?? null,
    ctaLabel: slide.ctaLabel ?? '',
    ctaHref: slide.ctaHref ?? '',
    order: slide.order ?? 0,
    isActive: slide.isActive !== false,
  };
}

export async function listHeroSlides({ includeInactive = false } = {}) {
  const slides = await siteRepository.listHeroSlides({ activeOnly: !includeInactive });
  return slides.map(toHeroSlide);
}

export async function createHeroSlide(input) {
  return toHeroSlide(await siteRepository.createHeroSlide(input));
}

export async function updateHeroSlide({ slideId, ...input }) {
  const updated = await siteRepository.updateHeroSlideById(slideId, { $set: input });
  if (!updated) throw new NotFoundError('Slide not found', 'SLIDE_NOT_FOUND');
  return toHeroSlide(updated);
}

export async function deleteHeroSlide(slideId) {
  const deleted = await siteRepository.deleteHeroSlideById(slideId);
  if (!deleted) throw new NotFoundError('Slide not found', 'SLIDE_NOT_FOUND');
  return { deleted: true };
}

// ----- Announcements --------------------------------------------------------

function toAnnouncement(event) {
  if (!event) return null;
  return {
    id: String(event._id),
    title: event.title,
    description: event.description,
    type: event.type,
    badgeText: event.badgeText ?? '',
    bannerUrl: event.bannerUrl ?? null,
    rewardCoins: event.rewardCoins ?? 0,
    rewardFreeMinutes: event.rewardFreeMinutes ?? 0,
    discountPercent: event.discountPercent ?? 0,
    startsAt: event.startsAt ?? null,
    endsAt: event.endsAt ?? null,
    createdAt: event.createdAt,
  };
}

export async function listAnnouncements({ page = 1, limit = 12 } = {}) {
  const { items, total } = await siteRepository.listAnnouncements({ page, limit });
  return { items: items.map(toAnnouncement), total, page, limit };
}

export async function getAnnouncement(id) {
  const event = await siteRepository.findAnnouncementById(id);
  if (!event) throw new NotFoundError('Announcement not found', 'ANNOUNCEMENT_NOT_FOUND');
  return toAnnouncement(event);
}

// ----- Legal documents ------------------------------------------------------

function toLegalDoc(doc) {
  if (!doc) return null;
  return {
    slug: doc.slug,
    title: doc.title,
    body: doc.body,
    effectiveFrom: doc.effectiveFrom ?? doc.updatedAt ?? null,
    updatedAt: doc.updatedAt ?? null,
  };
}

export async function getLegalDoc(slug) {
  const doc = await siteRepository.findLegalDoc(slug);
  if (!doc) throw new NotFoundError('That policy has not been published yet', 'LEGAL_NOT_FOUND');
  return toLegalDoc(doc);
}

export async function listLegalDocs() {
  const docs = await siteRepository.listLegalDocs();
  return docs.map(toLegalDoc);
}

export async function saveLegalDoc({ slug, ...input }) {
  return toLegalDoc(await siteRepository.upsertLegalDoc(slug, input));
}

// ----- Appearance -----------------------------------------------------------

function toAppearance(doc) {
  if (!doc) return null;
  // Strip the storage fields; everything else is a colour the website reads.
  const { _id, key: _key, __v, createdAt: _createdAt, updatedAt, ...colors } = doc;
  return { ...colors, updatedAt: updatedAt ?? null };
}

export async function getAppearance() {
  return toAppearance(await siteRepository.findOrCreateAppearance());
}

export async function saveAppearance(input) {
  return toAppearance(await siteRepository.updateAppearance(input));
}

// ----- Website feedback -----------------------------------------------------

/**
 * Feedback from a visitor with no account.
 *
 * Reuses the app's feedback pipeline rather than starting a second one, so it
 * lands in the same admin queue with the same statuses — there is no useful
 * distinction between "a user told us" and "a visitor told us" once it is in
 * front of whoever answers it.
 *
 * The address goes into `deviceInfo`, which is the model's free-text context
 * field. A visitor is not a user, so there is no account to reply through, and
 * an optional address is the only way back to them.
 */
export async function submitSiteFeedback({ message, category, rating, email }) {
  const context = email?.trim() ? `Website · ${email.trim()}` : 'Website';

  return feedbackService.submitFeedback({
    userId: null,
    category: category || 'suggestion',
    rating: rating ?? 5,
    message,
    deviceInfo: context,
  });
}

export const siteService = {
  listPublishedPosts,
  getPublishedPost,
  listAdminPosts,
  createPost,
  updatePost,
  deletePost,
  listFaqs,
  createFaq,
  updateFaq,
  deleteFaq,
  listTestimonials,
  createTestimonial,
  updateTestimonial,
  deleteTestimonial,
  listHeroSlides,
  createHeroSlide,
  updateHeroSlide,
  deleteHeroSlide,
  listAnnouncements,
  getAnnouncement,
  getLegalDoc,
  listLegalDocs,
  saveLegalDoc,
  submitSiteFeedback,
  getAppearance,
  saveAppearance,
};
