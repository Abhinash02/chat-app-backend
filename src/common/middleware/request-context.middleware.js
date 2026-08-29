import crypto from 'node:crypto';

/** Attaches a correlation id used by the logger and returned to the client. */
export function requestContext(req, res, next) {
  const incoming = req.headers['x-request-id'];
  req.id = typeof incoming === 'string' && incoming.length <= 100 ? incoming : crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
}
