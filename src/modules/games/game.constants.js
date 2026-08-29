export const GAME_SESSION_STATUS = Object.freeze({
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  ABANDONED: 'abandoned',
});

/**
 * The game catalogue lives on the server so the client cannot invent a game
 * with a generous scoring rule.
 *
 * Scoring is reported by the client, which is unavoidable for casual mini games
 * rendered entirely in the app. The server defends the leaderboard with three
 * cheap, effective bounds instead:
 *   - `maxScore`        a score above this is rejected outright
 *   - `minDurationMs`   a run finished implausibly fast is rejected
 *   - `maxDurationMs`   a stale session cannot be completed hours later
 * Combined with the per-day session cap in settings, that keeps casual
 * tampering off the board without a server-side game engine.
 */
export const GAMES = Object.freeze([
  {
    key: 'emoji-match',
    name: 'Emoji Match',
    description: 'Flip the cards and match every emoji pair before the timer runs out.',
    emoji: '\u{1F0CF}',
    maxScore: 500,
    minDurationMs: 8_000,
    maxDurationMs: 10 * 60_000,
    pointsPerScore: 1,
    maxPointsPerSession: 500,
  },
  {
    key: 'quick-tap',
    name: 'Quick Tap',
    description: 'Tap the target the moment it lights up. Pure reaction speed.',
    emoji: '\u{26A1}',
    maxScore: 300,
    minDurationMs: 5_000,
    maxDurationMs: 5 * 60_000,
    pointsPerScore: 1,
    maxPointsPerSession: 300,
  },
  {
    key: 'word-guess',
    name: 'Word Guess',
    description: 'Guess the hidden word one letter at a time.',
    emoji: '\u{1F524}',
    maxScore: 400,
    minDurationMs: 10_000,
    maxDurationMs: 10 * 60_000,
    pointsPerScore: 1,
    maxPointsPerSession: 400,
  },
  {
    key: 'number-rush',
    name: 'Number Rush',
    description: 'Solve as many quick sums as you can in sixty seconds.',
    emoji: '\u{1F9EE}',
    maxScore: 600,
    minDurationMs: 10_000,
    maxDurationMs: 5 * 60_000,
    pointsPerScore: 1,
    maxPointsPerSession: 600,
  },
  {
    key: 'trivia-dash',
    name: 'Trivia Dash',
    description: 'Ten fast questions. How many can you get right?',
    emoji: '\u{1F9E0}',
    maxScore: 200,
    minDurationMs: 15_000,
    maxDurationMs: 15 * 60_000,
    pointsPerScore: 2,
    maxPointsPerSession: 400,
  },
]);

export const GAME_BY_KEY = Object.freeze(Object.fromEntries(GAMES.map((game) => [game.key, game])));

export const GAME_KEYS = Object.freeze(GAMES.map((game) => game.key));
