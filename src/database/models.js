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
import '#src/modules/admin/admin-audit.model.js';
