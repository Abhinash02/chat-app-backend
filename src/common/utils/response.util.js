/**
 * Single place that shapes every HTTP payload, so clients can rely on
 * `{ success, data, meta }` / `{ success, error }` everywhere.
 */
export function sendSuccess(res, data, { statusCode = 200, meta = undefined } = {}) {
  const body = { success: true, data };
  if (meta) body.meta = meta;
  return res.status(statusCode).json(body);
}

export function sendCreated(res, data, meta) {
  return sendSuccess(res, data, { statusCode: 201, meta });
}

export function sendNoContent(res) {
  return res.status(204).send();
}

export function sendError(res, { statusCode, code, message, details }) {
  const error = { code, message };
  if (details) error.details = details;
  return res.status(statusCode).json({ success: false, error });
}
