import mongoose from 'mongoose';

import { DEFAULT_SETTINGS, SETTINGS_SINGLETON_KEY } from '#src/modules/settings/settings.constants.js';

const coinsSchema = new mongoose.Schema(
  {
    freeTalkMinutes: { type: Number, min: 0, max: 1440, default: DEFAULT_SETTINGS.coins.freeTalkMinutes },
    messagesPerBlock: { type: Number, min: 1, max: 1000, default: DEFAULT_SETTINGS.coins.messagesPerBlock },
    coinsPerBlock: { type: Number, min: 0, max: 10_000, default: DEFAULT_SETTINGS.coins.coinsPerBlock },
    dailyBonusCoins: { type: Number, min: 0, max: 10_000, default: DEFAULT_SETTINGS.coins.dailyBonusCoins },
    dailyBonusIntervalHours: {
      type: Number,
      min: 1,
      max: 720,
      default: DEFAULT_SETTINGS.coins.dailyBonusIntervalHours,
    },
    signupBonusCoins: { type: Number, min: 0, max: 10_000, default: DEFAULT_SETTINGS.coins.signupBonusCoins },
    chargedGenders: { type: [String], default: DEFAULT_SETTINGS.coins.chargedGenders },
  },
  { _id: false },
);

const chatSchema = new mongoose.Schema(
  {
    maxMessageLength: { type: Number, min: 1, max: 5000, default: DEFAULT_SETTINGS.chat.maxMessageLength },
    autoGreetingText: { type: String, maxlength: 200, default: DEFAULT_SETTINGS.chat.autoGreetingText },
    autoGreetingEnabled: { type: Boolean, default: DEFAULT_SETTINGS.chat.autoGreetingEnabled },
    heartbeatIntervalSeconds: {
      type: Number,
      min: 5,
      max: 120,
      default: DEFAULT_SETTINGS.chat.heartbeatIntervalSeconds,
    },
    typingIndicatorEnabled: { type: Boolean, default: DEFAULT_SETTINGS.chat.typingIndicatorEnabled },
    requireVerifiedEmail: { type: Boolean, default: DEFAULT_SETTINGS.chat.requireVerifiedEmail },
  },
  { _id: false },
);

const gamesSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: DEFAULT_SETTINGS.games.enabled },
    leaderboardSize: { type: Number, min: 3, max: 500, default: DEFAULT_SETTINGS.games.leaderboardSize },
    maxSessionsPerDay: { type: Number, min: 1, max: 1000, default: DEFAULT_SETTINGS.games.maxSessionsPerDay },
    coinsPerPointConversion: {
      type: Number,
      min: 0,
      max: 100,
      default: DEFAULT_SETTINGS.games.coinsPerPointConversion,
    },
    pointsPerCoin: {
      type: Number,
      min: 1,
      max: 100_000,
      default: DEFAULT_SETTINGS.games.pointsPerCoin,
    },
    minPointsToConvert: {
      type: Number,
      min: 1,
      max: 100_000,
      default: DEFAULT_SETTINGS.games.minPointsToConvert,
    },
    pointsConversionEnabled: {
      type: Boolean,
      default: DEFAULT_SETTINGS.games.pointsConversionEnabled,
    },
  },
  { _id: false },
);

const roomsSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: DEFAULT_SETTINGS.rooms.enabled },
    maxParticipants: { type: Number, min: 2, max: 100, default: DEFAULT_SETTINGS.rooms.maxParticipants },
    voiceEnabled: { type: Boolean, default: DEFAULT_SETTINGS.rooms.voiceEnabled },
    entryCoinCost: { type: Number, min: 0, max: 10_000, default: DEFAULT_SETTINGS.rooms.entryCoinCost },
  },
  { _id: false },
);

const discoverySchema = new mongoose.Schema(
  {
    defaultRadiusKm: { type: Number, min: 1, max: 500, default: DEFAULT_SETTINGS.discovery.defaultRadiusKm },
    maxRadiusKm: { type: Number, min: 1, max: 500, default: DEFAULT_SETTINGS.discovery.maxRadiusKm },
    showDistance: { type: Boolean, default: DEFAULT_SETTINGS.discovery.showDistance },
  },
  { _id: false },
);

const paymentsSchema = new mongoose.Schema(
  {
    currency: { type: String, default: DEFAULT_SETTINGS.payments.currency },
    razorpayEnabled: { type: Boolean, default: DEFAULT_SETTINGS.payments.razorpayEnabled },
    manualUpiEnabled: { type: Boolean, default: DEFAULT_SETTINGS.payments.manualUpiEnabled },
    upiId: { type: String, default: DEFAULT_SETTINGS.payments.upiId },
    upiPayeeName: { type: String, default: DEFAULT_SETTINGS.payments.upiPayeeName },
    upiQrImageUrl: { type: String, default: DEFAULT_SETTINGS.payments.upiQrImageUrl },
    supportEmail: { type: String, default: DEFAULT_SETTINGS.payments.supportEmail },
  },
  { _id: false },
);

