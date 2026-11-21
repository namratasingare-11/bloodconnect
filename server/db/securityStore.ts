import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  generateOpaqueToken,
  generateRecoveryCodes,
  generateTotpSecret,
  hashPassword,
  sha256,
  verifyTotpCode,
} from '../utils/crypto';
import { env } from '../config/env';

export type PortalRole = 'donor' | 'hospital' | 'staff' | 'admin';
export type AccountStatus = 'active' | 'pending_verification' | 'suspended' | 'deactivated';
export type SecurityAuditOutcome = 'SUCCESS' | 'DENIED' | 'BLOCKED' | 'WARNING';

export interface PermissionDefinition {
  key: string;
  category: string;
  label: string;
  description: string;
}

export interface RoleRecord {
  key: string;
  name: string;
  description: string;
  authorityRank: number;
  portalScope: PortalRole;
  isSystem: boolean;
  permissions: string[];
  createdAt: string;
}

export interface SecurityUserRecord {
  id: number;
  username: string;
  email: string;
  passwordHash: string;
  fullName: string;
  phone: string;
  roleKey: string;
  status: AccountStatus;
  emailVerified: boolean;
  department?: string;
  organizationName?: string;
  licenseNumber?: string;
  donorId?: number;
  hospitalId?: number;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
}

export interface SessionRecord {
  id: string;
  userId: number;
  tokenHash: string;
  ipAddress: string;
  userAgent: string;
  createdAt: string;
  lastActiveAt: string;
  expiresAt: string;
  revokedAt?: string;
}

export interface OneTimeTokenRecord {
  id: string;
  userId: number;
  tokenHash: string;
  expiresAt: string;
  usedAt?: string;
  createdAt: string;
}

export interface LoginAttemptRecord {
  key: string;
  failureCount: number;
  firstFailedAt: string;
  lockedUntil?: string;
  updatedAt: string;
}

export interface MfaRecord {
  userId: number;
  enabled: boolean;
  secret?: string;
  pendingSecret?: string;
  recoveryCodeHashes: string[];
  enabledAt?: string;
}

export interface MfaChallengeRecord {
  id: string;
  userId: number;
  tokenHash: string;
  rememberMe: boolean;
  ipAddress: string;
  userAgent: string;
  expiresAt: string;
  usedAt?: string;
  createdAt: string;
}

export interface SecurityAuditEvent {
  id: string;
  timestamp: string;
  actorUserId?: number;
  actorEmail?: string;
  actorRole?: string;
  action: string;
  outcome: SecurityAuditOutcome;
  resource: string;
  targetUserId?: number;
  ipAddress: string;
  userAgent?: string;
  details: string;
}

interface SecurityStoreData {
  version: number;
  nextUserId: number;
  roles: RoleRecord[];
  users: SecurityUserRecord[];
  sessions: SessionRecord[];
  passwordResetTokens: OneTimeTokenRecord[];
  emailVerificationTokens: OneTimeTokenRecord[];
  loginAttempts: Record<string, LoginAttemptRecord>;
  mfaRecords: Record<string, MfaRecord>;
  mfaChallenges: MfaChallengeRecord[];
  auditLogs: SecurityAuditEvent[];
}

export interface PublicUserDTO {
  id: number;
  username: string;
  email: string;
  fullName: string;
  phone: string;
  role: PortalRole;
  roleKey: string;
  roleName: string;
  authorityRank: number;
  permissions: string[];
  status: AccountStatus;
  emailVerified: boolean;
  mfaEnabled: boolean;
  department?: string;
  organizationName?: string;
  licenseNumber?: string;
  donorId?: number;
  hospitalId?: number;
  createdAt: string;
  lastLogin?: string;
}

