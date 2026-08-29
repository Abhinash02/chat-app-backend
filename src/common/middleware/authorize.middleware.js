import { ForbiddenError, UnauthorizedError } from '#src/common/errors/index.js';
import { USER_ROLE } from '#src/common/constants/index.js';

/**
 * Coarse role gate. Resource-level ownership rules stay in the service layer —
 * this only answers "may this kind of account reach this endpoint at all?".
 */
export function authorize(...allowedRoles) {
  return function authorizeMiddleware(req, _res, next) {
    if (!req.user) return next(new UnauthorizedError('Authentication required'));
    if (!allowedRoles.includes(req.user.role)) {
      return next(new ForbiddenError('You are not allowed to perform this action'));
    }
    return next();
  };
}

export const requireAdmin = authorize(USER_ROLE.ADMIN, USER_ROLE.SUPER_ADMIN);
export const requireSuperAdmin = authorize(USER_ROLE.SUPER_ADMIN);
