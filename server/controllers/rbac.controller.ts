import { Request, Response } from 'express';
import {
  AccountStatus,
  PERMISSIONS_CATALOG,
  PortalRole,
  SecurityAuditOutcome,
  securityStore,
  VALID_PERMISSION_KEYS,
} from '../db/securityStore';
import {
  AuthorizationError,
  ConflictError,
  NotFoundError,
  sendCreated,
  sendSuccess,
  ValidationError,
} from '../utils/apiResponse';
import { hashPassword, validatePasswordStrength } from '../utils/crypto';
import { isValidEmail, sanitizeNonEmptyString } from '../utils/validators';

const VALID_PORTAL_SCOPES: readonly PortalRole[] = ['donor', 'hospital', 'staff', 'admin'];
const VALID_STATUSES: readonly AccountStatus[] = [
  'active',
  'pending_verification',
  'suspended',
  'deactivated',
];

function isSuperAdmin(req: Request): boolean {
  return req.auth?.role.key === 'super_admin';
}

/**
 * GET /api/rbac/roles
 */
export async function listRoles(_req: Request, res: Response) {
  const users = securityStore.listUsers();
  const counts = new Map<string, number>();
  for (const u of users) {
    counts.set(u.roleKey, (counts.get(u.roleKey) ?? 0) + 1);
  }

  const roles = securityStore.getRoles().map((r) => ({
    ...r,
    userCount: counts.get(r.key) ?? 0,
  }));

  return sendSuccess(res, { roles });
}

/**
 * GET /api/rbac/permissions
 */
export async function listPermissions(_req: Request, res: Response) {
  return sendSuccess(res, { permissions: PERMISSIONS_CATALOG });
}

/**
 * POST /api/rbac/roles
 * Creates a new custom configurable role with anti-escalation rank & permission guards.
 */
export async function createCustomRole(req: Request, res: Response) {
  const caller = req.auth!;
  const rawKey = sanitizeNonEmptyString(req.body?.key, 48);
  const name = sanitizeNonEmptyString(req.body?.name, 80);
  const description = sanitizeNonEmptyString(req.body?.description, 220) || 'Custom organizational role';
  const authorityRank = Number.parseInt(String(req.body?.authorityRank ?? '20'), 10);
  const portalScope = req.body?.portalScope as PortalRole;
  const permissionsInput = Array.isArray(req.body?.permissions) ? req.body.permissions : [];

  if (!rawKey || !/^[a-z][a-z0-9_]{2,40}$/.test(rawKey)) {
    throw new ValidationError(
      'Role key must be 3-40 lowercase characters (letters, digits, underscores, starting with a letter).'
    );
  }
  if (!name) {
    throw new ValidationError('Role display name is required.');
  }
  if (!Number.isFinite(authorityRank) || authorityRank < 1 || authorityRank > 99) {
    throw new ValidationError('Authority rank for custom roles must be between 1 and 99.');
  }
  if (!VALID_PORTAL_SCOPES.includes(portalScope)) {
    throw new ValidationError('Valid portal scope (donor, hospital, staff, admin) is required.');
  }
  if (securityStore.getRoleByKey(rawKey)) {
    throw new ConflictError(`Role key '${rawKey}' already exists.`);
  }

  // Anti-escalation: non-super_admin cannot create a role with rank >= their own
  if (!isSuperAdmin(req) && authorityRank >= caller.role.authorityRank) {
    securityStore.recordAudit({
      actorUserId: caller.user.id,
      actorEmail: caller.user.email,
      actorRole: caller.role.key,
      action: 'PRIVILEGE_ESCALATION_BLOCKED',
      outcome: 'BLOCKED',
      resource: 'POST /api/rbac/roles',
      ipAddress: caller.ipAddress,
      userAgent: caller.userAgent,
      details: `Blocked creation of role '${rawKey}' with rank ${authorityRank} >= caller rank ${caller.role.authorityRank}.`,
    });
    throw new AuthorizationError('Cannot create a role with authority rank equal to or higher than your own.');
  }

  const requestedPermissions = permissionsInput
    .map((p: unknown) => String(p))
    .filter((p: string) => VALID_PERMISSION_KEYS.has(p));

  // Anti-escalation: non-super_admin cannot grant permissions they do not hold
  if (!isSuperAdmin(req)) {
    const unauthorizedPerm = requestedPermissions.find((p: string) => !caller.permissions.has(p));
    if (unauthorizedPerm) {
      securityStore.recordAudit({
        actorUserId: caller.user.id,
        actorEmail: caller.user.email,
        actorRole: caller.role.key,
        action: 'PRIVILEGE_ESCALATION_BLOCKED',
        outcome: 'BLOCKED',
        resource: 'POST /api/rbac/roles',
        ipAddress: caller.ipAddress,
        userAgent: caller.userAgent,
        details: `Blocked granting unowned permission '${unauthorizedPerm}' to new role '${rawKey}'.`,
      });
      throw new AuthorizationError(
        `Cannot grant permission '${unauthorizedPerm}' because your own role does not hold it.`
      );
    }
  }

  const created = securityStore.createRole({
    key: rawKey,
    name,
    description,
    authorityRank,
    portalScope,
    permissions: requestedPermissions,
  });

  securityStore.recordAudit({
    actorUserId: caller.user.id,
    actorEmail: caller.user.email,
    actorRole: caller.role.key,
    action: 'ROLE_CREATED',
    outcome: 'SUCCESS',
    resource: `POST /api/rbac/roles/${created.key}`,
    ipAddress: caller.ipAddress,
    userAgent: caller.userAgent,
    details: `Created custom role '${created.name}' (${created.key}, rank ${created.authorityRank}) with ${created.permissions.length} permission(s).`,
  });

  return sendCreated(res, { role: created });
}