export const PERMISSIONS_CATALOG: readonly PermissionDefinition[] = [
  // Self-service account permissions
  { key: 'profile:read_own', category: 'Account', label: 'View Own Profile', description: 'Read own profile details and authority summary.' },
  { key: 'profile:update_own', category: 'Account', label: 'Edit Own Profile', description: 'Update own name, phone, and department info.' },
  { key: 'sessions:manage_own', category: 'Account', label: 'Manage Own Sessions', description: 'View and revoke own active login sessions.' },
  { key: 'mfa:manage_own', category: 'Account', label: 'Manage Own MFA', description: 'Enroll, verify, or disable TOTP multi-factor authentication.' },

  // User & Identity Governance
  { key: 'users:read', category: 'Users & Access', label: 'View All Users', description: 'List and inspect registered system accounts.' },
  { key: 'users:create', category: 'Users & Access', label: 'Create Users', description: 'Provision staff or departmental accounts directly.' },
  { key: 'users:update', category: 'Users & Access', label: 'Edit User Accounts', description: 'Modify other users’ departmental assignments and metadata.' },
  { key: 'users:assign_role', category: 'Users & Access', label: 'Assign User Roles', description: 'Assign roles strictly below caller authority rank.' },
  { key: 'users:manage_status', category: 'Users & Access', label: 'Activate / Suspend Users', description: 'Activate, suspend, or deactivate accounts and revoke their sessions.' },

  // Configurable RBAC Governance
  { key: 'roles:read', category: 'RBAC Configuration', label: 'View Roles & Permissions', description: 'Inspect authority hierarchy and permission matrices.' },
  { key: 'roles:manage', category: 'RBAC Configuration', label: 'Configure Roles & Permissions', description: 'Create custom roles and modify role-permission mappings.' },

  // Security & Infrastructure
  { key: 'audit:read', category: 'Security & Infrastructure', label: 'Read Security Audit Logs', description: 'Inspect authentication, authorization denials, and security events.' },
  { key: 'db:manage', category: 'Security & Infrastructure', label: 'Manage MySQL Database', description: 'Connect MySQL, run SQL queries, initialize schemas, and sync live data.' },

  // Clinical & Blood Bank Operations
  { key: 'donors:read', category: 'Clinical Operations', label: 'Read Donor Registry', description: 'View full donor registry and contact details.' },
  { key: 'donors:create', category: 'Clinical Operations', label: 'Register Donors', description: 'Add new donor records to the clinical registry.' },
  { key: 'donors:update', category: 'Clinical Operations', label: 'Update Donor Records', description: 'Edit donor eligibility, availability, and medical notes.' },
  { key: 'donors:verify', category: 'Clinical Operations', label: 'Verify Donors (Moderation)', description: 'Review and approve pending donor verifications.' },
  { key: 'inventory:read', category: 'Clinical Operations', label: 'Read Blood Inventory', description: 'Inspect cold-vault blood units and screening status.' },
  { key: 'inventory:manage', category: 'Clinical Operations', label: 'Manage Blood Inventory', description: 'Log new blood units, update storage, and quarantine stock.' },
  { key: 'requests:read', category: 'Clinical Operations', label: 'Read Blood Requests', description: 'View hospital and emergency blood requisitions.' },
  { key: 'requests:create', category: 'Clinical Operations', label: 'Submit Blood Requests', description: 'Create hospital or emergency blood requisitions.' },
  { key: 'requests:approve', category: 'Clinical Operations', label: 'Approve / Dispatch Requests', description: 'Review, cross-match, approve, reject, or fulfill requisitions.' },
  { key: 'camps:read', category: 'Camps & Appointments', label: 'View Donation Camps', description: 'Browse blood donation camps and schedules.' },
  { key: 'camps:manage', category: 'Camps & Appointments', label: 'Manage Donation Camps', description: 'Create and moderate community blood drives.' },
  { key: 'camps:register', category: 'Camps & Appointments', label: 'Register for Camps', description: 'Book a donor slot in an active blood camp.' },
  { key: 'appointments:read_own', category: 'Camps & Appointments', label: 'View Own Appointments', description: 'View personal donation appointment passes.' },
  { key: 'appointments:read_all', category: 'Camps & Appointments', label: 'View All Appointments', description: 'View all center appointments across donors.' },
  { key: 'appointments:create', category: 'Camps & Appointments', label: 'Book Donation Appointments', description: 'Schedule direct blood donation center slots.' },
  { key: 'appointments:manage', category: 'Camps & Appointments', label: 'Manage All Appointments', description: 'Check in, complete, reschedule, or cancel any appointment.' },
  { key: 'reports:read', category: 'Clinical Operations', label: 'View Analytics & Reports', description: 'Access operational analytics and compliance exports.' },
] as const;

export const VALID_PERMISSION_KEYS = new Set(PERMISSIONS_CATALOG.map((p) => p.key));

const ALL_PERMISSIONS = PERMISSIONS_CATALOG.map((p) => p.key);

