/** Actions worth an audit trail — anything that moves money or restricts an account. */
export const ADMIN_ACTION = Object.freeze({
  USER_SUSPENDED: 'user.suspended',
  USER_REACTIVATED: 'user.reactivated',
  USER_DELETED: 'user.deleted',
  USER_FORCE_LOGGED_OUT: 'user.force_logged_out',
  COINS_ADJUSTED: 'coins.adjusted',
  FREE_TALK_RESET: 'coins.free_talk_reset',
  PAYMENT_APPROVED: 'payment.approved',
  PAYMENT_REJECTED: 'payment.rejected',
  SETTINGS_UPDATED: 'settings.updated',
  THEME_ACTIVATED: 'theme.activated',
  PACKAGE_CREATED: 'package.created',
  PACKAGE_UPDATED: 'package.updated',
  PACKAGE_DELETED: 'package.deleted',
});
