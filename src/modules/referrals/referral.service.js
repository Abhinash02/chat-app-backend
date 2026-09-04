import crypto from 'node:crypto';

import { logger } from '#src/config/logger.js';
import { resolvePagination, buildPaginationMeta } from '#src/common/utils/pagination.util.js';
import { coinsService } from '#src/modules/coins/coins.service.js';
import { COIN_TRANSACTION_TYPE } from '#src/modules/coins/coins.constants.js';
import { settingsService } from '#src/modules/settings/settings.service.js';
import { userRepository } from '#src/modules/users/user.repository.js';
import { referralRepository } from '#src/modules/referrals/referral.repository.js';

/**
 * Generates a short, URL-safe referral code.
 * We use crypto.randomBytes so there is no extra dependency.
 * 6 bytes → 8 base64url chars → ~281 trillion combinations.
 */
function generateCode() {
  return crypto.randomBytes(6).toString('base64url').toUpperCase();
}

/**
 * Called at registration to generate and persist the new user's own
 * referral code.  Retries once on the (extremely unlikely) collision.
 */
async function generateReferralCode(userId) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = generateCode();
    try {
      await userRepository.updateById(userId, { $set: { referralCode: code } });
      return code;
    } catch (err) {
      // Duplicate key — try again
      if (err?.code === 11000) continue;
      throw err;
    }
  }
  logger.warn({ userId: String(userId) }, 'Could not generate unique referral code after 3 attempts');
  return null;
}

/**
 * Build the share link for a given referral code.
 * Deep-link format matches the Expo linking config.
 * Falls back to a web URL that the app intercepts.
 */
function buildReferralLink(code) {
  const baseUrl = process.env.APP_DEEP_LINK_BASE ?? 'https://app.vibechat.app';
  return `${baseUrl}/register?ref=${code}`;
}

/**
 * Look up a referrer by code. Returns null if the code is invalid or the
 * referral feature is disabled — the caller decides whether to surface the error.
 */
async function findReferrerByCode(code) {
  if (!code) return null;
  return userRepository.findByReferralCode(code);
}

/**
 * Reward logic — maps referrer + referee gender to the configured coin amount.
 */
function resolveRewardCoins(referrerGender, refereeGender, referralSettings) {
  const rg = String(referrerGender).toLowerCase();
  const eg = String(refereeGender).toLowerCase();

  if (rg === 'male' && eg === 'male') return referralSettings.boyToBoy ?? 0;
  if (rg === 'male' && eg === 'female') return referralSettings.boyToGirl ?? 0;
  if (rg === 'female' && eg === 'male') return referralSettings.girlToBoy ?? 0;
  if (rg === 'female' && eg === 'female') return referralSettings.girlToGirl ?? 0;
  return 0;
}

/**
 * Apply a referral after a user successfully registers.
 *
 * This is always called fire-and-forget from `auth.service.js`; any error
 * is swallowed so it can never block or roll back the signup.
 *
 * @param {Object} options
 * @param {import('mongoose').Types.ObjectId} options.refereeId   - newly registered user
 * @param {string}                            options.refereeGender
 * @param {string}                            options.code        - referral code provided at signup
 */
async function applyReferral({ refereeId, refereeGender, code }) {
  const referralSettings = await settingsService.getReferralSettings();

  if (!referralSettings?.enabled) {
    logger.info({ refereeId: String(refereeId) }, 'Referral skipped — feature disabled');
    return;
  }

  const referrer = await findReferrerByCode(code);
  if (!referrer) {
    logger.warn({ code }, 'Referral code not found or invalid');
    return;
  }

  // Prevent self-referral (safety net)
  if (String(referrer._id) === String(refereeId)) {
    logger.warn({ code }, 'Self-referral attempt ignored');
    return;
  }

  // Each user can only be referred once
  const alreadyReferred = await referralRepository.existsByReferee(refereeId);
  if (alreadyReferred) {
    logger.warn({ refereeId: String(refereeId) }, 'User already has a referral record — skipping');
    return;
  }

  const rewardCoins = resolveRewardCoins(referrer.gender, refereeGender, referralSettings);

  // Persist the referral record
  let referralDoc;
  try {
    referralDoc = await referralRepository.create({
      referrerId: referrer._id,
      refereeId,
      referralCode: code,
      referrerGender: referrer.gender,
      refereeGender,
      rewardCoins,
      status: 'completed',
    });
  } catch (err) {
    // Possible duplicate on refereeId — someone raced a second registration
    logger.warn({ err, refereeId: String(refereeId) }, 'Referral record creation conflict');
    return;
  }

  // Mark the referee as referred-by (store referrer ID)
  await userRepository.updateById(refereeId, { $set: { referredBy: referrer._id } }).catch((err) => {
    logger.warn({ err }, 'Could not set referredBy on user');
  });

  // Credit the referrer's wallet (0 coins = no-op, no transaction noise)
  if (rewardCoins > 0) {
    await coinsService
      .creditCoins({
        userId: referrer._id,
        gender: referrer.gender,
        amount: rewardCoins,
        type: COIN_TRANSACTION_TYPE.REFERRAL_BONUS,
        description: `Referral bonus — friend joined the app`,
        referenceId: String(referralDoc._id),
        metadata: { refereeId: String(refereeId), refereeGender },
        extra: { totalBonusCoins: rewardCoins },
      })
      .catch((err) => {
        logger.error(
          { err, referrerId: String(referrer._id), rewardCoins },
          'Referral coin credit failed',
        );
      });
  }

  logger.info(
    { referrerId: String(referrer._id), refereeId: String(refereeId), rewardCoins },
    'Referral applied',
  );
}

/**
 * Return the calling user's referral code, generating one if missing.
 */
async function getMyCode(userId) {
  const user = await userRepository.findById(userId);
  let code = user?.referralCode;
  if (!code) {
    code = await generateReferralCode(userId);
  }
  const referralSettings = await settingsService.getReferralSettings();
  return {
    code,
    link: buildReferralLink(code),
    gender: user?.gender || 'other',
    rewards: {
      boyToBoy: referralSettings?.boyToBoy ?? 10,
      boyToGirl: referralSettings?.boyToGirl ?? 10,
      girlToBoy: referralSettings?.girlToBoy ?? 10,
      girlToGirl: referralSettings?.girlToGirl ?? 10,
      enabled: referralSettings?.enabled ?? true,
    },
  };
}

/**
 * Paginated referral history for a user (their outgoing referrals).
 */
async function getMyHistory(userId, query) {
  const { page, skip, limit } = resolvePagination(query);
  const { docs, total } = await referralRepository.findByReferrer(userId, { skip, limit });
  return {
    data: docs,
    meta: buildPaginationMeta({ page, limit, total }),
  };
}

/**
 * Aggregate stats for a user.
 */
async function getMyStats(userId) {
  return referralRepository.statsByReferrer(userId);
}

/**
 * Admin: all referrals across the platform.
 */
async function adminListAll(query) {
  const { page, skip, limit } = resolvePagination(query);
  const { docs, total } = await referralRepository.findAll({ skip, limit });
  return {
    data: docs,
    meta: buildPaginationMeta({ page, limit, total }),
  };
}

/**
 * Admin: platform-wide totals.
 */
async function adminGlobalStats() {
  return referralRepository.globalStats();
}

export const referralService = {
  generateReferralCode,
  buildReferralLink,
  applyReferral,
  getMyCode,
  getMyHistory,
  getMyStats,
  adminListAll,
  adminGlobalStats,
};