function createDefaultRoles(now: string): RoleRecord[] {
  return [
    {
      key: 'super_admin',
      name: 'Super Administrator',
      description: 'Complete system control, security governance, RBAC configuration, and infrastructure administration.',
      authorityRank: 100,
      portalScope: 'admin',
      isSystem: true,
      permissions: [...ALL_PERMISSIONS],
      createdAt: now,
    },
    {
      key: 'admin',
      name: 'Administrator',
      description: 'Authorized administrative operations, user lifecycle management, database oversight, and compliance audits.',
      authorityRank: 80,
      portalScope: 'admin',
      isSystem: true,
      permissions: ALL_PERMISSIONS.filter((p) => p !== 'roles:manage'),
      createdAt: now,
    },
    {
      key: 'authority_officer',
      name: 'Authority Officer',
      description: 'Regional clinical authority overseeing blood safety, emergency dispatch approvals, inventory release, and audit review.',
      authorityRank: 65,
      portalScope: 'staff',
      isSystem: true,
      permissions: [
        'profile:read_own',
        'profile:update_own',
        'sessions:manage_own',
        'mfa:manage_own',
        'audit:read',
        'donors:read',
        'donors:create',
        'donors:update',
        'donors:verify',
        'inventory:read',
        'inventory:manage',
        'requests:read',
        'requests:create',
        'requests:approve',
        'camps:read',
        'camps:manage',
        'appointments:read_own',
        'appointments:read_all',
        'appointments:create',
        'appointments:manage',
        'reports:read',
      ],
      createdAt: now,
    },
    {
      key: 'department_manager',
      name: 'Department Manager',
      description: 'Hospital transfusion department lead managing requisitions, departmental blood requests, and camp coordination.',
      authorityRank: 50,
      portalScope: 'hospital',
      isSystem: true,
      permissions: [
        'profile:read_own',
        'profile:update_own',
        'sessions:manage_own',
        'mfa:manage_own',
        'donors:read',
        'inventory:read',
        'requests:read',
        'requests:create',
        'camps:read',
        'camps:manage',
        'appointments:read_own',
        'appointments:read_all',
        'appointments:create',
        'reports:read',
      ],
      createdAt: now,
    },
    {
      key: 'moderator',
      name: 'Moderator',
      description: 'Verification and moderation specialist reviewing donor registrations, camps, and appointment check-ins.',
      authorityRank: 35,
      portalScope: 'staff',
      isSystem: true,
      permissions: [
        'profile:read_own',
        'profile:update_own',
        'sessions:manage_own',
        'mfa:manage_own',
        'donors:read',
        'donors:verify',
        'donors:update',
        'inventory:read',
        'requests:read',
        'camps:read',
        'camps:manage',
        'appointments:read_own',
        'appointments:read_all',
        'appointments:manage',
      ],
      createdAt: now,
    },
    {
      key: 'regular_user',
      name: 'Regular User',
      description: 'Standard donor and citizen access for managing personal profile, booking donations, and registering for camps.',
      authorityRank: 10,
      portalScope: 'donor',
      isSystem: true,
      permissions: [
        'profile:read_own',
        'profile:update_own',
        'sessions:manage_own',
        'mfa:manage_own',
        'inventory:read',
        'camps:read',
        'camps:register',
        'appointments:read_own',
        'appointments:create',
      ],
      createdAt: now,
    },
    {
      key: 'guest',
      name: 'Guest',
      description: 'Unauthenticated public visitor limited to read-only blood availability and public camp listings.',
      authorityRank: 0,
      portalScope: 'donor',
      isSystem: true,
      permissions: ['inventory:read', 'camps:read'],
      createdAt: now,
    },
  ];
}

function createDefaultUsers(now: string): SecurityUserRecord[] {
  // All seeded demo accounts use real scrypt password hashes (distinct random salts per user).
  // Default testing password: Password@123
  const defaultPassword = 'Password@123';
  return [
    {
      id: 1,
      username: 'superadmin',
      email: 'superadmin@bloodconnect.org',
      passwordHash: hashPassword(defaultPassword),
      fullName: 'Dr. Vikramaditya Rao',
      phone: '+91 98200 00001',
      roleKey: 'super_admin',
      status: 'active',
      emailVerified: true,
      department: 'National Blood Safety Governance',
      organizationName: 'BloodConnect National Authority',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 2,
      username: 'sysadmin',
      email: 'admin@bloodconnect.org',
      passwordHash: hashPassword(defaultPassword),
      fullName: 'Meera Kulkarni',
      phone: '+91 98200 00002',
      roleKey: 'admin',
      status: 'active',
      emailVerified: true,
      department: 'System Operations & Compliance',
      organizationName: 'BloodConnect Operations',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 3,
      username: 'officer_sarah',
      email: 'officer@bloodconnect.org',
      passwordHash: hashPassword(defaultPassword),
      fullName: 'Dr. Sarah Jenkins',
      phone: '+91 98200 00003',
      roleKey: 'authority_officer',
      status: 'active',
      emailVerified: true,
      department: 'Regional Cold-Vault & Bio-Safety',
      organizationName: 'Central Blood Bank Authority',
      licenseNumber: 'MED-AUTH-2026-441',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 4,
      username: 'hosp_metro',
      email: 'manager@metrohealth.org',
      passwordHash: hashPassword(defaultPassword),
      fullName: 'Dr. Ananya Deshmukh',
      phone: '+91 98200 00004',
      roleKey: 'department_manager',
      status: 'active',
      emailVerified: true,
      department: 'Transfusion Medicine & ICU',
      organizationName: 'Metro Health & Trauma Institute',
      licenseNumber: 'NABH-HOSP-2026-101',
      hospitalId: 1,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 5,
      username: 'mod_kiran',
      email: 'moderator@bloodconnect.org',
      passwordHash: hashPassword(defaultPassword),
      fullName: 'Kiran Patel',
      phone: '+91 98200 00005',
      roleKey: 'moderator',
      status: 'active',
      emailVerified: true,
      department: 'Donor Verification & Camp Desk',
      organizationName: 'BloodConnect Moderation Unit',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 6,
      username: 'donor_rahul',
      email: 'rahul.sharma@donor.bloodconnect.org',
      passwordHash: hashPassword(defaultPassword),
      fullName: 'Rahul Sharma',
      phone: '+91 98201 11223',
      roleKey: 'regular_user',
      status: 'active',
      emailVerified: true,
      department: 'Voluntary Donor Network',
      donorId: 1,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 7,
      username: 'donor_priya',
      email: 'priya.nair@donor.bloodconnect.org',
      passwordHash: hashPassword(defaultPassword),
      fullName: 'Priya Nair',
      phone: '+91 98201 44556',
      roleKey: 'regular_user',
      status: 'active',
      emailVerified: false,
      department: 'Voluntary Donor Network',
      donorId: 2,
      createdAt: now,
      updatedAt: now,
    },
  ];
}

