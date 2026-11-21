import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import {
  requirePermission,
  requireSelfOrPermission,
} from '../middleware/auth.middleware';
import {
  adminCreateUser,
  assignUserRole,
  createCustomRole,
  getUserById,
  listPermissions,
  listRoles,
  listSecurityAuditLogs,
  listUsers,
  updateRolePermissions,
  updateUserStatus,
} from '../controllers/rbac.controller';

const router = Router();

// Roles & Permissions Configuration
router.get('/roles', requirePermission('roles:read'), asyncHandler(listRoles));
router.get('/permissions', requirePermission('roles:read'), asyncHandler(listPermissions));
router.post('/roles', requirePermission('roles:manage'), asyncHandler(createCustomRole));
router.put(
  '/roles/:roleKey/permissions',
  requirePermission('roles:manage'),
  asyncHandler(updateRolePermissions)
);

// Users & Account Lifecycle Governance
router.get('/users', requirePermission('users:read'), asyncHandler(listUsers));
router.post('/users', requirePermission('users:create'), asyncHandler(adminCreateUser));
router.get(
  '/users/:userId',
  requireSelfOrPermission((req) => {
    const id = Number.parseInt(req.params.userId, 10);
    return Number.isFinite(id) ? id : null;
  }, 'users:read'),
  asyncHandler(getUserById)
);
router.patch(
  '/users/:userId/role',
  requirePermission('users:assign_role'),
  asyncHandler(assignUserRole)
);
router.patch(
  '/users/:userId/status',
  requirePermission('users:manage_status'),
  asyncHandler(updateUserStatus)
);

// Security & Authorization Audit Logs
router.get('/audit-logs', requirePermission('audit:read'), asyncHandler(listSecurityAuditLogs));

export default router;
