/**
 * Account deletion is a request that an administrator reviews, not something
 * the app performs on its own. These are the states that request moves through
 * and the reasons someone can give for opening one.
 */
export const DELETION_REQUEST_STATUS = Object.freeze({
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  /** Withdrawn by the account holder before anyone reviewed it. */
  CANCELLED: 'cancelled',
});

/**
 * A fixed list rather than free text.
 *
 * Free text cannot be counted, and the point of asking is to learn why people
 * leave. `OTHER` still takes a written note so nobody is forced into a box that
 * does not fit — the schema requires the detail in that case.
 */
export const DELETION_REASON = Object.freeze({
  PRIVACY: 'privacy',
  NOT_USEFUL: 'not_useful',
  TOO_MANY_NOTIFICATIONS: 'too_many_notifications',
  HARASSMENT: 'harassment',
  FOUND_ALTERNATIVE: 'found_alternative',
  TEMPORARY_BREAK: 'temporary_break',
  OTHER: 'other',
});

/**
 * The window quoted to the person waiting.
 *
 * It is a promise about review turnaround, not a timer: nothing approves itself
 * when this elapses. An account is only ever closed by an administrator acting
 * on the request.
 */
export const REVIEW_WINDOW_HOURS = 24;
