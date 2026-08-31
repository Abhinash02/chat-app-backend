export const PAYMENT_STATUS = Object.freeze({
  /** Order created locally, provider order issued, nothing paid yet. */
  CREATED: 'created',
  /** Manual UPI: the user says they paid; an admin must confirm. */
  AWAITING_VERIFICATION: 'awaiting_verification',
  PAID: 'paid',
  FAILED: 'failed',
  REJECTED: 'rejected',
  EXPIRED: 'expired',
  REFUNDED: 'refunded',
});

/** Orders left unpaid longer than this are swept to `expired`. */
export const ORDER_EXPIRY_MINUTES = 30;
