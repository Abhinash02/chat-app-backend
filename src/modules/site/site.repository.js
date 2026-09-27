import { EventModel } from '#src/modules/events/event.model.js';
import { BlogPostModel } from '#src/modules/site/blog-post.model.js';
import { HeroSlideModel } from '#src/modules/site/hero-slide.model.js';
import { LegalDocModel } from '#src/modules/site/legal-doc.model.js';
import { SiteAppearanceModel } from '#src/modules/site/site-appearance.model.js';
import { FaqModel } from '#src/modules/site/faq.model.js';
import { TestimonialModel } from '#src/modules/site/testimonial.model.js';
import { BLOG_STATUS } from '#src/modules/site/site.constants.js';

class SiteRepository {
  // ----- Blog ---------------------------------------------------------------

  async createPost(data) {
    const doc = await BlogPostModel.create(data);
    return doc.toObject();
  }

  async findPostById(id) {
    return BlogPostModel.findById(id).lean().exec();
  }

  async findPostBySlug(slug, { publishedOnly = true } = {}) {
    const filter = { slug };
    if (publishedOnly) filter.status = BLOG_STATUS.PUBLISHED;
    return BlogPostModel.findOne(filter).lean().exec();
  }

  async slugExists(slug) {
    return Boolean(await BlogPostModel.exists({ slug }));
  }

  async updatePostById(id, update) {
    return BlogPostModel.findByIdAndUpdate(id, update, { new: true, runValidators: true })
      .lean()
      .exec();
  }

  async deletePostById(id) {
    return BlogPostModel.findByIdAndDelete(id).lean().exec();
  }

  /** The public list never sees drafts; the admin list sees everything. */
  async listPosts({ status, tag, search, page = 1, limit = 12 } = {}) {
    const skip = (page - 1) * limit;
    const filter = {};

    if (status && status !== 'all') filter.status = status;
    if (tag) filter.tags = tag;
    if (search?.trim()) filter.title = { $regex: search.trim(), $options: 'i' };

    const [items, total] = await Promise.all([
      BlogPostModel.find(filter)
        // `content` is the body of an article; a list of twelve of them should
        // not ship twelve articles' worth of text to render cards.
        .select('-content')
        .sort({ publishedAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      BlogPostModel.countDocuments(filter).exec(),
    ]);

    return { items, total };
  }

  async incrementPostViews(id) {
    return BlogPostModel.updateOne({ _id: id }, { $inc: { viewCount: 1 } }).exec();
  }

  // ----- FAQ ----------------------------------------------------------------

  async listFaqs({ activeOnly = true } = {}) {
    const filter = activeOnly ? { isActive: true } : {};
    return FaqModel.find(filter).sort({ category: 1, order: 1, createdAt: 1 }).lean().exec();
  }

  async createFaq(data) {
    const doc = await FaqModel.create(data);
    return doc.toObject();
  }

  async updateFaqById(id, update) {
    return FaqModel.findByIdAndUpdate(id, update, { new: true, runValidators: true }).lean().exec();
  }

  async deleteFaqById(id) {
    return FaqModel.findByIdAndDelete(id).lean().exec();
  }

  // ----- Testimonials -------------------------------------------------------

  async listTestimonials({ activeOnly = true } = {}) {
    const filter = activeOnly ? { isActive: true } : {};
    return TestimonialModel.find(filter).sort({ order: 1, createdAt: -1 }).lean().exec();
  }

  async createTestimonial(data) {
    const doc = await TestimonialModel.create(data);
    return doc.toObject();
  }

  async updateTestimonialById(id, update) {
    return TestimonialModel.findByIdAndUpdate(id, update, { new: true, runValidators: true })
      .lean()
      .exec();
  }

  async deleteTestimonialById(id) {
    return TestimonialModel.findByIdAndDelete(id).lean().exec();
  }

  // ----- Hero slides --------------------------------------------------------

  async listHeroSlides({ activeOnly = true } = {}) {
    const filter = activeOnly ? { isActive: true } : {};
    return HeroSlideModel.find(filter).sort({ order: 1, createdAt: 1 }).lean().exec();
  }

  async createHeroSlide(data) {
    const doc = await HeroSlideModel.create(data);
    return doc.toObject();
  }

  async updateHeroSlideById(id, update) {
    return HeroSlideModel.findByIdAndUpdate(id, update, { new: true, runValidators: true })
      .lean()
      .exec();
  }

  async deleteHeroSlideById(id) {
    return HeroSlideModel.findByIdAndDelete(id).lean().exec();
  }

  // ----- Announcements ------------------------------------------------------

  /*
   * Reads the events collection the admin panel already manages, rather than
   * introducing a second one. An announcement on the website and an
   * announcement in the app are the same thing written once.
   *
   * Only what is live right now: inactive rows, ones scheduled for later, and
   * ones whose window has closed are all excluded here rather than filtered in
   * the client, so an unpublished draft is never sent to a browser.
   */
  announcementFilter() {
    const now = new Date();
    return {
      isActive: true,
      startsAt: { $lte: now },
      $or: [{ endsAt: null }, { endsAt: { $gte: now } }],
      // App-only posts never appear on the website.
      visibility: { $in: ['website', 'both'] },
    };
  }

  async listAnnouncements({ page = 1, limit = 12 } = {}) {
    const skip = (page - 1) * limit;
    const filter = this.announcementFilter();

    const [items, total] = await Promise.all([
      EventModel.find(filter).sort({ startsAt: -1 }).skip(skip).limit(limit).lean().exec(),
      EventModel.countDocuments(filter).exec(),
    ]);

    return { items, total };
  }

  async findAnnouncementById(id) {
    return EventModel.findOne({ _id: id, ...this.announcementFilter() }).lean().exec();
  }

  // ----- Legal documents ----------------------------------------------------

  async findLegalDoc(slug) {
    return LegalDocModel.findOne({ slug }).lean().exec();
  }

  async listLegalDocs() {
    return LegalDocModel.find({}).sort({ slug: 1 }).lean().exec();
  }

  /*
   * Upsert rather than create-or-update at the call site: there is exactly one
   * document per slug, and an admin editing a policy that has never been saved
   * should not have to create it first.
   */
  // ----- Appearance ---------------------------------------------------------

  /* Upsert, so the first read creates the document with its defaults rather
     than returning null and making every caller handle "not configured yet". */
  async findOrCreateAppearance() {
    return SiteAppearanceModel.findOneAndUpdate(
      { key: 'default' },
      { $setOnInsert: { key: 'default' } },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    )
      .lean()
      .exec();
  }

  async updateAppearance(data) {
    return SiteAppearanceModel.findOneAndUpdate(
      { key: 'default' },
      { $set: data },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
    )
      .lean()
      .exec();
  }

  async upsertLegalDoc(slug, data) {
    return LegalDocModel.findOneAndUpdate(
      { slug },
      { $set: { ...data, slug } },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
    )
      .lean()
      .exec();
  }
}

export const siteRepository = new SiteRepository();
