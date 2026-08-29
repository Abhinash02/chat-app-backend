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
