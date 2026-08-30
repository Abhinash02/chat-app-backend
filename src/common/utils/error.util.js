/**
 * Recognises errors that mean "the database is unreachable right now" rather
 * than "this operation was wrong".
 *
 * The distinction matters for background jobs: a connectivity blip is not a bug
 * report, and treating it like one buries genuine failures under repeated
 * stack traces. The MongoDB driver attaches its entire replica-set topology to
 * these errors, so a single unreachable cluster can produce megabytes of log
 * per minute across several jobs.
 */
const CONNECTIVITY_ERROR_NAMES = new Set([
  'MongoServerSelectionError',
  'MongoNetworkError',
  'MongoNetworkTimeoutError',
  'MongoTopologyClosedError',
  'MongoNotConnectedError',
]);

const CONNECTIVITY_ERROR_CODES = new Set([
  'ENOTFOUND',
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'EAI_AGAIN',
]);

export function isDatabaseUnreachable(error) {
  if (!error) return false;
  if (CONNECTIVITY_ERROR_NAMES.has(error.name)) return true;
  if (CONNECTIVITY_ERROR_CODES.has(error.code)) return true;

  // The driver nests the original DNS or socket failure inside `cause`.
  return Boolean(error.cause && isDatabaseUnreachable(error.cause));
}

/**
 * A one-line summary of a connectivity failure.
 *
 * Deliberately drops the topology dump: when a cluster is unreachable, the
 * useful facts are which host failed and why, and those fit on one line.
 */
export function summariseConnectivityError(error) {
  const message = String(error?.message ?? '');

  // "getaddrinfo ENOTFOUND host: getaddrinfo ENOTFOUND host: ..." repeats the
  // same failure once per replica-set member.
  const [first] = message.split(': getaddrinfo');
  const host = /ENOTFOUND ([\w.-]+)/.exec(message)?.[1];

  return {
    reason: first.slice(0, 160),
    ...(host ? { host } : {}),
  };
}
