import { BadRequestError, ForbiddenError, NotFoundError, TooManyRequestsError } from '#src/common/errors/index.js';
import { ONE_DAY_MS } from '#src/common/utils/date.util.js';
import { buildPaginationMeta, resolvePagination } from '#src/common/utils/pagination.util.js';
import { logger } from '#src/config/logger.js';
import { emitToAll } from '#src/realtime/emitter.js';
import { SOCKET_EVENT } from '#src/realtime/events.js';
import { settingsService } from '#src/modules/settings/settings.service.js';
import { userRepository } from '#src/modules/users/user.repository.js';
import { coinsService } from '#src/modules/coins/coins.service.js';
import { COIN_TRANSACTION_TYPE } from '#src/modules/coins/coins.constants.js';
import { gameRepository } from '#src/modules/games/game.repository.js';
import { GAMES, GAME_BY_KEY, GAME_SESSION_STATUS } from '#src/modules/games/game.constants.js';

async function assertGamesEnabled() {
  const settings = await settingsService.getSettings();
  if (!settings.games.enabled) {
    throw new ForbiddenError('Games are currently unavailable', 'GAMES_DISABLED');
  }
  return settings.games;
}

function toGameDto(game) {
  return {
    key: game.key,
    name: game.name,
    description: game.description,
    emoji: game.emoji,
    maxScore: game.maxScore,
  };
}

export async function listGames(userId) {
  await assertGamesEnabled();

  const bestScores = await Promise.all(
    GAMES.map((game) => gameRepository.findBestScore({ userId, gameKey: game.key })),
  );

  return GAMES.map((game, index) => ({ ...toGameDto(game), personalBest: bestScores[index] }));
}

export async function startSession({ userId, gameKey }) {
  const gameSettings = await assertGamesEnabled();

  const game = GAME_BY_KEY[gameKey];
  if (!game) throw new NotFoundError('That game does not exist', 'GAME_NOT_FOUND');

  const playedToday = await gameRepository.countSessionsSince({
    userId,
    since: new Date(Date.now() - ONE_DAY_MS),
  });

  if (playedToday >= gameSettings.maxSessionsPerDay) {
    throw new TooManyRequestsError(
      'You have reached your game limit for today. Come back tomorrow!',
      'GAME_DAILY_LIMIT',
      { limit: gameSettings.maxSessionsPerDay },
    );
  }

  const session = await gameRepository.createSession({ userId, gameKey });

  return {
    sessionId: String(session._id),
    game: toGameDto(game),
    startedAt: session.startedAt,
    // Echoed back so the client can show its own countdown consistently.
    maxDurationMs: game.maxDurationMs,
  };
}

/**
 * Accepts a finished run and awards points.
 *
 * Validation is intentionally about plausibility, not proof: these are casual
 * client-rendered mini games, so the server bounds score, elapsed time and
 * daily volume rather than pretending to simulate the game.
 */