/**
 * PUT /api/rbac/roles/:roleKey/permissions
 * Dynamically reconfigures permissions for an existing role without code changes.
 */
export async function updateRolePermissions(req: Request, res: Response) {
  const caller = req.auth!;
  const roleKey = sanitizeNonEmptyString(req.params.roleKey, 50);
  const permissionsInput = req.body?.permissions;

  if (!roleKey || !Array.isArray(permissionsInput)) {
    throw new ValidationError('Role key and permissions array are required.');
  }

  const targetRole = securityStore.getRoleByKey(roleKey);
  if (!targetRole) {
    throw new NotFoundError(`Role '${roleKey}' not found.`);
  }

  if (!isSuperAdmin(req) && targetRole.authorityRank >= caller.role.authorityRank) {
    securityStore.recordAudit({
      actorUserId: caller.user.id,
      actorEmail: caller.user.email,
      actorRole: caller.role.key,
      action: 'PRIVILEGE_ESCALATION_BLOCKED',
      outcome: 'BLOCKED',
      resource: `PUT /api/rbac/roles/${roleKey}/permissions`,
      ipAddress: caller.ipAddress,
      userAgent: caller.userAgent,
      details: `Blocked modifying permissions of equal/higher-rank role '${roleKey}'.`,
    });
    throw new AuthorizationError('Cannot modify permissions of a role at or above your authority rank.');
  }

  const requestedPermissions = permissionsInput
    .map((p: unknown) => String(p))
    .filter((p: string) => VALID_PERMISSION_KEYS.has(p));

  if (!isSuperAdmin(req)) {
    const unauthorizedPerm = requestedPermissions.find((p: string) => !caller.permissions.has(p));
    if (unauthorizedPerm) {
      securityStore.recordAudit({
        actorUserId: caller.user.id,
        actorEmail: caller.user.email,
        actorRole: caller.role.key,
        action: 'PRIVILEGE_ESCALATION_BLOCKED',
        outcome: 'BLOCKED',
        resource: `PUT /api/rbac/roles/${roleKey}/permissions`,
        ipAddress: caller.ipAddress,
        userAgent: caller.userAgent,
        details: `Blocked granting unowned permission '${unauthorizedPerm}' to role '${roleKey}'.`,
      });
      throw new AuthorizationError(`Cannot grant permission '${unauthorizedPerm}' that your own role does not hold.`);
    }
  }

  const updated = securityStore.updateRolePermissions(roleKey, requestedPermissions);

  securityStore.recordAudit({
    actorUserId: caller.user.id,
    actorEmail: caller.user.email,
    actorRole: caller.role.key,
    action: 'PERMISSIONS_UPDATED',
    outcome: 'SUCCESS',
    resource: `PUT /api/rbac/roles/${roleKey}/permissions`,
    ipAddress: caller.ipAddress,
    userAgent: caller.userAgent,
    details: `Updated permissions for '${roleKey}' (${updated!.permissions.length} active permissions).`,
  });

  return sendSuccess(res, {
    message: `Permissions updated for role '${updated!.name}'. Changes take effect immediately.`,
    role: updated,
  });
}

