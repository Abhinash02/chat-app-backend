import { z } from 'zod';

import { objectIdSchema, paginationSchema } from '#src/common/validators/common.schema.js';
import { GAME_KEYS } from '#src/modules/games/game.constants.js';

export const startSessionSchema = z.object({ gameKey: z.enum(GAME_KEYS) }).strict();

export const completeSessionSchema = z
  .object({
    // The per-game ceiling is enforced in the service; this is only a sanity bound.
    score: z.number().int().min(0).max(100_000),
  })
  .strict();

export const sessionIdParamSchema = z.object({ sessionId: objectIdSchema });

export const leaderboardQuerySchema = z.object({
  limit: z.coerce.number().int().min(3).max(500).optional(),
});

export const listSessionsSchema = paginationSchema;

export const convertPointsSchema = z
  .object({
    points: z.coerce.number().int().min(1).max(10_000_000),
  })
  .strict();
