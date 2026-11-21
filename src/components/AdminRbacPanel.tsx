import { useState, useEffect, useMemo, FormEvent } from 'react';
import {
  ShieldCheck,
  Users,
  KeyRound,
  FileWarning,
  Plus,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  UserPlus,
  Save,
} from 'lucide-react';
import {
  AccountStatus,
  PermissionDefinition,
  RbacRole,
  SecurityAuditEvent,
  User,
  UserRole,
} from '../types';
import { rbacApi } from '../services/rbacApi';
import { ApiClientError } from '../services/apiClient';

interface AdminRbacPanelProps {
  currentUser: User;
}

export default function AdminRbacPanel({ currentUser }: AdminRbacPanelProps) {
  const [subTab, setSubTab] = useState<'users' | 'roles' | 'audit'>('users');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<RbacRole[]>([]);
  const [permissionsCatalog, setPermissionsCatalog] = useState<PermissionDefinition[]>([]);
  const [auditLogs, setAuditLogs] = useState<SecurityAuditEvent[]>([]);
  const [auditFilter, setAuditFilter] = useState<string>('ALL');

  // Role Permission Editor
  const [selectedRoleKey, setSelectedRoleKey] = useState<string>('moderator');
  const [draftPermissions, setDraftPermissions] = useState<Set<string>>(new Set());
  const [savingRole, setSavingRole] = useState(false);

  // Create Custom Role form
  const [newRoleOpen, setNewRoleOpen] = useState(false);
  const [newRoleKey, setNewRoleKey] = useState('');
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleDesc, setNewRoleDesc] = useState('');
  const [newRoleRank, setNewRoleRank] = useState(40);
  const [newRoleScope, setNewRoleScope] = useState<UserRole>('staff');

  // Provision User form
  const [newUserOpen, setNewUserOpen] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRoleKey, setNewUserRoleKey] = useState('moderator');
  const [newUserDept, setNewUserDept] = useState('');

  const myPermissions = useMemo(() => new Set(currentUser.permissions ?? []), [currentUser]);
  const myRank = currentUser.authorityRank ?? 0;
  const isSuperAdmin = currentUser.roleKey === 'super_admin';

  const clearMessages = () => {
    setErrorMsg(null);
    setSuccessMsg(null);
  };

  const loadData = async () => {
    setLoading(true);
    clearMessages();
    try {
      const promises: Promise<void>[] = [];
      if (myPermissions.has('users:read')) {
        promises.push(
          rbacApi.listUsers().then((r) => {
            setUsers(r.users);
          })
        );
      }
      if (myPermissions.has('roles:read')) {
        promises.push(
          rbacApi.listRoles().then((r) => {
            setRoles(r.roles);
          })
        );
        promises.push(
          rbacApi.listPermissions().then((r) => {
            setPermissionsCatalog(r.permissions);
          })
        );
      }
      if (myPermissions.has('audit:read')) {
        promises.push(
          rbacApi
            .listAuditLogs({ outcome: auditFilter, limit: 120 })
            .then((r) => {
              setAuditLogs(r.logs);
            })
        );
      }
      await Promise.all(promises);
    } catch (err: unknown) {
      setErrorMsg(err instanceof ApiClientError ? err.message : 'Unable to load RBAC governance data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auditFilter]);

  useEffect(() => {
    const role = roles.find((r) => r.key === selectedRoleKey);
    if (role) {
      setDraftPermissions(new Set(role.permissions));
    }
  }, [roles, selectedRoleKey]);

  const groupedPermissions = useMemo(() => {
    const groups = new Map<string, PermissionDefinition[]>();
    for (const p of permissionsCatalog) {
      const list = groups.get(p.category) ?? [];
      list.push(p);
      groups.set(p.category, list);
    }
    return Array.from(groups.entries());
  }, [permissionsCatalog]);

  const handleAssignRole = async (userId: number, roleKey: string) => {
    clearMessages();
    try {
      const res = await rbacApi.assignUserRole(userId, roleKey);
      setSuccessMsg(res.message);
      await loadData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof ApiClientError ? err.message : 'Role update denied by server.');
    }
  };

  const handleUpdateStatus = async (userId: number, status: AccountStatus) => {
    clearMessages();
    try {
      const res = await rbacApi.updateUserStatus(userId, status);
      setSuccessMsg(res.message);
      await loadData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof ApiClientError ? err.message : 'Status update denied by server.');
    }
  };

  const handleProvisionUser = async (e: FormEvent) => {
    e.preventDefault();
    clearMessages();
    try {
      await rbacApi.createUser({
        fullName: newUserName.trim(),
        email: newUserEmail.trim(),
        password: newUserPassword,
        roleKey: newUserRoleKey,
        department: newUserDept.trim() || undefined,
      });
      setSuccessMsg(`Provisioned ${newUserEmail.trim()} with role '${newUserRoleKey}'.`);
      setNewUserName('');
      setNewUserEmail('');
      setNewUserPassword('');
      setNewUserDept('');
      setNewUserOpen(false);
      await loadData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof ApiClientError ? err.message : 'Unable to create user.');
    }
  };

  const handleSaveRolePermissions = async () => {
    clearMessages();
    setSavingRole(true);
    try {
      const res = await rbacApi.updateRolePermissions(selectedRoleKey, Array.from(draftPermissions));
      setSuccessMsg(res.message);
      await loadData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof ApiClientError ? err.message : 'Failed to update role permissions.');
    } finally {
      setSavingRole(false);
    }
  };

  const handleCreateCustomRole = async (e: FormEvent) => {
    e.preventDefault();
    clearMessages();
    try {
      const res = await rbacApi.createRole({
        key: newRoleKey.trim().toLowerCase(),
        name: newRoleName.trim(),
        description: newRoleDesc.trim() || 'Custom configured role',
        authorityRank: Number(newRoleRank),
        portalScope: newRoleScope,
        permissions: ['profile:read_own', 'profile:update_own', 'sessions:manage_own'],
      });
      setSuccessMsg(`Created custom role '${res.role.name}' (${res.role.key}).`);
      setNewRoleKey('');
      setNewRoleName('');
      setNewRoleDesc('');
      setNewRoleOpen(false);
      setSelectedRoleKey(res.role.key);
      await loadData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof ApiClientError ? err.message : 'Unable to create custom role.');
    }
  };

  const selectedRole = roles.find((r) => r.key === selectedRoleKey);
  const canEditSelectedRole =
    myPermissions.has('roles:manage') &&
    selectedRole &&
    (isSuperAdmin || selectedRole.authorityRank < myRank);

  return (
    <div className="space-y-5">
      {/* Sub-navigation bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setSubTab('users');
              clearMessages();
            }}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer ${
              subTab === 'users'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Users &amp; Lifecycle ({users.length})</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setSubTab('roles');
              clearMessages();
            }}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer ${
              subTab === 'roles'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>Roles &amp; Permissions Matrix ({roles.length})</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setSubTab('audit');
              clearMessages();
            }}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer ${
              subTab === 'audit'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <FileWarning className="w-3.5 h-3.5" />
            <span>Security Audit Log ({auditLogs.length})</span>
          </button>
        </div>

        <button
          type="button"
          onClick={loadData}
          disabled={loading}
          className="px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5 cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Sync Live State</span>
        </button>
      </div>

      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <span className="font-medium">{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-start gap-2.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <span className="font-medium">{successMsg}</span>
        </div>
      )}

      {/* SUB-TAB 1: USERS & ACCOUNT LIFECYCLE */}
      {subTab === 'users' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-slate-900">Identity &amp; Authority Directory</h3>
              <p className="text-xs text-slate-500">
                Anti-escalation enforced server-side: you may only modify accounts and assign roles strictly
                below your authority rank ({myRank}).
              </p>
            </div>
            {myPermissions.has('users:create') && (
              <button
                type="button"
                onClick={() => setNewUserOpen(!newUserOpen)}
                className="px-3.5 py-2 rounded-xl bg-rose-700 hover:bg-rose-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Provision Account</span>
              </button>
            )}
          </div>

          {newUserOpen && (
            <form
              onSubmit={handleProvisionUser}
              className="p-4 rounded-xl bg-slate-50 border border-slate-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
            >
              <input
                type="text"
                required
                value={newUserName}
                onChange={(e) => setNewUserName(e.target.value)}
                placeholder="Full Name *"
                className="px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"
              />
              <input
                type="email"
                required
                value={newUserEmail}
                onChange={(e) => setNewUserEmail(e.target.value)}
                placeholder="Official Email *"
                className="px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"
              />
              <input
                type="password"
                required
                value={newUserPassword}
                onChange={(e) => setNewUserPassword(e.target.value)}
                placeholder="Initial Strong Password *"
                className="px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"
              />
              <select
                value={newUserRoleKey}
                onChange={(e) => setNewUserRoleKey(e.target.value)}
                className="px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"
              >
                {roles
                  .filter((r) => r.key !== 'guest' && (isSuperAdmin || r.authorityRank < myRank))
                  .map((r) => (
                    <option key={r.key} value={r.key}>
                      {r.name} (Rank {r.authorityRank})
                    </option>
                  ))}
              </select>
              <input
                type="text"
                value={newUserDept}
                onChange={(e) => setNewUserDept(e.target.value)}
                placeholder="Department (optional)"
                className="px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"
              />
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer"
              >
                Create Verified Account
              </button>
            </form>
          )}

          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 text-slate-900 font-semibold border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Authority Role</th>
                  <th className="px-4 py-3">Security</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Account Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u) => {
                  const targetRank = u.authorityRank ?? 0;
                  const canManageTarget =
                    u.id !== currentUser.id && (isSuperAdmin || targetRank < myRank);

                  return (
                    <tr key={u.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900">{u.fullName}</div>
                        <div className="text-[11px] text-slate-500">{u.email}</div>
                        {u.department && (
                          <div className="text-[10px] text-slate-400">{u.department}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {myPermissions.has('users:assign_role') && canManageTarget ? (
                          <select
                            value={u.roleKey || 'regular_user'}
                            onChange={(e) => handleAssignRole(u.id, e.target.value)}
                            className="px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white text-xs font-medium text-slate-800"
                          >
                            {roles
                              .filter(
                                (r) =>
                                  r.key !== 'guest' && (isSuperAdmin || r.authorityRank < myRank)
                              )
                              .map((r) => (
                                <option key={r.key} value={r.key}>
                                  {r.name} (Rank {r.authorityRank})
                                </option>
                              ))}
                          </select>
                        ) : (
                          <span className="font-medium text-slate-900">
                            {u.roleName || u.role} (Rank {targetRank})
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[11px] space-y-0.5">
                        <div className={u.emailVerified ? 'text-emerald-700' : 'text-amber-700'}>
                          {u.emailVerified ? 'Email Verified' : 'Email Unverified'}
                        </div>
                        <div className={u.mfaEnabled ? 'text-emerald-700 font-semibold' : 'text-slate-400'}>
                          MFA: {u.mfaEnabled ? 'TOTP Active' : 'Off'}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                            u.status === 'active'
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              : u.status === 'suspended'
                              ? 'bg-amber-50 text-amber-800 border border-amber-200'
                              : 'bg-rose-50 text-rose-800 border border-rose-200'
                          }`}
                        >
                          {u.status || 'active'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {myPermissions.has('users:manage_status') && canManageTarget ? (
                          <div className="flex items-center gap-1.5">
                            {u.status !== 'active' && (
                              <button
                                type="button"
                                onClick={() => handleUpdateStatus(u.id, 'active')}
                                className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold cursor-pointer"
                              >
                                Activate
                              </button>
                            )}
                            {u.status !== 'suspended' && (
                              <button
                                type="button"
                                onClick={() => handleUpdateStatus(u.id, 'suspended')}
                                className="px-2.5 py-1 rounded-lg border border-amber-300 text-amber-800 hover:bg-amber-50 text-[11px] font-semibold cursor-pointer"
                              >
                                Suspend
                              </button>
                            )}
                            {u.status !== 'deactivated' && (
                              <button
                                type="button"
                                onClick={() => handleUpdateStatus(u.id, 'deactivated')}
                                className="px-2.5 py-1 rounded-lg border border-rose-300 text-rose-700 hover:bg-rose-50 text-[11px] font-semibold cursor-pointer"
                              >
                                Deactivate
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400">
                            {u.id === currentUser.id ? 'Current User' : 'Protected Rank'}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUB-TAB 2: CONFIGURABLE ROLES & PERMISSIONS MATRIX */}
      {subTab === 'roles' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">Authority Hierarchy</h3>
              {myPermissions.has('roles:manage') && (
                <button
                  type="button"
                  onClick={() => setNewRoleOpen(!newRoleOpen)}
                  className="px-2.5 py-1 rounded-lg bg-slate-900 text-white text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                  <span>New Role</span>
                </button>
              )}
            </div>

            {newRoleOpen && (
              <form
                onSubmit={handleCreateCustomRole}
                className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs"
              >
                <input
                  type="text"
                  required
                  value={newRoleKey}
                  onChange={(e) => setNewRoleKey(e.target.value)}
                  placeholder="role_key (e.g. lab_auditor)"
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-mono text-[11px]"
                />
                <input
                  type="text"
                  required
                  value={newRoleName}
                  onChange={(e) => setNewRoleName(e.target.value)}
                  placeholder="Display Name"
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                />
                <input
                  type="text"
                  value={newRoleDesc}
                  onChange={(e) => setNewRoleDesc(e.target.value)}
                  placeholder="Description"
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    min={1}
                    max={isSuperAdmin ? 99 : Math.max(1, myRank - 1)}
                    value={newRoleRank}
                    onChange={(e) => setNewRoleRank(Number(e.target.value))}
                    className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                  />
                  <select
                    value={newRoleScope}
                    onChange={(e) => setNewRoleScope(e.target.value as UserRole)}
                    className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                  >
                    <option value="donor">Donor Portal</option>
                    <option value="hospital">Hospital Portal</option>
                    <option value="staff">Staff Portal</option>
                    <option value="admin">Admin Portal</option>
                  </select>
                </div>
                <button
                  type="submit"
                  className="w-full py-1.5 rounded-lg bg-rose-700 text-white font-semibold cursor-pointer"
                >
                  Create Custom Role
                </button>
              </form>
            )}

            <div className="space-y-1.5">
              {roles.map((role) => (
                <button
                  key={role.key}
                  type="button"
                  onClick={() => {
                    setSelectedRoleKey(role.key);
                    clearMessages();
                  }}
                  className={`w-full text-left p-3 rounded-xl border transition-colors cursor-pointer ${
                    selectedRoleKey === role.key
                      ? 'bg-rose-50 border-rose-300'
                      : 'bg-white border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900">{role.name}</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                      Rank {role.authorityRank}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">
                    {role.description}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1 flex items-center justify-between">
                    <span>{role.permissions.length} permissions</span>
                    <span>{role.userCount ?? 0} user(s)</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
            {selectedRole ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-200">
                  <div>
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-rose-700" />
                      <h3 className="text-base font-bold text-slate-900">{selectedRole.name}</h3>
                      <span className="text-[11px] font-mono text-slate-500">
                        ({selectedRole.key})
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">{selectedRole.description}</p>
                  </div>

                  {canEditSelectedRole ? (
                    <button
                      type="button"
                      onClick={handleSaveRolePermissions}
                      disabled={savingRole}
                      className="px-4 py-2 rounded-xl bg-rose-700 hover:bg-rose-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>{savingRole ? 'Saving...' : 'Save Permissions'}</span>
                    </button>
                  ) : (
                    <span className="text-xs text-slate-500">Read-only (requires Super Administrator)</span>
                  )}
                </div>

                <div className="space-y-5">
                  {groupedPermissions.map(([category, perms]) => (
                    <div key={category} className="space-y-2">
                      <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
                        {category}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {perms.map((perm) => {
                          const checked = draftPermissions.has(perm.key);
                          return (
                            <label
                              key={perm.key}
                              className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 ${
                                checked
                                  ? 'bg-emerald-50/50 border-emerald-200'
                                  : 'bg-white border-slate-200'
                              } ${canEditSelectedRole ? 'cursor-pointer' : 'opacity-75'}`}
                            >
                              <input
                                type="checkbox"
                                disabled={!canEditSelectedRole}
                                checked={checked}
                                onChange={() => {
                                  const next = new Set(draftPermissions);
                                  if (next.has(perm.key)) next.delete(perm.key);
                                  else next.add(perm.key);
                                  setDraftPermissions(next);
                                }}
                                className="mt-0.5 rounded border-slate-300 text-rose-700 focus:ring-rose-700"
                              />
                              <div className="min-w-0">
                                <div className="font-semibold text-slate-900">{perm.label}</div>
                                <div className="font-mono text-[10px] text-slate-500">{perm.key}</div>
                                <div className="text-[11px] text-slate-500 mt-0.5">
                                  {perm.description}
                                </div>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="py-12 text-center text-xs text-slate-500">
                Select a role from the hierarchy to inspect or configure its permissions.
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUB-TAB 3: SECURITY & AUTHORIZATION AUDIT TRAIL */}
      {subTab === 'audit' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Server Security &amp; Authorization Audit Trail
              </h3>
              <p className="text-xs text-slate-500">
                Records every login, authorization denial (403), brute-force lockout (429), privilege
                escalation block, MFA event, and session revocation.
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              {['ALL', 'DENIED', 'BLOCKED', 'WARNING', 'SUCCESS'].map((outcome) => (
                <button
                  key={outcome}
                  type="button"
                  onClick={() => setAuditFilter(outcome)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold cursor-pointer ${
                    auditFilter === outcome
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {outcome}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 text-slate-900 font-semibold border-b border-slate-200">
                <tr>
                  <th className="px-3.5 py-2.5">Time</th>
                  <th className="px-3.5 py-2.5">Actor</th>
                  <th className="px-3.5 py-2.5">Action</th>
                  <th className="px-3.5 py-2.5">Outcome</th>
                  <th className="px-3.5 py-2.5">Resource</th>
                  <th className="px-3.5 py-2.5">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {auditLogs.map((ev) => (
                  <tr key={ev.id} className="hover:bg-slate-50">
                    <td className="px-3.5 py-2.5 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                      {new Date(ev.timestamp).toLocaleTimeString()}
                    </td>
                    <td className="px-3.5 py-2.5">
                      <div className="font-medium text-slate-900">{ev.actorEmail || 'Unauthenticated'}</div>
                      <div className="text-[10px] font-mono text-slate-500">
                        {ev.actorRole || 'guest'} · {ev.ipAddress}
                      </div>
                    </td>
                    <td className="px-3.5 py-2.5 font-mono text-[11px] font-semibold text-slate-800">
                      {ev.action}
                    </td>
                    <td className="px-3.5 py-2.5">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          ev.outcome === 'SUCCESS'
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            : ev.outcome === 'WARNING'
                            ? 'bg-amber-50 text-amber-800 border border-amber-200'
                            : 'bg-rose-50 text-rose-800 border border-rose-200'
                        }`}
                      >
                        {ev.outcome}
                      </span>
                    </td>
                    <td className="px-3.5 py-2.5 font-mono text-[11px] text-slate-600 max-w-[180px] truncate">
                      {ev.resource}
                    </td>
                    <td className="px-3.5 py-2.5 text-slate-700 max-w-xs">{ev.details}</td>
                  </tr>
                ))}
                {auditLogs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                      No matching security audit events found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
