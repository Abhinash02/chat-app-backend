import { asyncHandler } from '#src/common/utils/async-handler.util.js';
import { sendCreated, sendSuccess } from '#src/common/utils/response.util.js';
import { siteService } from '#src/modules/site/site.service.js';

export const siteController = {
  // ----- Public -------------------------------------------------------------

  listPublishedPosts: asyncHandler(async (req, res) => {
    const result = await siteService.listPublishedPosts({
      tag: req.query.tag,
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 12,
    });
    return sendSuccess(res, result.items, {
      meta: { total: result.total, page: result.page, limit: result.limit },
    });
  }),

  getPublishedPost: asyncHandler(async (req, res) => {
    const post = await siteService.getPublishedPost(req.params.slug);
    return sendSuccess(res, post);
  }),

  listFaqs: asyncHandler(async (_req, res) => {
    return sendSuccess(res, await siteService.listFaqs());
  }),

  listTestimonials: asyncHandler(async (_req, res) => {
    return sendSuccess(res, await siteService.listTestimonials());
  }),

  listHeroSlides: asyncHandler(async (_req, res) => {
    return sendSuccess(res, await siteService.listHeroSlides());
  }),

  getAppearance: asyncHandler(async (_req, res) => {
    return sendSuccess(res, await siteService.getAppearance());
  }),

  saveAppearance: asyncHandler(async (req, res) => {
    return sendSuccess(res, await siteService.saveAppearance(req.body));
  }),

  listAnnouncements: asyncHandler(async (req, res) => {
    const result = await siteService.listAnnouncements({
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 12,
    });
    return sendSuccess(res, result.items, {
      meta: { total: result.total, page: result.page, limit: result.limit },
    });
  }),

  getAnnouncement: asyncHandler(async (req, res) => {
    return sendSuccess(res, await siteService.getAnnouncement(req.params.id));
  }),

  getLegalDoc: asyncHandler(async (req, res) => {
    return sendSuccess(res, await siteService.getLegalDoc(req.params.slug));
  }),

  submitSiteFeedback: asyncHandler(async (req, res) => {
    return sendCreated(res, await siteService.submitSiteFeedback(req.body));
  }),

  // ----- Admin: blog --------------------------------------------------------

  listAdminPosts: asyncHandler(async (req, res) => {
    const result = await siteService.listAdminPosts({
      status: req.query.status,
      search: req.query.search,
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 20,
    });
    return sendSuccess(res, result.items, {
      meta: { total: result.total, page: result.page, limit: result.limit },
    });
  }),

  createPost: asyncHandler(async (req, res) => {
    const post = await siteService.createPost({ adminId: req.user?.id, ...req.body });
    return sendCreated(res, post);
  }),

  updatePost: asyncHandler(async (req, res) => {
    const post = await siteService.updatePost({ postId: req.params.postId, ...req.body });
    return sendSuccess(res, post);
  }),

  deletePost: asyncHandler(async (req, res) => {
    return sendSuccess(res, await siteService.deletePost(req.params.postId));
  }),

  // ----- Admin: FAQ ---------------------------------------------------------

  listAdminFaqs: asyncHandler(async (_req, res) => {
    return sendSuccess(res, await siteService.listFaqs({ includeInactive: true }));
  }),

  createFaq: asyncHandler(async (req, res) => {
    return sendCreated(res, await siteService.createFaq(req.body));
  }),

  updateFaq: asyncHandler(async (req, res) => {
    return sendSuccess(res, await siteService.updateFaq({ faqId: req.params.faqId, ...req.body }));
  }),

  deleteFaq: asyncHandler(async (req, res) => {
    return sendSuccess(res, await siteService.deleteFaq(req.params.faqId));
  }),

  // ----- Admin: testimonials ------------------------------------------------

  listAdminTestimonials: asyncHandler(async (_req, res) => {
    return sendSuccess(res, await siteService.listTestimonials({ includeInactive: true }));
  }),

  createTestimonial: asyncHandler(async (req, res) => {
    return sendCreated(res, await siteService.createTestimonial(req.body));
  }),

  updateTestimonial: asyncHandler(async (req, res) => {
    return sendSuccess(
      res,
      await siteService.updateTestimonial({
        testimonialId: req.params.testimonialId,
        ...req.body,
      }),
    );
  }),

  deleteTestimonial: asyncHandler(async (req, res) => {
    return sendSuccess(res, await siteService.deleteTestimonial(req.params.testimonialId));
  }),

  // ----- Admin: hero slides -------------------------------------------------

  listAdminHeroSlides: asyncHandler(async (_req, res) => {
    return sendSuccess(res, await siteService.listHeroSlides({ includeInactive: true }));
  }),

  createHeroSlide: asyncHandler(async (req, res) => {
    return sendCreated(res, await siteService.createHeroSlide(req.body));
  }),

  updateHeroSlide: asyncHandler(async (req, res) => {
    return sendSuccess(
      res,
      await siteService.updateHeroSlide({ slideId: req.params.slideId, ...req.body }),
    );
  }),

  deleteHeroSlide: asyncHandler(async (req, res) => {
    return sendSuccess(res, await siteService.deleteHeroSlide(req.params.slideId));
  }),

  // ----- Admin: legal documents ---------------------------------------------

  listAdminLegalDocs: asyncHandler(async (_req, res) => {
    return sendSuccess(res, await siteService.listLegalDocs());
  }),

  saveLegalDoc: asyncHandler(async (req, res) => {
    return sendSuccess(res, await siteService.saveLegalDoc({ slug: req.params.slug, ...req.body }));
  }),
};
