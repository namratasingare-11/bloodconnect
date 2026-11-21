import { NextFunction, Request, Response } from 'express';
import {
  RoleRecord,
  SecurityUserRecord,
  SessionRecord,
  securityStore,
} from '../db/securityStore';
import { clearSessionCookie, extractSessionToken } from '../utils/cookies';
import { AuthenticationError, AuthorizationError } from '../utils/apiResponse';

export interface AuthContext {
  user: SecurityUserRecord;
  session: SessionRecord;
  role: RoleRecord;
  permissions: Set<string>;
  ipAddress: string;
  userAgent: string;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

export function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || '127.0.0.1';
}

export function getUserAgent(req: Request): string {
  return String(req.headers['user-agent'] || 'Unknown Client').slice(0, 240);
}

/**
 * Resolves the active server-side session from the HttpOnly cookie (or Bearer token)
 * and loads the user's live role and permissions from the server security store.
 * NEVER trusts any role or permission supplied by the client.
 */
export function attachSession(req: Request, res: Response, next: NextFunction): void {
  const rawToken = extractSessionToken(req);
  if (!rawToken) {
    return next();
  }

  const resolved = securityStore.validateSessionToken(rawToken);
  if (!resolved) {
    // Session expired, revoked, or user suspended/deactivated -> clear stale cookie
    clearSessionCookie(res);
    return next();
  }

  const role =
    securityStore.getRoleByKey(resolved.user.roleKey) ??
    securityStore.getRoleByKey('regular_user')!;

  req.auth = {
    user: resolved.user,
    session: resolved.session,
    role,
    permissions: new Set(role.permissions),
    ipAddress: getClientIp(req),
    userAgent: getUserAgent(req),
  };

  next();
}

/**
 * Ensures the request has a valid, active, non-revoked authenticated session.
 */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  if (!req.auth) {
    securityStore.recordAudit({
      action: 'UNAUTHENTICATED_ACCESS',
      outcome: 'DENIED',
      resource: `${req.method} ${req.originalUrl}`,
      ipAddress: getClientIp(req),
      userAgent: getUserAgent(req),
      details: 'Blocked unauthenticated request to protected endpoint.',
    });
    return next(new AuthenticationError('Authentication required. Please sign in to continue.'));
  }

  next();
}

/**
 * Enforces a specific server-verified permission on every request.
 * Permissions are resolved dynamically from the configurable RBAC store.
 */
export function requirePermission(permissionKey: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) {
      securityStore.recordAudit({
        action: 'UNAUTHENTICATED_ACCESS',
        outcome: 'DENIED',
        resource: `${req.method} ${req.originalUrl}`,
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
        details: `Unauthenticated request blocked; missing permission '${permissionKey}'.`,
      });
      return next(new AuthenticationError('Authentication required. Please sign in to continue.'));
    }

    if (!req.auth.permissions.has(permissionKey)) {
      securityStore.recordAudit({
        actorUserId: req.auth.user.id,
        actorEmail: req.auth.user.email,
        actorRole: req.auth.role.key,
        action: 'AUTHZ_DENIED',
        outcome: 'DENIED',
        resource: `${req.method} ${req.originalUrl}`,
        ipAddress: req.auth.ipAddress,
        userAgent: req.auth.userAgent,
        details: `Denied access: role '${req.auth.role.key}' lacks required permission '${permissionKey}'.`,
      });
      return next(
        new AuthorizationError(
          `Access denied. Required permission '${permissionKey}' is not granted to your role (${req.auth.role.name}).`
        )
      );
    }

    next();
  };
}

/**
 * Enforces that the authenticated user holds AT LEAST ONE of the listed permissions.
 */
export function requireAnyPermission(permissionKeys: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) {
      securityStore.recordAudit({
        action: 'UNAUTHENTICATED_ACCESS',
        outcome: 'DENIED',
        resource: `${req.method} ${req.originalUrl}`,
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
        details: `Unauthenticated request blocked; requires one of [${permissionKeys.join(', ')}].`,
      });
      return next(new AuthenticationError('Authentication required. Please sign in to continue.'));
    }

    const allowed = permissionKeys.some((key) => req.auth!.permissions.has(key));
    if (!allowed) {
      securityStore.recordAudit({
        actorUserId: req.auth.user.id,
        actorEmail: req.auth.user.email,
        actorRole: req.auth.role.key,
        action: 'AUTHZ_DENIED',
        outcome: 'DENIED',
        resource: `${req.method} ${req.originalUrl}`,
        ipAddress: req.auth.ipAddress,
        userAgent: req.auth.userAgent,
        details: `Denied access: role '${req.auth.role.key}' lacks any of [${permissionKeys.join(', ')}].`,
      });
      return next(
        new AuthorizationError(
          `Access denied. Your role (${req.auth.role.name}) does not have permission for this operation.`
        )
      );
    }

    next();
  };
}

/**
 * Prevents Horizontal Privilege Escalation (IDOR): allows access only when the
 * caller owns the target user resource OR possesses the specified admin permission.
 */
export function requireSelfOrPermission(
  getTargetUserId: (req: Request) => number | null,
  fallbackPermission: string
) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) {
      return next(new AuthenticationError('Authentication required. Please sign in to continue.'));
    }

    const targetId = getTargetUserId(req);
    if (targetId !== null && targetId === req.auth.user.id) {
      return next();
    }

    if (req.auth.permissions.has(fallbackPermission)) {
      return next();
    }

    securityStore.recordAudit({
      actorUserId: req.auth.user.id,
      actorEmail: req.auth.user.email,
      actorRole: req.auth.role.key,
      action: 'AUTHZ_DENIED',
      outcome: 'DENIED',
      resource: `${req.method} ${req.originalUrl}`,
      targetUserId: targetId ?? undefined,
      ipAddress: req.auth.ipAddress,
      userAgent: req.auth.userAgent,
      details: `Blocked cross-user private data access to user #${targetId ?? 'unknown'}; missing '${fallbackPermission}'.`,
    });

    return next(
      new AuthorizationError('Access denied. You cannot access another user’s private account data.')
    );
  };
}