/**
 * GET /api/rbac/users
 */
export async function listUsers(_req: Request, res: Response) {
  const users = securityStore.listUsers().map((u) => securityStore.toPublicUser(u));
  return sendSuccess(res, { users });
}

/**
 * GET /api/rbac/users/:userId
 * Protected by requireSelfOrPermission('users:read') to prevent IDOR.
 */
export async function getUserById(req: Request, res: Response) {
  const userId = Number.parseInt(req.params.userId, 10);
  if (!Number.isFinite(userId)) {
    throw new ValidationError('Invalid user ID.');
  }

  const user = securityStore.findUserById(userId);
  if (!user) {
    throw new NotFoundError('User account not found.');
  }

  return sendSuccess(res, {
    user: securityStore.toPublicUser(user),
    activeSessionCount: securityStore.listUserSessions(user.id).length,
  });
}

/**
 * POST /api/rbac/users
 * Admin-initiated provisioning of staff/department accounts with rank check.
 */
export async function adminCreateUser(req: Request, res: Response) {
  const caller = req.auth!;
  const email = sanitizeNonEmptyString(req.body?.email, 120);
  const fullName = sanitizeNonEmptyString(req.body?.fullName, 100);
  const phone = sanitizeNonEmptyString(req.body?.phone, 25) || '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const roleKey = sanitizeNonEmptyString(req.body?.roleKey, 50) || 'regular_user';
  const department = sanitizeNonEmptyString(req.body?.department, 100) || undefined;
  const organizationName = sanitizeNonEmptyString(req.body?.organizationName, 120) || undefined;

  if (!email || !isValidEmail(email)) {
    throw new ValidationError('A valid email address is required.');
  }
  if (!fullName) {
    throw new ValidationError('Full name is required.');
  }
  const passwordIssue = validatePasswordStrength(password);
  if (passwordIssue) {
    throw new ValidationError(passwordIssue);
  }

  const targetRole = securityStore.getRoleByKey(roleKey);
  if (!targetRole || targetRole.key === 'guest') {
    throw new ValidationError('A valid assignable role is required.');
  }

  if (!isSuperAdmin(req) && targetRole.authorityRank >= caller.role.authorityRank) {
    securityStore.recordAudit({
      actorUserId: caller.user.id,
      actorEmail: caller.user.email,
      actorRole: caller.role.key,
      action: 'PRIVILEGE_ESCALATION_BLOCKED',
      outcome: 'BLOCKED',
      resource: 'POST /api/rbac/users',
      ipAddress: caller.ipAddress,
      userAgent: caller.userAgent,
      details: `Blocked creating user with equal/higher role '${targetRole.key}'.`,
    });
    throw new AuthorizationError('Cannot provision a user with an authority rank equal to or above your own.');
  }

  const username = `${roleKey.slice(0, 6)}_${fullName.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10)}_${Date.now().toString().slice(-4)}`;
  if (securityStore.userExists(email, username)) {
    throw new ConflictError('A user with this email already exists.');
  }

  const created = securityStore.createUser({
    username,
    email: email.toLowerCase(),
    passwordHash: hashPassword(password),
    fullName,
    phone,
    roleKey: targetRole.key,
    status: 'active',
    emailVerified: true,
    department,
    organizationName,
  });

  securityStore.recordAudit({
    actorUserId: caller.user.id,
    actorEmail: caller.user.email,
    actorRole: caller.role.key,
    action: 'USER_PROVISIONED',
    outcome: 'SUCCESS',
    resource: 'POST /api/rbac/users',
    targetUserId: created.id,
    ipAddress: caller.ipAddress,
    userAgent: caller.userAgent,
    details: `Provisioned user ${created.email} with role '${targetRole.key}'.`,
  });

  return sendCreated(res, { user: securityStore.toPublicUser(created) });
}

