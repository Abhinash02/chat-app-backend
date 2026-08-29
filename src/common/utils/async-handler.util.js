/**
 * Wraps an async route handler so a rejected promise reaches Express'
 * error pipeline instead of becoming an unhandled rejection.
 */
export function asyncHandler(handler) {
  return function wrappedHandler(req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}