const moderationSchema = new mongoose.Schema(
  {
    profanityFilterEnabled: {
      type: Boolean,
      default: DEFAULT_SETTINGS.moderation.profanityFilterEnabled,
    },
    blockedWords: { type: [String], default: DEFAULT_SETTINGS.moderation.blockedWords },
  },
  { _id: false },
);

const appVersionSchema = new mongoose.Schema(
  {
    latestVersion: { type: String, default: DEFAULT_SETTINGS.appVersion.latestVersion },
    minimumVersion: { type: String, default: DEFAULT_SETTINGS.appVersion.minimumVersion },
    latestVersionCode: { type: Number, default: DEFAULT_SETTINGS.appVersion.latestVersionCode },
    forceUpdate: { type: Boolean, default: DEFAULT_SETTINGS.appVersion.forceUpdate },
    playStoreUrl: { type: String, default: DEFAULT_SETTINGS.appVersion.playStoreUrl },
    appStoreUrl: { type: String, default: DEFAULT_SETTINGS.appVersion.appStoreUrl },
    updateMessage: { type: String, default: DEFAULT_SETTINGS.appVersion.updateMessage },
  },
  { _id: false },
);

const earningsSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: DEFAULT_SETTINGS.earnings.enabled },
    messagesPerReward: {
      type: Number,
      min: 1,
      max: 1000,
      default: DEFAULT_SETTINGS.earnings.messagesPerReward,
    },
    rewardCoins: {
      type: Number,
      min: 1,
      max: 100,
      default: DEFAULT_SETTINGS.earnings.rewardCoins,
    },
    coinsPerRupee: {
      type: Number,
      min: 1,
      max: 10000,
      default: DEFAULT_SETTINGS.earnings.coinsPerRupee,
    },
    minWithdrawalCoins: {
      type: Number,
      min: 1,
      max: 100000,
      default: DEFAULT_SETTINGS.earnings.minWithdrawalCoins,
    },
    maxWithdrawalCoinsPerDay: {
      type: Number,
      min: 1,
      max: 100000,
      default: DEFAULT_SETTINGS.earnings.maxWithdrawalCoinsPerDay,
    },
    payoutProvider: {
      type: String,
      default: DEFAULT_SETTINGS.earnings.payoutProvider,
    },
  },
  { _id: false },
);

const adsSchema = new mongoose.Schema(
  {
    homeBottomAdProvider: {
      type: String,
      enum: ['admin', 'admob', 'off'],
      default: DEFAULT_SETTINGS.ads.homeBottomAdProvider,
    },
    admobBannerUnitId: {
      type: String,
      default: DEFAULT_SETTINGS.ads.admobBannerUnitId,
    },
    showSponsoredBadge: {
      type: Boolean,
      default: DEFAULT_SETTINGS.ads.showSponsoredBadge,
    },
  },
  { _id: false },
);

const referralSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: DEFAULT_SETTINGS.referral.enabled },
    boyToBoy: { type: Number, min: 0, max: 10_000, default: DEFAULT_SETTINGS.referral.boyToBoy },
    boyToGirl: { type: Number, min: 0, max: 10_000, default: DEFAULT_SETTINGS.referral.boyToGirl },
    girlToBoy: { type: Number, min: 0, max: 10_000, default: DEFAULT_SETTINGS.referral.girlToBoy },
    girlToGirl: { type: Number, min: 0, max: 10_000, default: DEFAULT_SETTINGS.referral.girlToGirl },
  },
  { _id: false },
);

const settingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: SETTINGS_SINGLETON_KEY, unique: true, immutable: true },
    coins: { type: coinsSchema, default: () => ({}) },
    chat: { type: chatSchema, default: () => ({}) },
    games: { type: gamesSchema, default: () => ({}) },
    rooms: { type: roomsSchema, default: () => ({}) },
    discovery: { type: discoverySchema, default: () => ({}) },
    payments: { type: paymentsSchema, default: () => ({}) },
    moderation: { type: moderationSchema, default: () => ({}) },
    appVersion: { type: appVersionSchema, default: () => ({}) },
    earnings: { type: earningsSchema, default: () => ({}) },
    ads: { type: adsSchema, default: () => ({}) },
    referral: { type: referralSchema, default: () => ({}) },
    updatedByAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

export const SettingsModel = mongoose.model('AppSettings', settingsSchema);
