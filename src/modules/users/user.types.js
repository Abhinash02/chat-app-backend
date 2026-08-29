import { GENDER } from '#src/common/constants/index.js';

/**
 * The product is a boy<->girl chat app: discovery always returns the opposite
 * gender. Keeping that rule in one function means changing the matching model
 * later touches a single place.
 */
export function oppositeGenderOf(gender) {
  return gender === GENDER.MALE ? GENDER.FEMALE : GENDER.MALE;
}

/**
 * @typedef {object} PublicUserProfile
 * @property {string}  id
 * @property {string}  name
 * @property {string}  nickname
 * @property {'male'|'female'} gender
 * @property {string|null} avatarUrl
 * @property {string}  bio
 * @property {string[]} interests
 * @property {boolean} isOnline
 * @property {Date|null} lastSeenAt
 * @property {number}  gamePoints
 * @property {number|null} distanceKm  Present only on location-based discovery.
 */