class SecurityStore {
  private readonly filePath: string;
  private data: SecurityStoreData;

  constructor() {
    const dataDir = this.resolveWritableDataDir();
    this.filePath = path.join(dataDir, 'security-store.json');
    this.data = this.loadOrInitialize();
  }

  private resolveWritableDataDir(): string {
    const tmpFallback = path.join(os.tmpdir(), 'bloodconnect-security');
    if (process.env.VERCEL === '1' || process.env.AWS_LAMBDA_FUNCTION_NAME) {
      fs.mkdirSync(tmpFallback, { recursive: true });
      return tmpFallback;
    }

    const localDir = path.resolve(process.cwd(), 'server', 'data');
    try {
      fs.mkdirSync(localDir, { recursive: true });
      fs.accessSync(localDir, fs.constants.W_OK);
      return localDir;
    } catch {
      fs.mkdirSync(tmpFallback, { recursive: true });
      return tmpFallback;
    }
  }

  private loadOrInitialize(): SecurityStoreData {
    if (fs.existsSync(this.filePath)) {
      try {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        const parsed = JSON.parse(raw) as SecurityStoreData;
        if (parsed && Array.isArray(parsed.roles) && Array.isArray(parsed.users)) {
          return parsed;
        }
      } catch (err) {
        console.error('[SecurityStore] Failed to parse existing store, re-initializing:', err);
      }
    }

    const now = new Date().toISOString();
    const initial: SecurityStoreData = {
      version: 1,
      nextUserId: 8,
      roles: createDefaultRoles(now),
      users: createDefaultUsers(now),
      sessions: [],
      passwordResetTokens: [],
      emailVerificationTokens: [],
      loginAttempts: {},
      mfaRecords: {},
      mfaChallenges: [],
      auditLogs: [
        {
          id: `evt_${generateOpaqueToken(8)}`,
          timestamp: now,
          actorRole: 'system',
          action: 'RBAC_STORE_INITIALIZED',
          outcome: 'SUCCESS',
          resource: 'security_store',
          ipAddress: '127.0.0.1',
          details: 'Initialized 7-tier configurable RBAC hierarchy and scrypt-hashed identity store.',
        },
      ],
    };

    this.data = initial;
    this.persist();
    return initial;
  }

