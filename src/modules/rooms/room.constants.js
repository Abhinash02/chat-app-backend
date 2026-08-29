export const ROOM_STATUS = Object.freeze({
  LIVE: 'live',
  CLOSED: 'closed',
});

export const ROOM_ROLE = Object.freeze({
  HOST: 'host',
  SPEAKER: 'speaker',
  LISTENER: 'listener',
});

/**
 * Voice runs as a peer-to-peer WebRTC mesh: the server only relays session
 * descriptions and ICE candidates between participants and never carries audio.
 * That keeps rooms free to operate, at the cost of scaling — hence the
 * admin-configurable participant cap.
 */
export const VOICE_SIGNAL_TYPE = Object.freeze({
  OFFER: 'offer',
  ANSWER: 'answer',
  ICE_CANDIDATE: 'ice-candidate',
});
