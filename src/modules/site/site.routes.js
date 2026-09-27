import { Router } from 'express';

import {
  authenticate,
  otpRateLimiter,
  requireAdmin,
  validate,
} from '#src/common/middleware/index.js';
import { siteController } from '#src/modules/site/site.controller.js';
import {
  createPostSchema,
  faqSchema,
  heroSlideSchema,
  legalDocSchema,
  legalSlugParamSchema,
  appearanceSchema,
  listPostsSchema,
  siteFeedbackSchema,
  testimonialSchema,
  updateFaqSchema,
  updateHeroSlideSchema,
  updatePostSchema,
  updateTestimonialSchema,
} from '#src/modules/site/site.schema.js';

const router = Router();

/*
 * Public, and deliberately declared before `authenticate`.
 *
 * The marketing site has no session — a visitor reading the blog has not signed
 * up yet, and that is the entire point of the page. Only published content is
 * reachable here; drafts live behind the admin routes below.
 */
router.get('/blog', validate({ query: listPostsSchema }), siteController.listPublishedPosts);
router.get('/blog/:slug', siteController.getPublishedPost);
router.get('/faq', siteController.listFaqs);
router.get('/testimonials', siteController.listTestimonials);
router.get('/hero', siteController.listHeroSlides);
router.get('/appearance', siteController.getAppearance);
router.get('/announcements', siteController.listAnnouncements);
router.get('/announcements/:id', siteController.getAnnouncement);
router.get('/legal/:slug', validate({ params: legalSlugParamSchema }), siteController.getLegalDoc);

/*
 * The one public write on the site.
 *
 * Rate limited hard: an unauthenticated POST that creates a row in the admin's
 * feedback queue is otherwise a free spam channel, and there is no account to
 * ban afterwards.
 */
router.post(
  '/feedback',
  otpRateLimiter,
  validate({ body: siteFeedbackSchema }),
  siteController.submitSiteFeedback,
);

// Everything past this point is the admin panel.
router.use(authenticate, requireAdmin);

router.get('/admin/blog', siteController.listAdminPosts);
router.post('/admin/blog', validate({ body: createPostSchema }), siteController.createPost);
router.patch('/admin/blog/:postId', validate({ body: updatePostSchema }), siteController.updatePost);
router.delete('/admin/blog/:postId', siteController.deletePost);

router.get('/admin/faq', siteController.listAdminFaqs);
router.post('/admin/faq', validate({ body: faqSchema }), siteController.createFaq);
router.patch('/admin/faq/:faqId', validate({ body: updateFaqSchema }), siteController.updateFaq);
router.delete('/admin/faq/:faqId', siteController.deleteFaq);

router.get('/admin/testimonials', siteController.listAdminTestimonials);
router.post(
  '/admin/testimonials',
  validate({ body: testimonialSchema }),
  siteController.createTestimonial,
);
router.patch(
  '/admin/testimonials/:testimonialId',
  validate({ body: updateTestimonialSchema }),
  siteController.updateTestimonial,
);
router.delete('/admin/testimonials/:testimonialId', siteController.deleteTestimonial);

router.get('/admin/hero', siteController.listAdminHeroSlides);
router.post('/admin/hero', validate({ body: heroSlideSchema }), siteController.createHeroSlide);
router.patch(
  '/admin/hero/:slideId',
  validate({ body: updateHeroSlideSchema }),
  siteController.updateHeroSlide,
);
router.delete('/admin/hero/:slideId', siteController.deleteHeroSlide);

router.put(
  '/admin/appearance',
  validate({ body: appearanceSchema }),
  siteController.saveAppearance,
);

router.get('/admin/legal', siteController.listAdminLegalDocs);
router.put(
  '/admin/legal/:slug',
  validate({ params: legalSlugParamSchema, body: legalDocSchema }),
  siteController.saveLegalDoc,
);

export const siteRoutes = router;