  private persist(): void {
    const tmpPath = `${this.filePath}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(this.data, null, 2), 'utf8');
    fs.renameSync(tmpPath, this.filePath);
  }

  // ===================== ROLES & PERMISSIONS =====================

  public getRoles(): RoleRecord[] {
    return [...this.data.roles].sort((a, b) => b.authorityRank - a.authorityRank);
  }

  public getRoleByKey(roleKey: string): RoleRecord | undefined {
    return this.data.roles.find((r) => r.key === roleKey);
  }

  public createRole(input: {
    key: string;
    name: string;
    description: string;
    authorityRank: number;
    portalScope: PortalRole;
    permissions: string[];
  }): RoleRecord {
    const cleanPermissions = Array.from(
      new Set(input.permissions.filter((p) => VALID_PERMISSION_KEYS.has(p)))
    );

    const role: RoleRecord = {
      key: input.key,
      name: input.name,
      description: input.description,
      authorityRank: input.authorityRank,
      portalScope: input.portalScope,
      isSystem: false,
      permissions: cleanPermissions,
      createdAt: new Date().toISOString(),
    };

    this.data.roles.push(role);
    this.persist();
    return role;
  }

  public updateRolePermissions(roleKey: string, permissions: string[]): RoleRecord | null {
    const role = this.data.roles.find((r) => r.key === roleKey);
    if (!role) return null;

    const clean = new Set(permissions.filter((p) => VALID_PERMISSION_KEYS.has(p)));

    // Guardrail: super_admin always retains governance permissions to prevent total lockout
    if (role.key === 'super_admin') {
      clean.add('roles:read');
      clean.add('roles:manage');
      clean.add('users:read');
      clean.add('users:assign_role');
      clean.add('users:manage_status');
      clean.add('audit:read');
    }

    role.permissions = Array.from(clean);
    this.persist();
    return role;
  }

  public resolveUserPermissions(user: SecurityUserRecord): string[] {
    const role = this.getRoleByKey(user.roleKey);
    if (!role) return [];
    return [...role.permissions];
  }

  public toPublicUser(user: SecurityUserRecord): PublicUserDTO {
    const role = this.getRoleByKey(user.roleKey) ?? this.getRoleByKey('regular_user')!;
    const mfa = this.data.mfaRecords[String(user.id)];

    return {
      id: user.id,
      username: user.username,
      email: user.email,
      fullName: user.fullName,
      phone: user.phone,
      role: role.portalScope,
      roleKey: role.key,
      roleName: role.name,
      authorityRank: role.authorityRank,
      permissions: [...role.permissions],
      status: user.status,
      emailVerified: user.emailVerified,
      mfaEnabled: Boolean(mfa?.enabled),
      department: user.department,
      organizationName: user.organizationName,
      licenseNumber: user.licenseNumber,
      donorId: user.donorId,
      hospitalId: user.hospitalId,
      createdAt: user.createdAt,
      lastLogin: user.lastLoginAt,
    };
  }

  // ===================== USERS =====================

  public listUsers(): SecurityUserRecord[] {
    return [...this.data.users].sort((a, b) => a.id - b.id);
  }

  public findUserById(userId: number): SecurityUserRecord | undefined {
    return this.data.users.find((u) => u.id === userId);
  }

  public findUserByIdentifier(identifier: string): SecurityUserRecord | undefined {
    const norm = identifier.trim().toLowerCase();
    return this.data.users.find(
      (u) => u.email.toLowerCase() === norm || u.username.toLowerCase() === norm
    );
  }

  public userExists(email: string, username: string): boolean {
    const normEmail = email.trim().toLowerCase();
    const normUsername = username.trim().toLowerCase();
    return this.data.users.some(
      (u) => u.email.toLowerCase() === normEmail || u.username.toLowerCase() === normUsername
    );
  }

  public createUser(input: {
    username: string;
    email: string;
    passwordHash: string;
    fullName: string;
    phone: string;
    roleKey: string;
    status?: AccountStatus;
    emailVerified?: boolean;
    department?: string;
    organizationName?: string;
    licenseNumber?: string;
  }): SecurityUserRecord {
    const now = new Date().toISOString();
    const record: SecurityUserRecord = {
      id: this.data.nextUserId++,
      username: input.username.trim().toLowerCase(),
      email: input.email.trim().toLowerCase(),
      passwordHash: input.passwordHash,
      fullName: input.fullName.trim(),
      phone: input.phone.trim(),
      roleKey: input.roleKey,
      status: input.status ?? 'active',
      emailVerified: input.emailVerified ?? false,
      department: input.department?.trim() || undefined,
      organizationName: input.organizationName?.trim() || undefined,
      licenseNumber: input.licenseNumber?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    };
    this.data.users.push(record);
    this.persist();
    return record;
  }

  public updateUserProfile(
    userId: number,
    updates: {
      fullName?: string;
      phone?: string;
      department?: string;
      organizationName?: string;
    }
  ): SecurityUserRecord | null {
    const user = this.findUserById(userId);
    if (!user) return null;

    if (updates.fullName !== undefined) user.fullName = updates.fullName.trim();
    if (updates.phone !== undefined) user.phone = updates.phone.trim();
    if (updates.department !== undefined) user.department = updates.department.trim() || undefined;
    if (updates.organizationName !== undefined) {
      user.organizationName = updates.organizationName.trim() || undefined;
    }
    user.updatedAt = new Date().toISOString();
    this.persist();
    return user;
  }

  public updateUserPassword(userId: number, newPasswordHash: string): boolean {
    const user = this.findUserById(userId);
    if (!user) return false;
    user.passwordHash = newPasswordHash;
    user.updatedAt = new Date().toISOString();
    this.persist();
    return true;
  }

  public updateUserRole(userId: number, newRoleKey: string): SecurityUserRecord | null {
    const user = this.findUserById(userId);
    if (!user) return null;
    user.roleKey = newRoleKey;
    user.updatedAt = new Date().toISOString();
    this.persist();
    return user;
  }

  public updateUserStatus(userId: number, newStatus: AccountStatus): SecurityUserRecord | null {
    const user = this.findUserById(userId);
    if (!user) return null;
    user.status = newStatus;
    user.updatedAt = new Date().toISOString();

    // Immediately revoke all sessions whenever an account is suspended or deactivated
    if (newStatus === 'suspended' || newStatus === 'deactivated') {
      this.revokeAllUserSessionsInternal(userId);
    }

    this.persist();
    return user;
  }

  public markUserLogin(userId: number): void {
    const user = this.findUserById(userId);
    if (!user) return;
    user.lastLoginAt = new Date().toISOString();
    this.persist();
  }

  // ===================== SESSIONS =====================

  public createSession(
    userId: number,
    meta: { ipAddress: string; userAgent: string; rememberMe?: boolean }
  ): { rawToken: string; session: SessionRecord; maxAgeSeconds: number } {
    const rawToken = generateOpaqueToken(32);
    const tokenHash = sha256(rawToken);
    const now = Date.now();
    const ttlMs = meta.rememberMe
      ? env.security.rememberMeTtlDays * 24 * 60 * 60 * 1000
      : env.security.sessionTtlHours * 60 * 60 * 1000;

    const session: SessionRecord = {
      id: `sess_${generateOpaqueToken(12)}`,
      userId,
      tokenHash,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent.slice(0, 240),
      createdAt: new Date(now).toISOString(),
      lastActiveAt: new Date(now).toISOString(),
      expiresAt: new Date(now + ttlMs).toISOString(),
    };

    // Prune very old expired sessions to keep file compact
    const cutoff = now - 30 * 24 * 60 * 60 * 1000;
    this.data.sessions = this.data.sessions.filter(
      (s) => new Date(s.expiresAt).getTime() > cutoff
    );

    this.data.sessions.push(session);
    this.persist();

    return {
      rawToken,
      session,
      maxAgeSeconds: Math.floor(ttlMs / 1000),
    };
  }

  public validateSessionToken(rawToken: string): {
    session: SessionRecord;
    user: SecurityUserRecord;
  } | null {
    const tokenHash = sha256(rawToken);
    const nowMs = Date.now();
    const session = this.data.sessions.find((s) => s.tokenHash === tokenHash);
    if (!session) return null;
    if (session.revokedAt) return null;
    if (new Date(session.expiresAt).getTime() <= nowMs) return null;

    const user = this.findUserById(session.userId);
    if (!user) return null;
    if (user.status === 'suspended' || user.status === 'deactivated') {
      return null;
    }

    // Throttle lastActiveAt writes to once per 60 seconds
    if (nowMs - new Date(session.lastActiveAt).getTime() > 60_000) {
      session.lastActiveAt = new Date(nowMs).toISOString();
      this.persist();
    }

    return { session, user };
  }

  public listUserSessions(userId: number): SessionRecord[] {
    const nowMs = Date.now();
    return this.data.sessions
      .filter(
        (s) =>
          s.userId === userId &&
          !s.revokedAt &&
          new Date(s.expiresAt).getTime() > nowMs
      )
      .sort(
        (a, b) =>
          new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime()
      );
  }

  public revokeSessionById(sessionId: string, ownerUserId?: number): boolean {
    const session = this.data.sessions.find((s) => s.id === sessionId);
    if (!session) return false;
    if (ownerUserId !== undefined && session.userId !== ownerUserId) return false;
    if (session.revokedAt) return true;

    session.revokedAt = new Date().toISOString();
    this.persist();
    return true;
  }

  public revokeOtherSessions(userId: number, currentSessionId: string): number {
    const now = new Date().toISOString();
    let count = 0;
    for (const s of this.data.sessions) {
      if (s.userId === userId && s.id !== currentSessionId && !s.revokedAt) {
        s.revokedAt = now;
        count++;
      }
    }
    if (count > 0) this.persist();
    return count;
  }

  private revokeAllUserSessionsInternal(userId: number): number {
    const now = new Date().toISOString();
    let count = 0;
    for (const s of this.data.sessions) {
      if (s.userId === userId && !s.revokedAt) {
        s.revokedAt = now;
        count++;
      }
    }
    return count;
  }

  public revokeAllUserSessions(userId: number): number {
    const count = this.revokeAllUserSessionsInternal(userId);
    if (count > 0) this.persist();
    return count;
  }

  // ===================== BRUTE-FORCE PROTECTION =====================

  private checkAttemptKey(key: string): { locked: boolean; retryAfterSec: number } {
    const record = this.data.loginAttempts[key];
    if (!record || !record.lockedUntil) {
      return { locked: false, retryAfterSec: 0 };
    }
    const lockedUntilMs = new Date(record.lockedUntil).getTime();
    const nowMs = Date.now();
    if (lockedUntilMs > nowMs) {
      return {
        locked: true,
        retryAfterSec: Math.ceil((lockedUntilMs - nowMs) / 1000),
      };
    }

    // Lock expired -> reset entry
    delete this.data.loginAttempts[key];
    this.persist();
    return { locked: false, retryAfterSec: 0 };
  }

  public checkBruteForceLockout(
    identifier: string,
    ipAddress: string
  ): { locked: boolean; retryAfterSec: number } {
    const idCheck = this.checkAttemptKey(`id:${identifier.trim().toLowerCase()}`);
    if (idCheck.locked) return idCheck;
    return this.checkAttemptKey(`ip:${ipAddress}`);
  }

  public recordFailedLogin(
    identifier: string,
    ipAddress: string
  ): { lockedNow: boolean; retryAfterSec: number; attemptsUsed: number } {
    const nowMs = Date.now();
    const windowMs = env.security.lockoutWindowMinutes * 60 * 1000;
    const maxAttempts = env.security.maxLoginAttempts;

    const keys = [`id:${identifier.trim().toLowerCase()}`, `ip:${ipAddress}`];
    let lockedNow = false;
    let highestCount = 0;

    for (const key of keys) {
      const existing = this.data.loginAttempts[key];
      const windowExpired =
        !existing || nowMs - new Date(existing.firstFailedAt).getTime() > windowMs;

      const record: LoginAttemptRecord = windowExpired
        ? {
            key,
            failureCount: 1,
            firstFailedAt: new Date(nowMs).toISOString(),
            updatedAt: new Date(nowMs).toISOString(),
          }
        : {
            ...existing,
            failureCount: existing.failureCount + 1,
            updatedAt: new Date(nowMs).toISOString(),
          };

      if (record.failureCount >= maxAttempts) {
        record.lockedUntil = new Date(nowMs + windowMs).toISOString();
        lockedNow = true;
      }
      if (record.failureCount > highestCount) {
        highestCount = record.failureCount;
      }

      this.data.loginAttempts[key] = record;
    }

    this.persist();
    return {
      lockedNow,
      retryAfterSec: lockedNow ? Math.ceil(windowMs / 1000) : 0,
      attemptsUsed: highestCount,
    };
  }

  public clearLoginAttempts(identifier: string, ipAddress: string): void {
    delete this.data.loginAttempts[`id:${identifier.trim().toLowerCase()}`];
    delete this.data.loginAttempts[`ip:${ipAddress}`];
    this.persist();
  }

  // ===================== PASSWORD RESET & EMAIL VERIFICATION =====================

  public issuePasswordResetToken(userId: number): { rawToken: string; expiresAt: string } {
    const nowMs = Date.now();
    const expiresAt = new Date(
      nowMs + env.security.passwordResetTtlMinutes * 60 * 1000
    ).toISOString();

    // Invalidate any prior unused reset tokens for this user
    for (const t of this.data.passwordResetTokens) {
      if (t.userId === userId && !t.usedAt) {
        t.usedAt = new Date(nowMs).toISOString();
      }
    }

    const rawToken = generateOpaqueToken(24);
    this.data.passwordResetTokens.push({
      id: `rst_${generateOpaqueToken(8)}`,
      userId,
      tokenHash: sha256(rawToken),
      expiresAt,
      createdAt: new Date(nowMs).toISOString(),
    });

    this.persist();
    return { rawToken, expiresAt };
  }

  public consumePasswordResetToken(rawToken: string): SecurityUserRecord | null {
    const tokenHash = sha256(rawToken.trim());
    const nowMs = Date.now();
    const record = this.data.passwordResetTokens.find((t) => t.tokenHash === tokenHash);
    if (!record || record.usedAt) return null;
    if (new Date(record.expiresAt).getTime() <= nowMs) return null;

    const user = this.findUserById(record.userId);
    if (!user) return null;

    record.usedAt = new Date(nowMs).toISOString();
    this.persist();
    return user;
  }

  public issueEmailVerificationToken(userId: number): { rawToken: string; expiresAt: string } {
    const nowMs = Date.now();
    const expiresAt = new Date(
      nowMs + env.security.emailVerificationTtlHours * 60 * 60 * 1000
    ).toISOString();

    for (const t of this.data.emailVerificationTokens) {
      if (t.userId === userId && !t.usedAt) {
        t.usedAt = new Date(nowMs).toISOString();
      }
    }

    const rawToken = generateOpaqueToken(24);
    this.data.emailVerificationTokens.push({
      id: `ver_${generateOpaqueToken(8)}`,
      userId,
      tokenHash: sha256(rawToken),
      expiresAt,
      createdAt: new Date(nowMs).toISOString(),
    });

    this.persist();
    return { rawToken, expiresAt };
  }

  public consumeEmailVerificationToken(rawToken: string): SecurityUserRecord | null {
    const tokenHash = sha256(rawToken.trim());
    const nowMs = Date.now();
    const record = this.data.emailVerificationTokens.find((t) => t.tokenHash === tokenHash);
    if (!record || record.usedAt) return null;
    if (new Date(record.expiresAt).getTime() <= nowMs) return null;

    const user = this.findUserById(record.userId);
    if (!user) return null;

    record.usedAt = new Date(nowMs).toISOString();
    user.emailVerified = true;
    if (user.status === 'pending_verification') {
      user.status = 'active';
    }
    user.updatedAt = new Date(nowMs).toISOString();
    this.persist();
    return user;
  }

  // ===================== MULTI-FACTOR AUTHENTICATION (RFC 6238 TOTP) =====================

  public getMfaStatus(userId: number): { enabled: boolean; recoveryCodesRemaining: number; enabledAt?: string } {
    const record = this.data.mfaRecords[String(userId)];
    if (!record) {
      return { enabled: false, recoveryCodesRemaining: 0 };
    }
    return {
      enabled: record.enabled,
      recoveryCodesRemaining: record.recoveryCodeHashes.length,
      enabledAt: record.enabledAt,
    };
  }

  public beginMfaEnrollment(userId: number): { secret: string } {
    const secret = generateTotpSecret();
    const existing = this.data.mfaRecords[String(userId)];
    this.data.mfaRecords[String(userId)] = {
      userId,
      enabled: existing?.enabled ?? false,
      secret: existing?.secret,
      pendingSecret: secret,
      recoveryCodeHashes: existing?.recoveryCodeHashes ?? [],
      enabledAt: existing?.enabledAt,
    };
    this.persist();
    return { secret };
  }

  public confirmMfaEnrollment(
    userId: number,
    totpCode: string
  ): { success: boolean; recoveryCodes?: string[] } {
    const record = this.data.mfaRecords[String(userId)];
    if (!record || !record.pendingSecret) {
      return { success: false };
    }
    if (!verifyTotpCode(record.pendingSecret, totpCode)) {
      return { success: false };
    }

    const recoveryCodes = generateRecoveryCodes(8);
    record.secret = record.pendingSecret;
    record.pendingSecret = undefined;
    record.enabled = true;
    record.enabledAt = new Date().toISOString();
    record.recoveryCodeHashes = recoveryCodes.map((c) => sha256(c.toUpperCase()));
    this.persist();

    return { success: true, recoveryCodes };
  }

  public verifyUserMfaCode(userId: number, code: string): { verified: boolean; usedRecoveryCode: boolean } {
    const record = this.data.mfaRecords[String(userId)];
    if (!record || !record.enabled || !record.secret) {
      return { verified: false, usedRecoveryCode: false };
    }

    const cleaned = code.trim();
    if (verifyTotpCode(record.secret, cleaned)) {
      return { verified: true, usedRecoveryCode: false };
    }

    const normalizedRecovery = cleaned.toUpperCase();
    const hashed = sha256(normalizedRecovery);
    const idx = record.recoveryCodeHashes.indexOf(hashed);
    if (idx !== -1) {
      // Single-use recovery code: remove upon consumption
      record.recoveryCodeHashes.splice(idx, 1);
      this.persist();
      return { verified: true, usedRecoveryCode: true };
    }

    return { verified: false, usedRecoveryCode: false };
  }

  public disableMfa(userId: number): void {
    delete this.data.mfaRecords[String(userId)];
    this.persist();
  }

  public createMfaChallenge(
    userId: number,
    meta: { rememberMe: boolean; ipAddress: string; userAgent: string }
  ): { challengeToken: string; expiresAt: string } {
    const nowMs = Date.now();
    const challengeToken = generateOpaqueToken(24);
    const expiresAt = new Date(nowMs + 5 * 60 * 1000).toISOString();

    this.data.mfaChallenges = this.data.mfaChallenges.filter(
      (c) => new Date(c.expiresAt).getTime() > nowMs && !c.usedAt
    );

    this.data.mfaChallenges.push({
      id: `mfa_${generateOpaqueToken(8)}`,
      userId,
      tokenHash: sha256(challengeToken),
      rememberMe: meta.rememberMe,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      expiresAt,
      createdAt: new Date(nowMs).toISOString(),
    });
    this.persist();
    return { challengeToken, expiresAt };
  }

  public getActiveMfaChallenge(challengeToken: string): MfaChallengeRecord | null {
    const hash = sha256(challengeToken.trim());
    const nowMs = Date.now();
    const record = this.data.mfaChallenges.find((c) => c.tokenHash === hash);
    if (!record || record.usedAt) return null;
    if (new Date(record.expiresAt).getTime() <= nowMs) return null;
    return record;
  }

  public consumeMfaChallenge(challengeId: string): void {
    const record = this.data.mfaChallenges.find((c) => c.id === challengeId);
    if (record) {
      record.usedAt = new Date().toISOString();
      this.persist();
    }
  }

  // ===================== SECURITY AUDIT LOGS =====================

  public recordAudit(event: Omit<SecurityAuditEvent, 'id' | 'timestamp'>): SecurityAuditEvent {
    const entry: SecurityAuditEvent = {
      id: `evt_${generateOpaqueToken(8)}`,
      timestamp: new Date().toISOString(),
      ...event,
    };
    this.data.auditLogs.unshift(entry);
    if (this.data.auditLogs.length > 500) {
      this.data.auditLogs = this.data.auditLogs.slice(0, 500);
    }
    this.persist();
    return entry;
  }

  public listAuditLogs(options?: {
    outcome?: SecurityAuditOutcome;
    action?: string;
    limit?: number;
  }): SecurityAuditEvent[] {
    let items = this.data.auditLogs;
    if (options?.outcome) {
      items = items.filter((e) => e.outcome === options.outcome);
    }
    if (options?.action) {
      const q = options.action.toLowerCase();
      items = items.filter((e) => e.action.toLowerCase().includes(q));
    }
    const limit = Math.min(Math.max(options?.limit ?? 100, 1), 500);
    return items.slice(0, limit);
  }
}

export const securityStore = new SecurityStore();
