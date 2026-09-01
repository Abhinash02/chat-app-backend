import { logger } from '#src/config/logger.js';

/**
 * Calculates geographic distance (in kilometers) between two coordinates
 * using the Haversine formula.
 */
export function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  if (
    lat1 === undefined ||
    lon1 === undefined ||
    lat2 === undefined ||
    lon2 === undefined ||
    lat1 === null ||
    lon1 === null ||
    lat2 === null ||
    lon2 === null
  ) {
    return null;
  }

  const R = 6371; // Earth's radius in kilometers
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10; // Rounded to 1 decimal place (e.g., 4.2 km)
}

class RandomCallManager {
  constructor() {
    /**
     * Map of active seekers in the matchmaking pool.
     * Key: userId -> Value: { userId, socketId, socket, user, location, isVideo, joinedAt }
     */
    this.waitingQueue = new Map();

    /**
     * Map of active 1-on-1 call sessions.
     * Key: callSessionId -> Value: { callSessionId, user1, user2, isVideo, startedAt }
     */
    this.activeSessions = new Map();

    /**
     * Map tracking which session a user is currently in.
     * Key: userId -> Value: callSessionId
     */
    this.userSessions = new Map();
  }

  /**
   * User requests to enter the random matchmaking queue.
   */
  startSearching(socket, user, { location, isVideo = true } = {}) {
    const userId = String(user.id || user._id);

    // Clean up any existing session first
    this.endCall(userId, socket);

    const seeker = {
      userId,
      socketId: socket.id,
      socket,
      user: {
        id: userId,
        name: user.name || user.username || 'Anonymous',
        avatarUrl: user.avatarUrl || user.avatar,
        gender: user.gender,
      },
      location: location || null, // { latitude, longitude, city }
      isVideo: Boolean(isVideo),
      joinedAt: Date.now(),
    };

    this.waitingQueue.set(userId, seeker);
    logger.info({ userId, queueSize: this.waitingQueue.size }, 'User joined random call queue');

    // Attempt instant match
    this.tryMatch(seeker);
  }

  /**
   * Remove a user from the waiting queue.
   */
  cancelSearching(userId) {
    const id = String(userId);
    if (this.waitingQueue.has(id)) {
      this.waitingQueue.delete(id);
      logger.info({ userId: id, queueSize: this.waitingQueue.size }, 'User left random call queue');
      return true;
    }
    return false;
  }

  /**
   * Core Proximity-Based Matchmaking Algorithm.
   * Prioritizes nearest geographic seekers, expanding outward if needed.
   */
  tryMatch(currentSeeker) {
    const currentId = currentSeeker.userId;
    if (!this.waitingQueue.has(currentId)) return;

    let bestCandidate = null;
    let minDistance = Infinity;

    for (const [otherId, otherSeeker] of this.waitingQueue.entries()) {
      if (otherId === currentId) continue;
      // Skip if socket is disconnected
      if (!otherSeeker.socket.connected) {
        this.waitingQueue.delete(otherId);
        continue;
      }

      // Calculate distance between seekers if both provided coordinates
      if (currentSeeker.location?.latitude && otherSeeker.location?.latitude) {
        const distance = calculateDistanceKm(
          currentSeeker.location.latitude,
          currentSeeker.location.longitude,
          otherSeeker.location.latitude,
          otherSeeker.location.longitude,
        );

        if (distance !== null && distance < minDistance) {
          minDistance = distance;
          bestCandidate = otherSeeker;
        }
      } else if (!bestCandidate) {
        // Fallback candidate if no GPS coordinates available
        bestCandidate = otherSeeker;
      }
    }

    if (bestCandidate) {
      // Remove both seekers from the waiting queue
      this.waitingQueue.delete(currentId);
      this.waitingQueue.delete(bestCandidate.userId);

      // Create a unique session ID
      const callSessionId = `call_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

      const distanceDisplay =
        minDistance !== Infinity && minDistance !== null
          ? `${minDistance} km away`
          : 'Nearby Match';

      const session = {
        callSessionId,
        user1: currentSeeker,
        user2: bestCandidate,
        isVideo: currentSeeker.isVideo && bestCandidate.isVideo,
        distanceDisplay,
        startedAt: Date.now(),
      };

      this.activeSessions.set(callSessionId, session);
      this.userSessions.set(currentId, callSessionId);
      this.userSessions.set(bestCandidate.userId, callSessionId);

      logger.info(
        {
          callSessionId,
          user1: currentId,
          user2: bestCandidate.userId,
          distance: distanceDisplay,
        },
        'Random call matched successfully',
      );

      // Notify User 1 (designated as WebRTC Offer Initiator)
      currentSeeker.socket.emit('random_call:matched', {
        callSessionId,
        isInitiator: true,
        peer: {
          id: bestCandidate.userId,
          name: bestCandidate.user.name,
          avatarUrl: bestCandidate.user.avatarUrl,
          distance: distanceDisplay,
        },
        isVideo: session.isVideo,
      });

      // Notify User 2 (designated as WebRTC Answer Receiver)
      bestCandidate.socket.emit('random_call:matched', {
        callSessionId,
        isInitiator: false,
        peer: {
          id: currentSeeker.userId,
          name: currentSeeker.user.name,
          avatarUrl: currentSeeker.user.avatarUrl,
          distance: distanceDisplay,
        },
        isVideo: session.isVideo,
      });
    }
  }

  /**
   * Relays WebRTC signaling data (offer, answer, ICE candidates) to peer.
   */
  handleSignal(senderSocket, userId, { callSessionId, data }) {
    const session = this.activeSessions.get(callSessionId);
    if (!session) return;

    const peer =
      String(session.user1.userId) === String(userId) ? session.user2 : session.user1;

    if (peer && peer.socket && peer.socket.connected) {
      peer.socket.emit('random_call:signal', {
        callSessionId,
        data,
      });
    }
  }

  /**
   * User clicks "Next / Skip" to immediately search for another peer.
   */
  skipToNext(socket, user, options = {}) {
    const userId = String(user.id || user._id);
    this.endCall(userId, socket);
    this.startSearching(socket, user, options);
  }

  /**
   * End active call session and notify the other peer.
   */
  endCall(userId, socket) {
    const id = String(userId);
    this.cancelSearching(id);

    const callSessionId = this.userSessions.get(id);
    if (!callSessionId) return;

    const session = this.activeSessions.get(callSessionId);
    if (session) {
      const peer = String(session.user1.userId) === id ? session.user2 : session.user1;

      if (peer && peer.socket && peer.socket.connected) {
        peer.socket.emit('random_call:ended', {
          callSessionId,
          reason: 'Peer disconnected',
        });
      }

      this.activeSessions.delete(callSessionId);
      this.userSessions.delete(session.user1.userId);
      this.userSessions.delete(session.user2.userId);
    }
  }

  /**
   * Clean up on socket disconnection.
   */
  handleDisconnect(socket, user) {
    if (!user) return;
    const userId = String(user.id || user._id);
    this.endCall(userId, socket);
  }
}

export const randomCallManager = new RandomCallManager();
