/**
 * Base class for every error the application throws deliberately.
 * The global error handler trusts `statusCode`/`code` only for these; anything
 * else is reported as a generic 500 so internals never leak to clients.
 */
export class AppError extends Error {
  constructor(message, { statusCode = 500, code = 'INTERNAL_ERROR', details = undefined } = {}) {
    super(message);
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace?.(this, new.target);
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Invalid request', code = 'BAD_REQUEST', details) {
    super(message, { statusCode: 400, code, details });
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required', code = 'UNAUTHORIZED', details) {
    super(message, { statusCode: 401, code, details });
  }
}

export class PaymentRequiredError extends AppError {
  constructor(message = 'Payment required', code = 'PAYMENT_REQUIRED', details) {
    super(message, { statusCode: 402, code, details });
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'You are not allowed to perform this action', code = 'FORBIDDEN', details) {
    super(message, { statusCode: 403, code, details });
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found', code = 'NOT_FOUND', details) {
    super(message, { statusCode: 404, code, details });
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource conflict', code = 'CONFLICT', details) {
    super(message, { statusCode: 409, code, details });
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed', details, code = 'VALIDATION_ERROR') {
    super(message, { statusCode: 422, code, details });
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message = 'Too many requests', code = 'RATE_LIMITED', details) {
    super(message, { statusCode: 429, code, details });
  }
}
