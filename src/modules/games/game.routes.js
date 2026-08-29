import { Router } from 'express';

import { authenticate, requireVerifiedAccount, validate } from '#src/common/middleware/index.js';
import { gameController } from '#src/modules/games/game.controller.js';
import {
  completeSessionSchema,
  leaderboardQuerySchema,
  listSessionsSchema,
  sessionIdParamSchema,
  startSessionSchema,
} from '#src/modules/games/game.schema.js';

const router = Router();

router.use(authenticate, requireVerifiedAccount);

router.get('/', gameController.listGames);
router.get('/leaderboard', validate({ query: leaderboardQuerySchema }), gameController.getLeaderboard);
router.get('/sessions', validate({ query: listSessionsSchema }), gameController.listMySessions);
router.post('/sessions', validate({ body: startSessionSchema }), gameController.startSession);
router.post(
  '/sessions/:sessionId/complete',
  validate({ params: sessionIdParamSchema, body: completeSessionSchema }),
  gameController.completeSession,
);

export const gameRoutes = router;