/**
 * PATCH /api/rbac/users/:userId/role
 * Strictly enforces anti-privilege-escalation hierarchy rules.
 */
export async function assignUserRole(req: Request, res: Response) {
  const caller = req.auth!;
  const targetUserId = Number.parseInt(req.params.userId, 10);
  const newRoleKey = sanitizeNonEmptyString(req.body?.roleKey, 50);

  if (!Number.isFinite(targetUserId) || !newRoleKey) {
    throw new ValidationError('Valid userId and roleKey are required.');
  }

  const targetUser = securityStore.findUserById(targetUserId);
  if (!targetUser) {
    throw new NotFoundError('Target user not found.');
  }

  const targetCurrentRole = securityStore.getRoleByKey(targetUser.roleKey);
  const nextRole = securityStore.getRoleByKey(newRoleKey);
  if (!nextRole || nextRole.key === 'guest') {
    throw new ValidationError('Invalid or non-assignable role key.');
  }

  // Prevent self-modification of role
  if (targetUser.id === caller.user.id) {
    securityStore.recordAudit({
      actorUserId: caller.user.id,
      actorEmail: caller.user.email,
      actorRole: caller.role.key,
      action: 'PRIVILEGE_ESCALATION_BLOCKED',
      outcome: 'BLOCKED',
      resource: `PATCH /api/rbac/users/${targetUserId}/role`,
      targetUserId,
      ipAddress: caller.ipAddress,
      userAgent: caller.userAgent,
      details: `Blocked self role modification attempt to '${newRoleKey}'.`,
    });
    throw new AuthorizationError('You cannot modify your own role assignment.');
  }

  // Anti-escalation check: caller must strictly outrank both the target's current role AND the new role (unless super_admin)
  if (!isSuperAdmin(req)) {
    const currentRank = targetCurrentRole?.authorityRank ?? 0;
    if (currentRank >= caller.role.authorityRank || nextRole.authorityRank >= caller.role.authorityRank) {
      securityStore.recordAudit({
        actorUserId: caller.user.id,
        actorEmail: caller.user.email,
        actorRole: caller.role.key,
        action: 'PRIVILEGE_ESCALATION_BLOCKED',
        outcome: 'BLOCKED',
        resource: `PATCH /api/rbac/users/${targetUserId}/role`,
        targetUserId,
        ipAddress: caller.ipAddress,
        userAgent: caller.userAgent,
        details: `Blocked role change on user #${targetUserId} (${targetUser.roleKey} -> ${newRoleKey}) by '${caller.role.key}' (rank ${caller.role.authorityRank}).`,
      });
      throw new AuthorizationError(
        'Privilege escalation blocked: you may only assign roles strictly below your own authority rank and cannot modify equal or higher-ranked users.'
      );
    }
  }

  const previousRole = targetUser.roleKey;
  const updated = securityStore.updateUserRole(targetUser.id, nextRole.key)!;

  securityStore.recordAudit({
    actorUserId: caller.user.id,
    actorEmail: caller.user.email,
    actorRole: caller.role.key,
    action: 'ROLE_CHANGED',
    outcome: 'SUCCESS',
    resource: `PATCH /api/rbac/users/${targetUserId}/role`,
    targetUserId: targetUser.id,
    ipAddress: caller.ipAddress,
    userAgent: caller.userAgent,
    details: `Changed role of ${targetUser.email} from '${previousRole}' to '${nextRole.key}'.`,
  });

  return sendSuccess(res, {
    message: `Assigned '${nextRole.name}' role to ${targetUser.fullName}.`,
    user: securityStore.toPublicUser(updated),
  });
}

