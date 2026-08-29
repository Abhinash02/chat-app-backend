import { ValidationError } from '#src/common/errors/index.js';

function formatIssues(zodError) {
  return zodError.issues.map((issue) => ({
    field: issue.path.join('.') || '(root)',
    message: issue.message,
  }));
}

/**
 * Validates request segments against Zod schemas and replaces each segment with
 * the parsed result, so downstream layers only ever see coerced, known-shaped
 * data. Unvalidated segments are left untouched.
 *
 * @param {{ body?: import('zod').ZodTypeAny, query?: import('zod').ZodTypeAny, params?: import('zod').ZodTypeAny }} schemas
 */
export function validate(schemas) {
  return function validateMiddleware(req, _res, next) {
    const issues = [];

    for (const segment of ['params', 'query', 'body']) {
      const schema = schemas[segment];
      if (!schema) continue;

      const result = schema.safeParse(req[segment]);
      if (!result.success) {
        issues.push(...formatIssues(result.error).map((issue) => ({ ...issue, in: segment })));
        continue;
      }

      // `req.query` is a getter on Express 5; assigning to a local copy keeps
      // both major versions working.
      Object.defineProperty(req, segment, { value: result.data, writable: true, configurable: true });
    }

    if (issues.length > 0) {
      return next(new ValidationError('Please correct the highlighted fields', issues));
    }

    return next();
  };
}
