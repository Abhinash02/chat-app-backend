/**
 * Imports every Mongoose model for its registration side effect.
 *
 * Tools that operate across all collections (index sync, seeding, ad-hoc
 * scripts) need the full registry, which only exists once each module has been
 * imported. Add new models here when you create them.
 */
import '#src/modules/users/user.model.js';
import '#src/modules/auth/otp.model.js';
import '#src/modules/auth/refresh-token.model.js';
import '#src/modules/coins/wallet.model.js';
import '#src/modules/coins/coin-transaction.model.js';
import '#src/modules/coins/coin-package.model.js';
import '#src/modules/chat/conversation.model.js';
import '#src/modules/chat/message.model.js';
import '#src/modules/rooms/room.model.js';
import '#src/modules/rooms/room-message.model.js';
import '#src/modules/games/game-session.model.js';
import '#src/modules/payments/payment.model.js';
import '#src/modules/reports/report.model.js';
import '#src/modules/settings/settings.model.js';
import '#src/modules/theme/theme.model.js';
import '#src/modules/banners/banner.model.js';
import '#src/modules/notifications/device-token.model.js';
import '#src/modules/notifications/campaign.model.js';
import '#src/modules/notifications/email-template.model.js';
import '#src/modules/notifications/in-app-notification.model.js';
import '#src/modules/admin/admin-audit.model.js';
import '#src/modules/account-deletion/deletion.model.js';

/*
 * These ten were missing, and the omission was invisible in development.
 *
 * `autoIndex` is on outside production (see config/database.js), so locally
 * Mongoose builds each schema's indexes on first use whether or not the model
 * is listed here. In production it is off, and `syncIndexes()` only walks
 * `mongoose.models` — which holds exactly what this file imported. So these
 * collections ran with no indexes at all: no TTL on statuses or system logs
 * (nothing ever expired), and no unique constraint on redeem codes, referral
 * recipients or support ticket ids, which are correctness rather than speed.
 */
import '#src/modules/banners/banner-click.model.js';
import '#src/modules/events/event.model.js';
import '#src/modules/feedback/feedback.model.js';
import '#src/modules/payments/redeem-code.model.js';
import '#src/modules/posts/post.model.js';
import '#src/modules/referrals/referral.model.js';
import '#src/modules/status/status.model.js';
import '#src/modules/support/support.model.js';
import '#src/modules/system-logs/system-log.model.js';
import '#src/modules/withdrawals/withdrawal.model.js';

/* Marketing website content, owned by the admin panel. */
import '#src/modules/site/blog-post.model.js';
import '#src/modules/site/faq.model.js';
import '#src/modules/site/testimonial.model.js';
import '#src/modules/site/hero-slide.model.js';
import '#src/modules/site/legal-doc.model.js';
import '#src/modules/site/site-appearance.model.js';