/**
 * PATCH /api/rbac/users/:userId/status
 * Activates, suspends, or deactivates an account; immediately revokes all active sessions on suspend/deactivate.
 */
export async function updateUserStatus(req: Request, res: Response) {
  const caller = req.auth!;
  const targetUserId = Number.parseInt(req.params.userId, 10);
  const status = req.body?.status as AccountStatus;

  if (!Number.isFinite(targetUserId) || !VALID_STATUSES.includes(status)) {
    throw new ValidationError('Valid userId and status (active, pending_verification, suspended, deactivated) are required.');
  }

  const targetUser = securityStore.findUserById(targetUserId);
  if (!targetUser) {
    throw new NotFoundError('Target user not found.');
  }

  if (targetUser.id === caller.user.id) {
    throw new AuthorizationError('You cannot suspend or deactivate your own active account.');
  }

  const targetRole = securityStore.getRoleByKey(targetUser.roleKey);
  if (!isSuperAdmin(req) && (targetRole?.authorityRank ?? 0) >= caller.role.authorityRank) {
    securityStore.recordAudit({
      actorUserId: caller.user.id,
      actorEmail: caller.user.email,
      actorRole: caller.role.key,
      action: 'PRIVILEGE_ESCALATION_BLOCKED',
      outcome: 'BLOCKED',
      resource: `PATCH /api/rbac/users/${targetUserId}/status`,
      targetUserId,
      ipAddress: caller.ipAddress,
      userAgent: caller.userAgent,
      details: `Blocked status change (${status}) against equal/higher-rank account ${targetUser.email}.`,
    });
    throw new AuthorizationError('Cannot change the status of an account with equal or higher authority rank.');
  }

  const previousStatus = targetUser.status;
  const updated = securityStore.updateUserStatus(targetUser.id, status)!;

  securityStore.recordAudit({
    actorUserId: caller.user.id,
    actorEmail: caller.user.email,
    actorRole: caller.role.key,
    action: 'ACCOUNT_STATUS_CHANGED',
    outcome: status === 'suspended' || status === 'deactivated' ? 'WARNING' : 'SUCCESS',
    resource: `PATCH /api/rbac/users/${targetUserId}/status`,
    targetUserId: targetUser.id,
    ipAddress: caller.ipAddress,
    userAgent: caller.userAgent,
    details: `Changed account status of ${targetUser.email} from '${previousStatus}' to '${status}'${status === 'suspended' || status === 'deactivated' ? ' (all active sessions revoked)' : ''}.`,
  });

  return sendSuccess(res, {
    message: `Account status updated to '${status}'.`,
    user: securityStore.toPublicUser(updated),
  });
}

/**
 * GET /api/rbac/audit-logs
 */
export async function listSecurityAuditLogs(req: Request, res: Response) {
  const outcomeRaw = typeof req.query.outcome === 'string' ? req.query.outcome.toUpperCase() : undefined;
  const outcome =
    outcomeRaw === 'SUCCESS' ||
    outcomeRaw === 'DENIED' ||
    outcomeRaw === 'BLOCKED' ||
    outcomeRaw === 'WARNING'
      ? (outcomeRaw as SecurityAuditOutcome)
      : undefined;
  const action = typeof req.query.action === 'string' ? req.query.action : undefined;
  const limit = req.query.limit ? Number.parseInt(String(req.query.limit), 10) : 120;

  const logs = securityStore.listAuditLogs({ outcome, action, limit });
  return sendSuccess(res, { logs });
}
