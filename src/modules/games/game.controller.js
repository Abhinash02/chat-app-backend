import { asyncHandler } from '#src/common/utils/async-handler.util.js';
import { sendCreated, sendSuccess } from '#src/common/utils/response.util.js';
import { gameService } from '#src/modules/games/game.service.js';

export const gameController = {
  listGames: asyncHandler(async (req, res) => {
    const games = await gameService.listGames(req.user.id);
    return sendSuccess(res, games);
  }),

  startSession: asyncHandler(async (req, res) => {
    const session = await gameService.startSession({ userId: req.user.id, ...req.body });
    return sendCreated(res, session);
  }),

  completeSession: asyncHandler(async (req, res) => {
    const result = await gameService.completeSession({
      user: req.user,
      sessionId: req.params.sessionId,
      ...req.body,
    });
    return sendSuccess(res, result);
  }),

  getLeaderboard: asyncHandler(async (req, res) => {
    const leaderboard = await gameService.getLeaderboard({ userId: req.user.id, ...req.query });
    return sendSuccess(res, leaderboard);
  }),

  listMySessions: asyncHandler(async (req, res) => {
    const { items, meta } = await gameService.listMySessions({ userId: req.user.id, ...req.query });
    return sendSuccess(res, items, { meta });
  }),
};
