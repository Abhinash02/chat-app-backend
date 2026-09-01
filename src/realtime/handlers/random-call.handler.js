import { randomCallManager } from '#src/modules/random-call/random-call.manager.js';
import { logger } from '#src/config/logger.js';

export function registerRandomCallHandlers(socket) {
  const user = socket.data.user;
  if (!user) return;

  const userId = String(user.id || user._id);

  // User starts looking for a random match
  socket.on('random_call:start_search', (payload = {}) => {
    try {
      randomCallManager.startSearching(socket, user, payload);
    } catch (err) {
      logger.error({ err, userId }, 'Error starting random call search');
    }
  });

  // User cancels searching
  socket.on('random_call:cancel_search', () => {
    try {
      randomCallManager.cancelSearching(userId);
    } catch (err) {
      logger.error({ err, userId }, 'Error cancelling random call search');
    }
  });

  // Relay WebRTC signaling messages (Offer, Answer, ICE candidate)
  socket.on('random_call:signal', (payload) => {
    try {
      if (payload?.callSessionId && payload?.data) {
        randomCallManager.handleSignal(socket, userId, payload);
      }
    } catch (err) {
      logger.error({ err, userId }, 'Error handling random call signal');
    }
  });

  // User clicks "Next / Skip" to match with someone else
  socket.on('random_call:next', (payload = {}) => {
    try {
      randomCallManager.skipToNext(socket, user, payload);
    } catch (err) {
      logger.error({ err, userId }, 'Error skipping random call');
    }
  });

  // User ends active call
  socket.on('random_call:end', () => {
    try {
      randomCallManager.endCall(userId, socket);
    } catch (err) {
      logger.error({ err, userId }, 'Error ending random call');
    }
  });
}
