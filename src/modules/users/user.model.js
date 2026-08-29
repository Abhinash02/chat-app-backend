import mongoose from 'mongoose';

import { GENDER, USER_ROLE, USER_STATUS } from '#src/common/constants/index.js';

const locationSchema = new mongoose.Schema(
  {
    // GeoJSON order is [longitude, latitude] — not the human-readable order.
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], default: undefined },
    city: { type: String, trim: true, maxlength: 120 },
    country: { type: String, trim: true, maxlength: 120 },
    updatedAt: { type: Date },
  },
  { _id: false },
);

const preferencesSchema = new mongoose.Schema(
  {
    shareLocation: { type: Boolean, default: true },
    showOnlineStatus: { type: Boolean, default: true },
    pushEnabled: { type: Boolean, default: true },
    soundEnabled: { type: Boolean, default: true },
    /** Which sound the app plays for an incoming message. */
    notificationSound: { type: String, maxlength: 40, default: 'default' },
    /**
     * Promotional mail only. Transactional mail (OTP, password reset, payment
     * receipts) ignores this flag — a user who opts out of marketing must still
     * be able to receive the code that lets them sign in.
     */
    marketingEmails: { type: Boolean, default: true },
  },
  { _id: false },
);

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 60 },
    nickname: { type: String, required: true, trim: true, minlength: 2, maxlength: 24 },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 160,
    },
    passwordHash: { type: String, required: true, select: false },

    gender: { type: String, enum: Object.values(GENDER), required: true, immutable: true },
    role: { type: String, enum: Object.values(USER_ROLE), default: USER_ROLE.USER, index: true },
    status: {
      type: String,
      enum: Object.values(USER_STATUS),
      default: USER_STATUS.PENDING_VERIFICATION,
      index: true,
    },

    avatarUrl: { type: String, default: null },
    avatarStorageKey: { type: String, default: null, select: false },
    bio: { type: String, trim: true, maxlength: 240, default: '' },
    interests: { type: [String], default: [] },

    emailVerifiedAt: { type: Date, default: null },
    /** Any token issued before this instant is rejected (password change, forced logout). */
    tokensValidFrom: { type: Date, default: null },

    isOnline: { type: Boolean, default: false, index: true },
    lastSeenAt: { type: Date, default: null },
    /** Reference count of live sockets, so a second device does not mark the user offline. */
    activeConnections: { type: Number, default: 0, min: 0 },

    location: { type: locationSchema, default: () => ({}) },
    preferences: { type: preferencesSchema, default: () => ({}) },

    /** Denormalised from the games module so the leaderboard is a single read. */
    gamePoints: { type: Number, default: 0, min: 0, index: true },

    blockedUserIds: { type: [mongoose.Schema.Types.ObjectId], ref: 'User', default: [] },

    suspendedReason: { type: String, default: null },
    lastLoginAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        delete ret.passwordHash;
        delete ret.avatarStorageKey;
        delete ret.__v;
        return ret;
      },
    },
  },
);

userSchema.index({ email: 1 }, { unique: true });
userSchema.index(
  { nickname: 1 },
  { unique: true, collation: { locale: 'en', strength: 2 } },
);
// Drives the "active users of the opposite gender" discovery query.
userSchema.index({ gender: 1, status: 1, isOnline: -1, lastSeenAt: -1 });
userSchema.index({ 'location.coordinates': '2dsphere' });

userSchema.virtual('hasLocation').get(function hasLocation() {
  return Array.isArray(this.location?.coordinates) && this.location.coordinates.length === 2;
});

export const UserModel = mongoose.model('User', userSchema);
