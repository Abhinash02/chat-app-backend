import { describe, expect, it } from 'vitest';

import { isDatabaseUnreachable, summariseConnectivityError } from '#src/common/utils/error.util.js';

/** Shaped like what the MongoDB driver actually throws when DNS fails. */
function serverSelectionError() {
  const error = new Error(
    'getaddrinfo ENOTFOUND ac-abc-shard-00-01.example.mongodb.net: ' +
      'getaddrinfo ENOTFOUND ac-abc-shard-00-01.example.mongodb.net: ' +
      'getaddrinfo ENOTFOUND ac-abc-shard-00-01.example.mongodb.net',
  );
  error.name = 'MongoServerSelectionError';
  return error;
}

describe('isDatabaseUnreachable', () => {
  it('should recognise the driver server-selection failure', () => {
    expect(isDatabaseUnreachable(serverSelectionError())).toBe(true);
  });

  it('should recognise a raw DNS failure', () => {
    const error = new Error('getaddrinfo ENOTFOUND cluster.example.net');
    error.code = 'ENOTFOUND';
    expect(isDatabaseUnreachable(error)).toBe(true);
  });

  it('should recognise a connectivity failure nested in the cause', () => {
    const cause = new Error('connection closed');
    cause.code = 'ECONNRESET';

    const outer = new Error('operation failed');
    outer.cause = cause;

    expect(isDatabaseUnreachable(outer)).toBe(true);
  });

  it('should not mistake an ordinary bug for a connectivity problem', () => {
    // The whole point is that a real fault still gets a full stack trace.
    expect(isDatabaseUnreachable(new TypeError('x is not a function'))).toBe(false);
    expect(isDatabaseUnreachable(null)).toBe(false);
  });
});

describe('summariseConnectivityError', () => {
  it('should collapse the repeated per-member message into one line', () => {
    const summary = summariseConnectivityError(serverSelectionError());

    expect(summary.reason).toBe('getaddrinfo ENOTFOUND ac-abc-shard-00-01.example.mongodb.net');
    expect(summary.host).toBe('ac-abc-shard-00-01.example.mongodb.net');
  });

  it('should stay short even for a message that does not repeat', () => {
    const summary = summariseConnectivityError(new Error('x'.repeat(400)));
    expect(summary.reason.length).toBeLessThanOrEqual(160);
  });
});
