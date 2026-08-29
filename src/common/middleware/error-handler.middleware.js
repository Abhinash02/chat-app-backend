import mongoose from 'mongoose';

import { AppError, NotFoundError } from '#src/common/errors/index.js';
import { sendError } from '#src/common/utils/response.util.js';
import { env } from '#src/config/env.js';
import { logger } from '#src/config/logger.js';

export function notFoundHandler(req, _res, next) {
  next(new NotFoundError(`Route ${req.method} ${req.originalUrl} does not exist`, 'ROUTE_NOT_FOUND'));
}

/**
 * Translates a thrown error into the public error contract. Only `AppError`
 * instances describe themselves to the client; everything else collapses into
 * a generic 500 so database and stack details never escape.
 */
function normalizeError(error) {
  if (error instanceof AppError) {
    return {
      statusCode: error.statusCode,
      code: error.code,
      message: error.message,
      details: error.details,
      isOperational: true,
    };
  }

  if (error instanceof mongoose.Error.ValidationError) {
    return {
      statusCode: 422,
      code: 'VALIDATION_ERROR',
      message: 'Please correct the highlighted fields',
      details: Object.values(error.errors).map((fieldError) => ({
        field: fieldError.path,
        message: fieldError.message,
      })),
      isOperational: true,
    };
  }

  if (error instanceof mongoose.Error.CastError) {
    return {
      statusCode: 400,
      code: 'INVALID_IDENTIFIER',
      message: 'The provided identifier is not valid',
      isOperational: true,
    };
  }

  // Duplicate key — surface the conflicting field name, never the raw driver message.
  if (error?.code === 11000) {
    const field = Object.keys(error.keyPattern ?? {})[0] ?? 'value';
    return {
      statusCode: 409,
      code: 'DUPLICATE_RESOURCE',
      message: `This ${field} is already in use`,
      isOperational: true,
    };
  }

  if (error?.type === 'entity.too.large') {
    return {
      statusCode: 413,
      code: 'PAYLOAD_TOO_LARGE',
      message: 'Request payload is too large',
      isOperational: true,
    };
  }

  return {
    statusCode: 500,
    code: 'INTERNAL_ERROR',
    message: 'Something went wrong on our side. Please try again.',
    isOperational: false,
  };
}

export function errorHandler(error, req, res, _next) {
  const normalized = normalizeError(error);

  const logContext = {
    err: error,
    requestId: req.id,
    method: req.method,
    url: req.originalUrl,
    userId: req.user?.id,
    code: normalized.code,
  };

  if (normalized.isOperational) {
    logger.warn(logContext, normalized.message);
  } else {
    logger.error(logContext, 'Unhandled application error');
  }

  const details = normalized.isOperational || !env.isProduction ? normalized.details : undefined;

  return sendError(res, {
    statusCode: normalized.statusCode,
    code: normalized.code,
    message: normalized.message,
    details,
  });
}