export async function completeSession({ user, sessionId, score }) {
  const gameSettings = await assertGamesEnabled();

  const session = await gameRepository.findSessionById(sessionId);
  if (!session) throw new NotFoundError('Game session not found', 'GAME_SESSION_NOT_FOUND');

  if (String(session.userId) !== String(user.id)) {
    throw new ForbiddenError('This game session is not yours', 'NOT_SESSION_OWNER');
  }

  if (session.status !== GAME_SESSION_STATUS.IN_PROGRESS) {
    throw new BadRequestError('This game has already been submitted', 'GAME_ALREADY_COMPLETED');
  }

  const game = GAME_BY_KEY[session.gameKey];
  const durationMs = Date.now() - new Date(session.startedAt).getTime();

  if (score > game.maxScore) {
    await gameRepository.rejectSession({ sessionId, reason: 'SCORE_ABOVE_MAXIMUM' });
    logger.warn({ userId: user.id, gameKey: session.gameKey, score }, 'Rejected implausible game score');
    throw new BadRequestError('That score is not possible in this game', 'SCORE_INVALID');
  }

  if (durationMs < game.minDurationMs) {
    await gameRepository.rejectSession({ sessionId, reason: 'FINISHED_TOO_FAST' });
    throw new BadRequestError('That run finished too quickly to count', 'GAME_TOO_FAST');
  }

  if (durationMs > game.maxDurationMs) {
    await gameRepository.rejectSession({ sessionId, reason: 'SESSION_EXPIRED' });
    throw new BadRequestError('This game session expired. Start a new one.', 'GAME_SESSION_EXPIRED');
  }

  const pointsAwarded = Math.min(Math.floor(score * game.pointsPerScore), game.maxPointsPerSession);

  const completed = await gameRepository.completeSession({
    sessionId,
    score,
    pointsAwarded,
    durationMs,
  });

  if (!completed) {
    // Another request completed the same session between our read and write.
    throw new BadRequestError('This game has already been submitted', 'GAME_ALREADY_COMPLETED');
  }

  const updatedUser = await userRepository.incrementGamePoints(user.id, pointsAwarded);

  // Optional coin reward, off by default; admins can turn points into coins.
  let coinsEarned = 0;
  if (gameSettings.coinsPerPointConversion > 0 && pointsAwarded > 0) {
    coinsEarned = Math.floor(pointsAwarded * gameSettings.coinsPerPointConversion);
    if (coinsEarned > 0) {
      await coinsService.creditCoins({
        userId: user.id,
        gender: user.gender,
        amount: coinsEarned,
        type: COIN_TRANSACTION_TYPE.GAME_REWARD,
        description: `${game.name} reward`,
        referenceId: String(sessionId),
      });
    }
  }

  const rank = (await userRepository.countUsersWithMorePoints(updatedUser.gamePoints)) + 1;

  // Everyone sees the board, so a change is broadcast rather than polled.
  emitToAll(SOCKET_EVENT.LEADERBOARD_UPDATED, {
    userId: String(user.id),
    nickname: user.nickname,
    totalPoints: updatedUser.gamePoints,
    rank,
  });

  return {
    score,
    pointsAwarded,
    coinsEarned,
    totalPoints: updatedUser.gamePoints,
    rank,
    durationMs,
  };
}

export async function getLeaderboard({ userId, limit }) {
  const gameSettings = await assertGamesEnabled();
  const size = Math.min(Number(limit) || gameSettings.leaderboardSize, gameSettings.leaderboardSize);

  const top = await userRepository.findTopByGamePoints(size);

  const entries = top.map((entry, index) => ({
    rank: index + 1,
    userId: String(entry._id),
    nickname: entry.nickname,
    avatarUrl: entry.avatarUrl ?? null,
    avatarEmoji: entry.avatarEmoji ?? null,
    avatarColor: entry.avatarColor ?? null,
    gender: entry.gender,
    totalPoints: entry.gamePoints,
    isMe: String(entry._id) === String(userId),
  }));

  const me = await userRepository.findById(userId);
  const myPoints = me?.gamePoints ?? 0;
  const myRank = entries.find((entry) => entry.isMe)?.rank
    ?? (await userRepository.countUsersWithMorePoints(myPoints)) + 1;

  return {
    entries,
    me: { rank: myRank, totalPoints: myPoints, isRanked: myPoints > 0 },
  };
}

export async function listMySessions({ userId, page, limit }) {
  const { skip, page: safePage, limit: safeLimit } = resolvePagination({ page, limit });
  const { items, total } = await gameRepository.listSessions({ userId, skip, limit: safeLimit });

  return {
    items: items.map((session) => ({
      id: String(session._id),
      gameKey: session.gameKey,
      gameName: GAME_BY_KEY[session.gameKey]?.name ?? session.gameKey,
      score: session.score,
      pointsAwarded: session.pointsAwarded,
      durationMs: session.durationMs,
      completedAt: session.completedAt,
    })),
    meta: buildPaginationMeta({ page: safePage, limit: safeLimit, total }),
  };
}

export const gameService = {
  listGames,
  startSession,
  completeSession,
  getLeaderboard,
  listMySessions,
};
