export const COIN_TRANSACTION_TYPE = Object.freeze({
  PURCHASE: 'purchase',
  DAILY_BONUS: 'daily_bonus',
  SIGNUP_BONUS: 'signup_bonus',
  MESSAGE_CHARGE: 'message_charge',
  GAME_REWARD: 'game_reward',
  CHAT_EARNING: 'chat_earning',
  WITHDRAWAL: 'withdrawal',
  WITHDRAWAL_REFUND: 'withdrawal_refund',
  ROOM_ENTRY: 'room_entry',
  ADMIN_CREDIT: 'admin_credit',
  ADMIN_DEBIT: 'admin_debit',
  REFUND: 'refund',
  REFERRAL_BONUS: 'referral_bonus',
});

/** Why a message was allowed through — surfaced to the client for the UI copy. */
export const BILLING_OUTCOME = Object.freeze({
  /** Account's gender is not billed at all (girls chat free, unlimited). */
  FREE_GENDER: 'free_gender',
  /** Covered by the 30-minute introductory allowance. */
  FREE_TALK: 'free_talk',
  /** Covered by a block of messages already paid for. */
  PREPAID_BLOCK: 'prepaid_block',
  /** This message triggered a new block purchase. */
  BLOCK_PURCHASED: 'block_purchased',
});

export const COIN_TRANSACTION_DIRECTION = Object.freeze({
  CREDIT: 'credit',
  DEBIT: 'debit',
});

/**
 * What one message costs against the introductory free-talk allowance.
 *
 * The allowance is measured in seconds and was only ever burned down by the
 * chat screen's socket heartbeat. That made it a time budget that messaging
 * never touched: an account whose heartbeat did not arrive — app backgrounded,
 * flaky network, a client that simply never emits it — kept `freeTalkSeconds
 * Remaining > 0` forever and chatted free forever with it.
 *
 * Charging the allowance on send as well closes that, and does it in the
 * allowance's own unit so the two paths draw on one budget instead of two.
 * At the default 30 minutes this caps the free period at 180 messages, which
 * is far more than a real conversation reaches inside half an hour — so it
 * bites only on the abuse it exists to stop.
 */
export const FREE_TALK_SECONDS_PER_MESSAGE = 10;
