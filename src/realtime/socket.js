import { Server } from 'socket.io';

import { env } from '#src/config/env.js';
import { logger } from '#src/config/logger.js';
import { adminRoom, registerSocketServer, userRoom } from '#src/realtime/emitter.js';
import { SOCKET_EVENT } from '#src/realtime/events.js';
import { authenticateSocket } from '#src/realtime/socket.auth.js';
import { registerChatHandlers } from '#src/realtime/handlers/chat.handler.js';
import { registerRoomHandlers } from '#src/realtime/handlers/room.handler.js';
import { registerRandomCallHandlers } from '#src/realtime/handlers/random-call.handler.js';
import { randomCallManager } from '#src/modules/random-call/random-call.manager.js';
import { chatService } from '#src/modules/chat/chat.service.js';
import { coinsService } from '#src/modules/coins/coins.service.js';
import { roomService } from '#src/modules/rooms/room.service.js';
import { themeService } from '#src/modules/theme/theme.service.js';
import { userService } from '#src/modules/users/user.service.js';

export function createSocketServer(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: env.isProduction ? env.corsOrigins : true, credentials: true },
    // React Native networks drop often; a slightly generous window avoids
    // flapping the green presence dot on every tunnel hiccup.
    pingInterval: 25_000,
    pingTimeout: 30_000,
    maxHttpBufferSize: 1e6,
  });

  io.use(authenticateSocket);

  io.on('connection', async (socket) => {
    const user = socket.data.user;

    // Every device of one account shares a room, so server-side pushes reach
    // all of them without tracking socket ids.
    socket.join(userRoom(user.id));
    if (user.role === 'admin' || user.role === 'super_admin') {
      socket.join(adminRoom());
    }

    await userService.setPresence({ userId: user.id, delta: 1 });

    registerChatHandlers(socket);
    registerRoomHandlers(socket);
    registerRandomCallHandlers(socket);

    // One round trip gives the app everything its header needs: coins, free-talk
    // countdown, unread badge and the current theme.
    try {
      const [wallet, unread, theme] = await Promise.all([
        coinsService.getWalletSnapshot({ userId: user.id, gender: user.gender }),
        chatService.getTotalUnreadCount(user.id),
        themeService.getActiveTheme(),
      ]);

      socket.emit(SOCKET_EVENT.READY, {
        userId: user.id,
        wallet,
        unreadCount: unread.unreadCount,
        theme,
        serverTime: new Date().toISOString(),
      });
    } catch (error) {
      logger.error({ err: error, userId: user.id }, 'Failed to build socket ready payload');
    }

    socket.on('disconnect', async (reason) => {
      try {
        randomCallManager.handleDisconnect(socket, user);
        await userService.setPresence({ userId: user.id, delta: -1 });

        // A dropped connection must not leave a ghost seat in a voice room.
        const remaining = await io.in(userRoom(user.id)).fetchSockets();
        if (remaining.length === 0) await roomService.handleUserDisconnected(user.id);
      } catch (error) {
        logger.error({ err: error, userId: user.id }, 'Socket disconnect cleanup failed');
      }

      logger.debug({ userId: user.id, reason }, 'Socket disconnected');
    });
  });

  registerSocketServer(io);
  logger.info('Socket.IO gateway ready');

  return io;
}
