export const COIN_TRANSACTION_TYPE = Object.freeze({
  PURCHASE: 'purchase',
  DAILY_BONUS: 'daily_bonus',
  SIGNUP_BONUS: 'signup_bonus',
  MESSAGE_CHARGE: 'message_charge',
  GAME_REWARD: 'game_reward',
  ROOM_ENTRY: 'room_entry',
  ADMIN_CREDIT: 'admin_credit',
  ADMIN_DEBIT: 'admin_debit',
  REFUND: 'refund',
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
