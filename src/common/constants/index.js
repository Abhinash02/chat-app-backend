export const GENDER = Object.freeze({
  MALE: 'male',
  FEMALE: 'female',
});

export const USER_ROLE = Object.freeze({
  USER: 'user',
  ADMIN: 'admin',
  SUPER_ADMIN: 'super_admin',
});

export const USER_STATUS = Object.freeze({
  PENDING_VERIFICATION: 'pending_verification',
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  DELETED: 'deleted',
});

export const PRESENCE = Object.freeze({
  ONLINE: 'online',
  OFFLINE: 'offline',
});

export const MAX_PAGE_SIZE = 50;
export const DEFAULT_PAGE_SIZE = 20;

/** Nearby discovery is capped so a crafted radius cannot scan the whole table. */
export const MAX_DISCOVERY_RADIUS_KM = 500;
export const DEFAULT_DISCOVERY_RADIUS_KM = 50;

/**
 * Languages a user can say they are comfortable talking in.
 *
 * India-first and deliberately short: this is a "who can I actually hold a
 * conversation with" filter, not a census. The value stored on the user is the
 * `code`, so a label can be reworded later without a migration, and the mobile
 * app keeps a mirror of this list for the signup screen — which runs before
 * there is a token to fetch anything with.
 */
export const SPOKEN_LANGUAGES = Object.freeze([
  { code: 'hindi', label: 'Hindi', native: 'हिन्दी' },
  { code: 'english', label: 'English', native: 'English' },
  { code: 'punjabi', label: 'Punjabi', native: 'ਪੰਜਾਬੀ' },
  { code: 'marathi', label: 'Marathi', native: 'मराठी' },
  { code: 'gujarati', label: 'Gujarati', native: 'ગુજરાતી' },
  { code: 'bengali', label: 'Bengali', native: 'বাংলা' },
  { code: 'tamil', label: 'Tamil', native: 'தமிழ்' },
  { code: 'telugu', label: 'Telugu', native: 'తెలుగు' },
  { code: 'kannada', label: 'Kannada', native: 'ಕನ್ನಡ' },
  { code: 'malayalam', label: 'Malayalam', native: 'മലയാളം' },
  { code: 'odia', label: 'Odia', native: 'ଓଡ଼ିଆ' },
  { code: 'urdu', label: 'Urdu', native: 'اردو' },
  { code: 'assamese', label: 'Assamese', native: 'অসমীয়া' },
  { code: 'bhojpuri', label: 'Bhojpuri', native: 'भोजपुरी' },
  { code: 'rajasthani', label: 'Rajasthani', native: 'राजस्थानी' },
  { code: 'haryanvi', label: 'Haryanvi', native: 'हरियाणवी' },
]);

export const SPOKEN_LANGUAGE_CODES = Object.freeze(SPOKEN_LANGUAGES.map((entry) => entry.code));

/** Enough to describe anyone honestly; few enough that the filter still means something. */
export const MAX_LANGUAGES_PER_USER = 5;
