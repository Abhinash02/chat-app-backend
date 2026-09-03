import { z } from 'zod';

import { GENDER } from '#src/common/constants/index.js';

export const updateSettingsSchema = z
  .object({
    coins: z
      .object({
        freeTalkMinutes: z.number().int().min(0).max(1440).optional(),
        messagesPerBlock: z.number().int().min(1).max(1000).optional(),
        coinsPerBlock: z.number().int().min(0).max(10_000).optional(),
        dailyBonusCoins: z.number().int().min(0).max(10_000).optional(),
        dailyBonusIntervalHours: z.number().int().min(1).max(720).optional(),
        signupBonusCoins: z.number().int().min(0).max(10_000).optional(),
        chargedGenders: z.array(z.nativeEnum(GENDER)).max(2).optional(),
      })
      .strict()
      .optional(),
    chat: z
      .object({
        maxMessageLength: z.number().int().min(1).max(5000).optional(),
        autoGreetingText: z.string().trim().min(1).max(200).optional(),
        autoGreetingEnabled: z.boolean().optional(),
        heartbeatIntervalSeconds: z.number().int().min(5).max(120).optional(),
        typingIndicatorEnabled: z.boolean().optional(),
        requireVerifiedEmail: z.boolean().optional(),
      })
      .strict()
      .optional(),
    games: z
      .object({
        enabled: z.boolean().optional(),
        leaderboardSize: z.number().int().min(3).max(500).optional(),
        maxSessionsPerDay: z.number().int().min(1).max(1000).optional(),
        coinsPerPointConversion: z.number().min(0).max(100).optional(),
        pointsPerCoin: z.number().int().min(1).max(100_000).optional(),
        minPointsToConvert: z.number().int().min(1).max(100_000).optional(),
        pointsConversionEnabled: z.boolean().optional(),
      })
      .strict()
      .optional(),
    rooms: z
      .object({
        enabled: z.boolean().optional(),
        maxParticipants: z.number().int().min(2).max(100).optional(),
        voiceEnabled: z.boolean().optional(),
        entryCoinCost: z.number().int().min(0).max(10_000).optional(),
      })
      .strict()
      .optional(),
    discovery: z
      .object({
        defaultRadiusKm: z.number().int().min(1).max(500).optional(),
        maxRadiusKm: z.number().int().min(1).max(500).optional(),
        showDistance: z.boolean().optional(),
      })
      .strict()
      .optional(),
    payments: z
      .object({
        currency: z.string().trim().length(3).optional(),
        razorpayEnabled: z.boolean().optional(),
        manualUpiEnabled: z.boolean().optional(),
        upiId: z.string().trim().max(120).optional(),
        upiPayeeName: z.string().trim().max(120).optional(),
        upiQrImageUrl: z.string().trim().max(500_000).optional(),
        supportEmail: z.string().trim().email().optional(),
      })
      .strict()
      .optional(),
    moderation: z
      .object({
        profanityFilterEnabled: z.boolean().optional(),
        blockedWords: z.array(z.string().trim().min(1).max(50)).max(500).optional(),
      })
      .strict()
      .optional(),
    appVersion: z
      .object({
        latestVersion: z.string().trim().min(1).max(30).optional(),
        minimumVersion: z.string().trim().min(1).max(30).optional(),
        latestVersionCode: z.number().int().min(1).max(100_000).optional(),
        forceUpdate: z.boolean().optional(),
        playStoreUrl: z.string().trim().max(500).optional(),
        appStoreUrl: z.string().trim().max(500).optional(),
        updateMessage: z.string().trim().max(500).optional(),
      })
      .strict()
      .optional(),
    earnings: z
      .object({
        enabled: z.boolean().optional(),
        messagesPerReward: z.number().int().min(1).max(1000).optional(),
        rewardCoins: z.number().int().min(1).max(100).optional(),
        coinsPerRupee: z.number().int().min(1).max(10000).optional(),
        minWithdrawalCoins: z.number().int().min(1).max(100000).optional(),
        maxWithdrawalCoinsPerDay: z.number().int().min(1).max(100000).optional(),
        payoutProvider: z.string().trim().max(50).optional(),
      })
      .strict()
      .optional(),
    ads: z
      .object({
        homeBottomAdProvider: z.enum(['admin', 'admob', 'off']).optional(),
        admobBannerUnitId: z.string().trim().max(150).optional(),
        showSponsoredBadge: z.boolean().optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one settings group to update',
  });
