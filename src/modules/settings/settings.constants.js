/** There is exactly one settings document; this is its stable key. */
export const SETTINGS_SINGLETON_KEY = 'default';

/**
 * Defaults match the launch business rules. Everything here is editable from
 * the admin panel at runtime — code must never hard-code these numbers again.
 */
export const DEFAULT_SETTINGS = Object.freeze({
  coins: {
    /** One-off free chat allowance for paying accounts, in minutes. */
    freeTalkMinutes: 30,
    /** Messages granted per charge once the free allowance is exhausted. */
    messagesPerBlock: 7,
    /** Coins deducted to unlock one block of messages. */
    coinsPerBlock: 10,
    /** Recurring top-up for paying accounts. */
    dailyBonusCoins: 25,
    dailyBonusIntervalHours: 24,
    /** Coins credited once, at signup. */
    signupBonusCoins: 0,
    /** Genders billed for messaging. Everyone else chats free. */
    chargedGenders: ['male'],
  },
  chat: {
    maxMessageLength: 1000,
    /** Text auto-sent when a paying user opens a brand new conversation. */
    autoGreetingText: 'Hi',
    autoGreetingEnabled: true,
    /** Seconds of free allowance consumed per heartbeat tick. */
    heartbeatIntervalSeconds: 15,
    typingIndicatorEnabled: true,
    /**
     * Whether an unverified account may browse and chat.
     *
     * Off by default so signup goes straight into the app. Turn it on if
     * throwaway accounts become a problem — verification still happens either
     * way, this only decides whether it blocks anything.
     */
    requireVerifiedEmail: false,
  },
  games: {
    enabled: true,
    leaderboardSize: 50,
    /** Guard against a client replaying a high score endlessly. */
    maxSessionsPerDay: 50,
    coinsPerPointConversion: 0,
    /** Game points needed to exchange for 1 coin (e.g. 100 points = 1 coin, so 2000 points = 20 coins). */
    pointsPerCoin: 100,
    /** Minimum points a user must have to trigger a conversion. */
    minPointsToConvert: 100,
    /** Master toggle for points to coins conversion. */
    pointsConversionEnabled: true,
  },
  rooms: {
    enabled: true,
    maxParticipants: 12,
    voiceEnabled: true,
    /** Rooms are free by product decision; kept configurable for later. */
    entryCoinCost: 0,
  },
  discovery: {
    defaultRadiusKm: 50,
    maxRadiusKm: 500,
    showDistance: true,
  },
  payments: {
    currency: 'INR',
    razorpayEnabled: true,
    manualUpiEnabled: true,
    upiId: '',
    upiPayeeName: '',
    /** Data URI or hosted URL of the static UPI QR shown in the app. */
    upiQrImageUrl: '',
    supportEmail: 'support@vibechat.app',
  },
  moderation: {
    profanityFilterEnabled: true,
    blockedWords: [],
  },
  appVersion: {
    latestVersion: '1.0.0',
    minimumVersion: '1.0.0',
    latestVersionCode: 1,
    forceUpdate: false,
    playStoreUrl: 'https://play.google.com/store/apps/details?id=app.vibechat.mobile',
    appStoreUrl: 'https://apps.apple.com/app/id123456789',
    updateMessage: 'A new and improved version of Vibe is available. Update now for the best experience!',
  },
  earnings: {
    enabled: true,
    messagesPerReward: 25,
    rewardCoins: 1,
    coinsPerRupee: 1,
    minWithdrawalCoins: 5,
    maxWithdrawalCoinsPerDay: 5000,
    payoutProvider: 'cashfree',
  },
});
