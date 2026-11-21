import { apiClient } from './apiClient';
import {
  AccountStatus,
  PermissionDefinition,
  RbacRole,
  SecurityAuditEvent,
  User,
  UserRole,
} from '../types';

export const rbacApi = {
  listRoles: () => apiClient.get<{ success: boolean; roles: RbacRole[] }>('/api/rbac/roles'),

  listPermissions: () =>
    apiClient.get<{ success: boolean; permissions: PermissionDefinition[] }>('/api/rbac/permissions'),

  createRole: (payload: {
    key: string;
    name: string;
    description: string;
    authorityRank: number;
    portalScope: UserRole;
    permissions: string[];
  }) => apiClient.post<{ success: boolean; role: RbacRole }>('/api/rbac/roles', payload),

  updateRolePermissions: (roleKey: string, permissions: string[]) =>
    apiClient.put<{ success: boolean; message: string; role: RbacRole }>(
      `/api/rbac/roles/${encodeURIComponent(roleKey)}/permissions`,
      { permissions }
    ),

  listUsers: () => apiClient.get<{ success: boolean; users: User[] }>('/api/rbac/users'),

  createUser: (payload: {
    fullName: string;
    email: string;
    phone?: string;
    password: string;
    roleKey: string;
    department?: string;
    organizationName?: string;
  }) => apiClient.post<{ success: boolean; user: User }>('/api/rbac/users', payload),

  assignUserRole: (userId: number, roleKey: string) =>
    apiClient.patch<{ success: boolean; message: string; user: User }>(
      `/api/rbac/users/${userId}/role`,
      { roleKey }
    ),

  updateUserStatus: (userId: number, status: AccountStatus) =>
    apiClient.patch<{ success: boolean; message: string; user: User }>(
      `/api/rbac/users/${userId}/status`,
      { status }
    ),

  listAuditLogs: (params?: { outcome?: string; action?: string; limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.outcome && params.outcome !== 'ALL') query.set('outcome', params.outcome);
    if (params?.action) query.set('action', params.action);
    if (params?.limit) query.set('limit', String(params.limit));
    const qs = query.toString();
    return apiClient.get<{ success: boolean; logs: SecurityAuditEvent[] }>(
      `/api/rbac/audit-logs${qs ? `?${qs}` : ''}`
    );
  },
};
