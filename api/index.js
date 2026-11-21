// server/app.ts
import express from "express";

// server/routes/index.ts
import { Router as Router10 } from "express";

// server/routes/database.routes.ts
import { Router } from "express";

// server/middleware/asyncHandler.ts
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// server/db/securityStore.ts
import fs from "fs";
import os from "os";
import path from "path";

// server/utils/crypto.ts
import crypto from "crypto";
var SCRYPT_PREFIX = "scrypt$";
var KEY_LENGTH = 64;
var SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1 };
var BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function hashPassword(plain) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(plain, salt, KEY_LENGTH, SCRYPT_OPTIONS).toString("hex");
  return `${SCRYPT_PREFIX}${salt}$${derived}`;
}
function verifyPassword(plain, storedHash) {
  if (!plain || !storedHash) return false;
  if (storedHash.startsWith(SCRYPT_PREFIX)) {
    const parts = storedHash.split("$");
    if (parts.length !== 3) return false;
    const [, salt, hashHex] = parts;
    const derivedBuf = crypto.scryptSync(plain, salt, KEY_LENGTH, SCRYPT_OPTIONS);
    const storedBuf = Buffer.from(hashHex, "hex");
    if (derivedBuf.length !== storedBuf.length) return false;
    return crypto.timingSafeEqual(derivedBuf, storedBuf);
  }
  return false;
}
function generateOpaqueToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}
function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}
function safeEqual(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buffer) {
    value = value << 8 | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[value >>> bits - 5 & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[value << 5 - bits & 31];
  }
  return output;
}
function base32Decode(input) {
  const cleaned = input.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const char of cleaned) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) continue;
    value = value << 5 | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push(value >>> bits - 8 & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}
function generateTotpSecret() {
  return base32Encode(crypto.randomBytes(20));
}
function generateTotpCode(secretBase32, stepOffset = 0, timestampMs = Date.now()) {
  const key = base32Decode(secretBase32);
  const counter = Math.floor(timestampMs / 1e3 / 30) + stepOffset;
  const counterBuf = Buffer.alloc(8);
  const high = Math.floor(counter / 4294967296);
  const low = counter >>> 0;
  counterBuf.writeUInt32BE(high, 0);
  counterBuf.writeUInt32BE(low, 4);
  const hmac = crypto.createHmac("sha1", key).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 15;
  const binary = (hmac[offset] & 127) << 24 | (hmac[offset + 1] & 255) << 16 | (hmac[offset + 2] & 255) << 8 | hmac[offset + 3] & 255;
  const otp = binary % 1e6;
  return otp.toString().padStart(6, "0");
}
function verifyTotpCode(secretBase32, candidateCode, window = 1) {
  const normalized = candidateCode.replace(/\s+/g, "").trim();
  if (!/^\d{6}$/.test(normalized)) return false;
  const now = Date.now();
  for (let offset = -window; offset <= window; offset++) {
    const expected = generateTotpCode(secretBase32, offset, now);
    if (safeEqual(normalized, expected)) {
      return true;
    }
  }
  return false;
}
function buildOtpAuthUri(accountEmail, secretBase32, issuer = "BloodConnect") {
  const label = encodeURIComponent(`${issuer}:${accountEmail}`);
  const encodedIssuer = encodeURIComponent(issuer);
  return `otpauth://totp/${label}?secret=${secretBase32}&issuer=${encodedIssuer}&algorithm=SHA1&digits=6&period=30`;
}
function generateRecoveryCodes(count = 8) {
  const codes = [];
  for (let i = 0; i < count; i++) {
    const raw = crypto.randomBytes(4).toString("hex").toUpperCase();
    codes.push(`${raw.slice(0, 4)}-${raw.slice(4, 8)}`);
  }
  return codes;
}
function validatePasswordStrength(password) {
  if (!password || password.length < 8) {
    return "Password must be at least 8 characters long.";
  }
  if (password.length > 128) {
    return "Password cannot exceed 128 characters.";
  }
  if (!/[a-z]/.test(password)) {
    return "Password must contain at least one lowercase letter.";
  }
  if (!/[A-Z]/.test(password)) {
    return "Password must contain at least one uppercase letter.";
  }
  if (!/[0-9]/.test(password)) {
    return "Password must contain at least one number.";
  }
  return null;
}

// server/config/env.ts
import "dotenv/config";
function parseIntSafe(value, fallback) {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
function parseBool(value, fallback = false) {
  if (value === void 0) return fallback;
  return value.toLowerCase() === "true" || value === "1";
}
function loadEnv() {
  const rawNodeEnv = process.env.NODE_ENV || "development";
  const nodeEnv = rawNodeEnv === "production" || rawNodeEnv === "test" ? rawNodeEnv : "development";
  const smtpHost = process.env.SMTP_HOST || "";
  return {
    nodeEnv,
    port: parseIntSafe(process.env.PORT, 3e3),
    appUrl: process.env.APP_URL || "http://localhost:3000",
    security: {
      sessionTtlHours: parseIntSafe(process.env.SESSION_TTL_HOURS, 24),
      rememberMeTtlDays: parseIntSafe(process.env.REMEMBER_ME_TTL_DAYS, 14),
      maxLoginAttempts: parseIntSafe(process.env.MAX_LOGIN_ATTEMPTS, 5),
      lockoutWindowMinutes: parseIntSafe(process.env.LOCKOUT_WINDOW_MINUTES, 15),
      passwordResetTtlMinutes: parseIntSafe(process.env.PASSWORD_RESET_TTL_MINUTES, 30),
      emailVerificationTtlHours: parseIntSafe(process.env.EMAIL_VERIFICATION_TTL_HOURS, 24)
    },
    smtp: {
      host: smtpHost,
      port: parseIntSafe(process.env.SMTP_PORT, 587),
      user: process.env.SMTP_USER || "",
      from: process.env.SMTP_FROM || "security@bloodconnect.org",
      configured: Boolean(smtpHost && process.env.SMTP_USER)
    },
    db: {
      uri: process.env.DATABASE_URL || process.env.MYSQL_URL || "",
      host: process.env.DB_HOST || "localhost",
      port: parseIntSafe(process.env.DB_PORT, 3306),
      user: process.env.DB_USER || "root",
      password: process.env.DB_PASSWORD ?? "",
      database: process.env.DB_NAME || "bloodconnect_db",
      ssl: parseBool(process.env.DB_SSL, false),
      connectionLimit: parseIntSafe(process.env.DB_POOL_LIMIT, 10),
      connectTimeoutMs: parseIntSafe(process.env.DB_CONNECT_TIMEOUT_MS, 8e3)
    }
  };
}
var env = loadEnv();

// server/db/securityStore.ts
var PERMISSIONS_CATALOG = [
  // Self-service account permissions
  { key: "profile:read_own", category: "Account", label: "View Own Profile", description: "Read own profile details and authority summary." },
  { key: "profile:update_own", category: "Account", label: "Edit Own Profile", description: "Update own name, phone, and department info." },
  { key: "sessions:manage_own", category: "Account", label: "Manage Own Sessions", description: "View and revoke own active login sessions." },
  { key: "mfa:manage_own", category: "Account", label: "Manage Own MFA", description: "Enroll, verify, or disable TOTP multi-factor authentication." },
  // User & Identity Governance
  { key: "users:read", category: "Users & Access", label: "View All Users", description: "List and inspect registered system accounts." },
  { key: "users:create", category: "Users & Access", label: "Create Users", description: "Provision staff or departmental accounts directly." },
  { key: "users:update", category: "Users & Access", label: "Edit User Accounts", description: "Modify other users\u2019 departmental assignments and metadata." },
  { key: "users:assign_role", category: "Users & Access", label: "Assign User Roles", description: "Assign roles strictly below caller authority rank." },
  { key: "users:manage_status", category: "Users & Access", label: "Activate / Suspend Users", description: "Activate, suspend, or deactivate accounts and revoke their sessions." },
  // Configurable RBAC Governance
  { key: "roles:read", category: "RBAC Configuration", label: "View Roles & Permissions", description: "Inspect authority hierarchy and permission matrices." },
  { key: "roles:manage", category: "RBAC Configuration", label: "Configure Roles & Permissions", description: "Create custom roles and modify role-permission mappings." },
  // Security & Infrastructure
  { key: "audit:read", category: "Security & Infrastructure", label: "Read Security Audit Logs", description: "Inspect authentication, authorization denials, and security events." },
  { key: "db:manage", category: "Security & Infrastructure", label: "Manage MySQL Database", description: "Connect MySQL, run SQL queries, initialize schemas, and sync live data." },
  // Clinical & Blood Bank Operations
  { key: "donors:read", category: "Clinical Operations", label: "Read Donor Registry", description: "View full donor registry and contact details." },
  { key: "donors:create", category: "Clinical Operations", label: "Register Donors", description: "Add new donor records to the clinical registry." },
  { key: "donors:update", category: "Clinical Operations", label: "Update Donor Records", description: "Edit donor eligibility, availability, and medical notes." },
  { key: "donors:verify", category: "Clinical Operations", label: "Verify Donors (Moderation)", description: "Review and approve pending donor verifications." },
  { key: "inventory:read", category: "Clinical Operations", label: "Read Blood Inventory", description: "Inspect cold-vault blood units and screening status." },
  { key: "inventory:manage", category: "Clinical Operations", label: "Manage Blood Inventory", description: "Log new blood units, update storage, and quarantine stock." },
  { key: "requests:read", category: "Clinical Operations", label: "Read Blood Requests", description: "View hospital and emergency blood requisitions." },
  { key: "requests:create", category: "Clinical Operations", label: "Submit Blood Requests", description: "Create hospital or emergency blood requisitions." },
  { key: "requests:approve", category: "Clinical Operations", label: "Approve / Dispatch Requests", description: "Review, cross-match, approve, reject, or fulfill requisitions." },
  { key: "camps:read", category: "Camps & Appointments", label: "View Donation Camps", description: "Browse blood donation camps and schedules." },
  { key: "camps:manage", category: "Camps & Appointments", label: "Manage Donation Camps", description: "Create and moderate community blood drives." },
  { key: "camps:register", category: "Camps & Appointments", label: "Register for Camps", description: "Book a donor slot in an active blood camp." },
  { key: "appointments:read_own", category: "Camps & Appointments", label: "View Own Appointments", description: "View personal donation appointment passes." },
  { key: "appointments:read_all", category: "Camps & Appointments", label: "View All Appointments", description: "View all center appointments across donors." },
  { key: "appointments:create", category: "Camps & Appointments", label: "Book Donation Appointments", description: "Schedule direct blood donation center slots." },
  { key: "appointments:manage", category: "Camps & Appointments", label: "Manage All Appointments", description: "Check in, complete, reschedule, or cancel any appointment." },
  { key: "reports:read", category: "Clinical Operations", label: "View Analytics & Reports", description: "Access operational analytics and compliance exports." }
];
var VALID_PERMISSION_KEYS = new Set(PERMISSIONS_CATALOG.map((p) => p.key));
var ALL_PERMISSIONS = PERMISSIONS_CATALOG.map((p) => p.key);
function createDefaultRoles(now) {
  return [
    {
      key: "super_admin",
      name: "Super Administrator",
      description: "Complete system control, security governance, RBAC configuration, and infrastructure administration.",
      authorityRank: 100,
      portalScope: "admin",
      isSystem: true,
      permissions: [...ALL_PERMISSIONS],
      createdAt: now
    },
    {
      key: "admin",
      name: "Administrator",
      description: "Authorized administrative operations, user lifecycle management, database oversight, and compliance audits.",
      authorityRank: 80,
      portalScope: "admin",
      isSystem: true,
      permissions: ALL_PERMISSIONS.filter((p) => p !== "roles:manage"),
      createdAt: now
    },
    {
      key: "authority_officer",
      name: "Authority Officer",
      description: "Regional clinical authority overseeing blood safety, emergency dispatch approvals, inventory release, and audit review.",
      authorityRank: 65,
      portalScope: "staff",
      isSystem: true,
      permissions: [
        "profile:read_own",
        "profile:update_own",
        "sessions:manage_own",
        "mfa:manage_own",
        "audit:read",
        "donors:read",
        "donors:create",
        "donors:update",
        "donors:verify",
        "inventory:read",
        "inventory:manage",
        "requests:read",
        "requests:create",
        "requests:approve",
        "camps:read",
        "camps:manage",
        "appointments:read_own",
        "appointments:read_all",
        "appointments:create",
        "appointments:manage",
        "reports:read"
      ],
      createdAt: now
    },
    {
      key: "department_manager",
      name: "Department Manager",
      description: "Hospital transfusion department lead managing requisitions, departmental blood requests, and camp coordination.",
      authorityRank: 50,
      portalScope: "hospital",
      isSystem: true,
      permissions: [
        "profile:read_own",
        "profile:update_own",
        "sessions:manage_own",
        "mfa:manage_own",
        "donors:read",
        "inventory:read",
        "requests:read",
        "requests:create",
        "camps:read",
        "camps:manage",
        "appointments:read_own",
        "appointments:read_all",
        "appointments:create",
        "reports:read"
      ],
      createdAt: now
    },
    {
      key: "moderator",
      name: "Moderator",
      description: "Verification and moderation specialist reviewing donor registrations, camps, and appointment check-ins.",
      authorityRank: 35,
      portalScope: "staff",
      isSystem: true,
      permissions: [
        "profile:read_own",
        "profile:update_own",
        "sessions:manage_own",
        "mfa:manage_own",
        "donors:read",
        "donors:verify",
        "donors:update",
        "inventory:read",
        "requests:read",
        "camps:read",
        "camps:manage",
        "appointments:read_own",
        "appointments:read_all",
        "appointments:manage"
      ],
      createdAt: now
    },
    {
      key: "regular_user",
      name: "Regular User",
      description: "Standard donor and citizen access for managing personal profile, booking donations, and registering for camps.",
      authorityRank: 10,
      portalScope: "donor",
      isSystem: true,
      permissions: [
        "profile:read_own",
        "profile:update_own",
        "sessions:manage_own",
        "mfa:manage_own",
        "inventory:read",
        "camps:read",
        "camps:register",
        "appointments:read_own",
        "appointments:create"
      ],
      createdAt: now
    },
    {
      key: "guest",
      name: "Guest",
      description: "Unauthenticated public visitor limited to read-only blood availability and public camp listings.",
      authorityRank: 0,
      portalScope: "donor",
      isSystem: true,
      permissions: ["inventory:read", "camps:read"],
      createdAt: now
    }
  ];
}
function createDefaultUsers(now) {
  const defaultPassword = "Password@123";
  return [
    {
      id: 1,
      username: "superadmin",
      email: "superadmin@bloodconnect.org",
      passwordHash: hashPassword(defaultPassword),
      fullName: "Dr. Vikramaditya Rao",
      phone: "+91 98200 00001",
      roleKey: "super_admin",
      status: "active",
      emailVerified: true,
      department: "National Blood Safety Governance",
      organizationName: "BloodConnect National Authority",
      createdAt: now,
      updatedAt: now
    },
    {
      id: 2,
      username: "sysadmin",
      email: "admin@bloodconnect.org",
      passwordHash: hashPassword(defaultPassword),
      fullName: "Meera Kulkarni",
      phone: "+91 98200 00002",
      roleKey: "admin",
      status: "active",
      emailVerified: true,
      department: "System Operations & Compliance",
      organizationName: "BloodConnect Operations",
      createdAt: now,
      updatedAt: now
    },
    {
      id: 3,
      username: "officer_sarah",
      email: "officer@bloodconnect.org",
      passwordHash: hashPassword(defaultPassword),
      fullName: "Dr. Sarah Jenkins",
      phone: "+91 98200 00003",
      roleKey: "authority_officer",
      status: "active",
      emailVerified: true,
      department: "Regional Cold-Vault & Bio-Safety",
      organizationName: "Central Blood Bank Authority",
      licenseNumber: "MED-AUTH-2026-441",
      createdAt: now,
      updatedAt: now
    },
    {
      id: 4,
      username: "hosp_metro",
      email: "manager@metrohealth.org",
      passwordHash: hashPassword(defaultPassword),
      fullName: "Dr. Ananya Deshmukh",
      phone: "+91 98200 00004",
      roleKey: "department_manager",
      status: "active",
      emailVerified: true,
      department: "Transfusion Medicine & ICU",
      organizationName: "Metro Health & Trauma Institute",
      licenseNumber: "NABH-HOSP-2026-101",
      hospitalId: 1,
      createdAt: now,
      updatedAt: now
    },
    {
      id: 5,
      username: "mod_kiran",
      email: "moderator@bloodconnect.org",
      passwordHash: hashPassword(defaultPassword),
      fullName: "Kiran Patel",
      phone: "+91 98200 00005",
      roleKey: "moderator",
      status: "active",
      emailVerified: true,
      department: "Donor Verification & Camp Desk",
      organizationName: "BloodConnect Moderation Unit",
      createdAt: now,
      updatedAt: now
    },
    {
      id: 6,
      username: "donor_rahul",
      email: "rahul.sharma@donor.bloodconnect.org",
      passwordHash: hashPassword(defaultPassword),
      fullName: "Rahul Sharma",
      phone: "+91 98201 11223",
      roleKey: "regular_user",
      status: "active",
      emailVerified: true,
      department: "Voluntary Donor Network",
      donorId: 1,
      createdAt: now,
      updatedAt: now
    },
    {
      id: 7,
      username: "donor_priya",
      email: "priya.nair@donor.bloodconnect.org",
      passwordHash: hashPassword(defaultPassword),
      fullName: "Priya Nair",
      phone: "+91 98201 44556",
      roleKey: "regular_user",
      status: "active",
      emailVerified: false,
      department: "Voluntary Donor Network",
      donorId: 2,
      createdAt: now,
      updatedAt: now
    }
  ];
}
var SecurityStore = class {
  constructor() {
    const dataDir = this.resolveWritableDataDir();
    this.filePath = path.join(dataDir, "security-store.json");
    this.data = this.loadOrInitialize();
  }
  resolveWritableDataDir() {
    const tmpFallback = path.join(os.tmpdir(), "bloodconnect-security");
    if (process.env.VERCEL === "1" || process.env.AWS_LAMBDA_FUNCTION_NAME) {
      fs.mkdirSync(tmpFallback, { recursive: true });
      return tmpFallback;
    }
    const localDir = path.resolve(process.cwd(), "server", "data");
    try {
      fs.mkdirSync(localDir, { recursive: true });
      fs.accessSync(localDir, fs.constants.W_OK);
      return localDir;
    } catch {
      fs.mkdirSync(tmpFallback, { recursive: true });
      return tmpFallback;
    }
  }
  loadOrInitialize() {
    if (fs.existsSync(this.filePath)) {
      try {
        const raw = fs.readFileSync(this.filePath, "utf8");
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.roles) && Array.isArray(parsed.users)) {
          return parsed;
        }
      } catch (err) {
        console.error("[SecurityStore] Failed to parse existing store, re-initializing:", err);
      }
    }
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const initial = {
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
          actorRole: "system",
          action: "RBAC_STORE_INITIALIZED",
          outcome: "SUCCESS",
          resource: "security_store",
          ipAddress: "127.0.0.1",
          details: "Initialized 7-tier configurable RBAC hierarchy and scrypt-hashed identity store."
        }
      ]
    };
    this.data = initial;
    this.persist();
    return initial;
  }
  persist() {
    const tmpPath = `${this.filePath}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(this.data, null, 2), "utf8");
    fs.renameSync(tmpPath, this.filePath);
  }
  // ===================== ROLES & PERMISSIONS =====================
  getRoles() {
    return [...this.data.roles].sort((a, b) => b.authorityRank - a.authorityRank);
  }
  getRoleByKey(roleKey) {
    return this.data.roles.find((r) => r.key === roleKey);
  }
  createRole(input) {
    const cleanPermissions = Array.from(
      new Set(input.permissions.filter((p) => VALID_PERMISSION_KEYS.has(p)))
    );
    const role = {
      key: input.key,
      name: input.name,
      description: input.description,
      authorityRank: input.authorityRank,
      portalScope: input.portalScope,
      isSystem: false,
      permissions: cleanPermissions,
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    this.data.roles.push(role);
    this.persist();
    return role;
  }
  updateRolePermissions(roleKey, permissions) {
    const role = this.data.roles.find((r) => r.key === roleKey);
    if (!role) return null;
    const clean = new Set(permissions.filter((p) => VALID_PERMISSION_KEYS.has(p)));
    if (role.key === "super_admin") {
      clean.add("roles:read");
      clean.add("roles:manage");
      clean.add("users:read");
      clean.add("users:assign_role");
      clean.add("users:manage_status");
      clean.add("audit:read");
    }
    role.permissions = Array.from(clean);
    this.persist();
    return role;
  }
  resolveUserPermissions(user) {
    const role = this.getRoleByKey(user.roleKey);
    if (!role) return [];
    return [...role.permissions];
  }
  toPublicUser(user) {
    const role = this.getRoleByKey(user.roleKey) ?? this.getRoleByKey("regular_user");
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
      lastLogin: user.lastLoginAt
    };
  }
  // ===================== USERS =====================
  listUsers() {
    return [...this.data.users].sort((a, b) => a.id - b.id);
  }
  findUserById(userId) {
    return this.data.users.find((u) => u.id === userId);
  }
  findUserByIdentifier(identifier) {
    const norm = identifier.trim().toLowerCase();
    return this.data.users.find(
      (u) => u.email.toLowerCase() === norm || u.username.toLowerCase() === norm
    );
  }
  userExists(email, username) {
    const normEmail = email.trim().toLowerCase();
    const normUsername = username.trim().toLowerCase();
    return this.data.users.some(
      (u) => u.email.toLowerCase() === normEmail || u.username.toLowerCase() === normUsername
    );
  }
  createUser(input) {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const record = {
      id: this.data.nextUserId++,
      username: input.username.trim().toLowerCase(),
      email: input.email.trim().toLowerCase(),
      passwordHash: input.passwordHash,
      fullName: input.fullName.trim(),
      phone: input.phone.trim(),
      roleKey: input.roleKey,
      status: input.status ?? "active",
      emailVerified: input.emailVerified ?? false,
      department: input.department?.trim() || void 0,
      organizationName: input.organizationName?.trim() || void 0,
      licenseNumber: input.licenseNumber?.trim() || void 0,
      createdAt: now,
      updatedAt: now
    };
    this.data.users.push(record);
    this.persist();
    return record;
  }
  updateUserProfile(userId, updates) {
    const user = this.findUserById(userId);
    if (!user) return null;
    if (updates.fullName !== void 0) user.fullName = updates.fullName.trim();
    if (updates.phone !== void 0) user.phone = updates.phone.trim();
    if (updates.department !== void 0) user.department = updates.department.trim() || void 0;
    if (updates.organizationName !== void 0) {
      user.organizationName = updates.organizationName.trim() || void 0;
    }
    user.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    this.persist();
    return user;
  }
  updateUserPassword(userId, newPasswordHash) {
    const user = this.findUserById(userId);
    if (!user) return false;
    user.passwordHash = newPasswordHash;
    user.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    this.persist();
    return true;
  }
  updateUserRole(userId, newRoleKey) {
    const user = this.findUserById(userId);
    if (!user) return null;
    user.roleKey = newRoleKey;
    user.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    this.persist();
    return user;
  }
  updateUserStatus(userId, newStatus) {
    const user = this.findUserById(userId);
    if (!user) return null;
    user.status = newStatus;
    user.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    if (newStatus === "suspended" || newStatus === "deactivated") {
      this.revokeAllUserSessionsInternal(userId);
    }
    this.persist();
    return user;
  }
  markUserLogin(userId) {
    const user = this.findUserById(userId);
    if (!user) return;
    user.lastLoginAt = (/* @__PURE__ */ new Date()).toISOString();
    this.persist();
  }
  // ===================== SESSIONS =====================
  createSession(userId, meta) {
    const rawToken = generateOpaqueToken(32);
    const tokenHash = sha256(rawToken);
    const now = Date.now();
    const ttlMs = meta.rememberMe ? env.security.rememberMeTtlDays * 24 * 60 * 60 * 1e3 : env.security.sessionTtlHours * 60 * 60 * 1e3;
    const session = {
      id: `sess_${generateOpaqueToken(12)}`,
      userId,
      tokenHash,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent.slice(0, 240),
      createdAt: new Date(now).toISOString(),
      lastActiveAt: new Date(now).toISOString(),
      expiresAt: new Date(now + ttlMs).toISOString()
    };
    const cutoff = now - 30 * 24 * 60 * 60 * 1e3;
    this.data.sessions = this.data.sessions.filter(
      (s) => new Date(s.expiresAt).getTime() > cutoff
    );
    this.data.sessions.push(session);
    this.persist();
    return {
      rawToken,
      session,
      maxAgeSeconds: Math.floor(ttlMs / 1e3)
    };
  }
  validateSessionToken(rawToken) {
    const tokenHash = sha256(rawToken);
    const nowMs = Date.now();
    const session = this.data.sessions.find((s) => s.tokenHash === tokenHash);
    if (!session) return null;
    if (session.revokedAt) return null;
    if (new Date(session.expiresAt).getTime() <= nowMs) return null;
    const user = this.findUserById(session.userId);
    if (!user) return null;
    if (user.status === "suspended" || user.status === "deactivated") {
      return null;
    }
    if (nowMs - new Date(session.lastActiveAt).getTime() > 6e4) {
      session.lastActiveAt = new Date(nowMs).toISOString();
      this.persist();
    }
    return { session, user };
  }
  listUserSessions(userId) {
    const nowMs = Date.now();
    return this.data.sessions.filter(
      (s) => s.userId === userId && !s.revokedAt && new Date(s.expiresAt).getTime() > nowMs
    ).sort(
      (a, b) => new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime()
    );
  }
  revokeSessionById(sessionId, ownerUserId) {
    const session = this.data.sessions.find((s) => s.id === sessionId);
    if (!session) return false;
    if (ownerUserId !== void 0 && session.userId !== ownerUserId) return false;
    if (session.revokedAt) return true;
    session.revokedAt = (/* @__PURE__ */ new Date()).toISOString();
    this.persist();
    return true;
  }
  revokeOtherSessions(userId, currentSessionId) {
    const now = (/* @__PURE__ */ new Date()).toISOString();
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
  revokeAllUserSessionsInternal(userId) {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    let count = 0;
    for (const s of this.data.sessions) {
      if (s.userId === userId && !s.revokedAt) {
        s.revokedAt = now;
        count++;
      }
    }
    return count;
  }
  revokeAllUserSessions(userId) {
    const count = this.revokeAllUserSessionsInternal(userId);
    if (count > 0) this.persist();
    return count;
  }
  // ===================== BRUTE-FORCE PROTECTION =====================
  checkAttemptKey(key) {
    const record = this.data.loginAttempts[key];
    if (!record || !record.lockedUntil) {
      return { locked: false, retryAfterSec: 0 };
    }
    const lockedUntilMs = new Date(record.lockedUntil).getTime();
    const nowMs = Date.now();
    if (lockedUntilMs > nowMs) {
      return {
        locked: true,
        retryAfterSec: Math.ceil((lockedUntilMs - nowMs) / 1e3)
      };
    }
    delete this.data.loginAttempts[key];
    this.persist();
    return { locked: false, retryAfterSec: 0 };
  }
  checkBruteForceLockout(identifier, ipAddress) {
    const idCheck = this.checkAttemptKey(`id:${identifier.trim().toLowerCase()}`);
    if (idCheck.locked) return idCheck;
    return this.checkAttemptKey(`ip:${ipAddress}`);
  }
  recordFailedLogin(identifier, ipAddress) {
    const nowMs = Date.now();
    const windowMs = env.security.lockoutWindowMinutes * 60 * 1e3;
    const maxAttempts = env.security.maxLoginAttempts;
    const keys = [`id:${identifier.trim().toLowerCase()}`, `ip:${ipAddress}`];
    let lockedNow = false;
    let highestCount = 0;
    for (const key of keys) {
      const existing = this.data.loginAttempts[key];
      const windowExpired = !existing || nowMs - new Date(existing.firstFailedAt).getTime() > windowMs;
      const record = windowExpired ? {
        key,
        failureCount: 1,
        firstFailedAt: new Date(nowMs).toISOString(),
        updatedAt: new Date(nowMs).toISOString()
      } : {
        ...existing,
        failureCount: existing.failureCount + 1,
        updatedAt: new Date(nowMs).toISOString()
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
      retryAfterSec: lockedNow ? Math.ceil(windowMs / 1e3) : 0,
      attemptsUsed: highestCount
    };
  }
  clearLoginAttempts(identifier, ipAddress) {
    delete this.data.loginAttempts[`id:${identifier.trim().toLowerCase()}`];
    delete this.data.loginAttempts[`ip:${ipAddress}`];
    this.persist();
  }
  // ===================== PASSWORD RESET & EMAIL VERIFICATION =====================
  issuePasswordResetToken(userId) {
    const nowMs = Date.now();
    const expiresAt = new Date(
      nowMs + env.security.passwordResetTtlMinutes * 60 * 1e3
    ).toISOString();
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
      createdAt: new Date(nowMs).toISOString()
    });
    this.persist();
    return { rawToken, expiresAt };
  }
  consumePasswordResetToken(rawToken) {
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
  issueEmailVerificationToken(userId) {
    const nowMs = Date.now();
    const expiresAt = new Date(
      nowMs + env.security.emailVerificationTtlHours * 60 * 60 * 1e3
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
      createdAt: new Date(nowMs).toISOString()
    });
    this.persist();
    return { rawToken, expiresAt };
  }
  consumeEmailVerificationToken(rawToken) {
    const tokenHash = sha256(rawToken.trim());
    const nowMs = Date.now();
    const record = this.data.emailVerificationTokens.find((t) => t.tokenHash === tokenHash);
    if (!record || record.usedAt) return null;
    if (new Date(record.expiresAt).getTime() <= nowMs) return null;
    const user = this.findUserById(record.userId);
    if (!user) return null;
    record.usedAt = new Date(nowMs).toISOString();
    user.emailVerified = true;
    if (user.status === "pending_verification") {
      user.status = "active";
    }
    user.updatedAt = new Date(nowMs).toISOString();
    this.persist();
    return user;
  }
  // ===================== MULTI-FACTOR AUTHENTICATION (RFC 6238 TOTP) =====================
  getMfaStatus(userId) {
    const record = this.data.mfaRecords[String(userId)];
    if (!record) {
      return { enabled: false, recoveryCodesRemaining: 0 };
    }
    return {
      enabled: record.enabled,
      recoveryCodesRemaining: record.recoveryCodeHashes.length,
      enabledAt: record.enabledAt
    };
  }
  beginMfaEnrollment(userId) {
    const secret = generateTotpSecret();
    const existing = this.data.mfaRecords[String(userId)];
    this.data.mfaRecords[String(userId)] = {
      userId,
      enabled: existing?.enabled ?? false,
      secret: existing?.secret,
      pendingSecret: secret,
      recoveryCodeHashes: existing?.recoveryCodeHashes ?? [],
      enabledAt: existing?.enabledAt
    };
    this.persist();
    return { secret };
  }
  confirmMfaEnrollment(userId, totpCode) {
    const record = this.data.mfaRecords[String(userId)];
    if (!record || !record.pendingSecret) {
      return { success: false };
    }
    if (!verifyTotpCode(record.pendingSecret, totpCode)) {
      return { success: false };
    }
    const recoveryCodes = generateRecoveryCodes(8);
    record.secret = record.pendingSecret;
    record.pendingSecret = void 0;
    record.enabled = true;
    record.enabledAt = (/* @__PURE__ */ new Date()).toISOString();
    record.recoveryCodeHashes = recoveryCodes.map((c) => sha256(c.toUpperCase()));
    this.persist();
    return { success: true, recoveryCodes };
  }
  verifyUserMfaCode(userId, code) {
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
      record.recoveryCodeHashes.splice(idx, 1);
      this.persist();
      return { verified: true, usedRecoveryCode: true };
    }
    return { verified: false, usedRecoveryCode: false };
  }
  disableMfa(userId) {
    delete this.data.mfaRecords[String(userId)];
    this.persist();
  }
  createMfaChallenge(userId, meta) {
    const nowMs = Date.now();
    const challengeToken = generateOpaqueToken(24);
    const expiresAt = new Date(nowMs + 5 * 60 * 1e3).toISOString();
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
      createdAt: new Date(nowMs).toISOString()
    });
    this.persist();
    return { challengeToken, expiresAt };
  }
  getActiveMfaChallenge(challengeToken) {
    const hash = sha256(challengeToken.trim());
    const nowMs = Date.now();
    const record = this.data.mfaChallenges.find((c) => c.tokenHash === hash);
    if (!record || record.usedAt) return null;
    if (new Date(record.expiresAt).getTime() <= nowMs) return null;
    return record;
  }
  consumeMfaChallenge(challengeId) {
    const record = this.data.mfaChallenges.find((c) => c.id === challengeId);
    if (record) {
      record.usedAt = (/* @__PURE__ */ new Date()).toISOString();
      this.persist();
    }
  }
  // ===================== SECURITY AUDIT LOGS =====================
  recordAudit(event) {
    const entry = {
      id: `evt_${generateOpaqueToken(8)}`,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      ...event
    };
    this.data.auditLogs.unshift(entry);
    if (this.data.auditLogs.length > 500) {
      this.data.auditLogs = this.data.auditLogs.slice(0, 500);
    }
    this.persist();
    return entry;
  }
  listAuditLogs(options) {
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
};
var securityStore = new SecurityStore();

// server/utils/cookies.ts
var SESSION_COOKIE_NAME = "bc_sid";
function parseCookies(cookieHeader) {
  const result = {};
  if (!cookieHeader) return result;
  const pairs = cookieHeader.split(";");
  for (const pair of pairs) {
    const idx = pair.indexOf("=");
    if (idx === -1) continue;
    const key = pair.slice(0, idx).trim();
    const val = pair.slice(idx + 1).trim();
    if (!key) continue;
    try {
      result[key] = decodeURIComponent(val);
    } catch {
      result[key] = val;
    }
  }
  return result;
}
function extractSessionToken(req) {
  const cookies = parseCookies(req.headers.cookie);
  if (cookies[SESSION_COOKIE_NAME]) {
    return cookies[SESSION_COOKIE_NAME];
  }
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const bearer = authHeader.slice(7).trim();
    if (bearer) return bearer;
  }
  return null;
}
function setSessionCookie(res, token, maxAgeSeconds) {
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`
  ];
  if (env.nodeEnv === "production") {
    parts.push("Secure");
  }
  res.setHeader("Set-Cookie", parts.join("; "));
}
function clearSessionCookie(res) {
  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT"
  ];
  if (env.nodeEnv === "production") {
    parts.push("Secure");
  }
  res.setHeader("Set-Cookie", parts.join("; "));
}

// server/utils/apiResponse.ts
var AppError = class extends Error {
  constructor(message, statusCode = 500, code = "INTERNAL_ERROR", details) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace?.(this, this.constructor);
  }
};
var ValidationError = class extends AppError {
  constructor(message, details) {
    super(message, 400, "VALIDATION_ERROR", details);
    this.name = "ValidationError";
  }
};
var AuthenticationError = class extends AppError {
  constructor(message = "Authentication failed", code = "AUTHENTICATION_ERROR") {
    super(message, 401, code);
    this.name = "AuthenticationError";
  }
};
var AuthorizationError = class extends AppError {
  constructor(message = "You do not have permission to perform this action", code = "FORBIDDEN") {
    super(message, 403, code);
    this.name = "AuthorizationError";
  }
};
var RateLimitError = class extends AppError {
  constructor(message = "Too many attempts. Please try again later.", retryAfterSec) {
    super(message, 429, "RATE_LIMIT_EXCEEDED", retryAfterSec ? { retryAfterSec: String(retryAfterSec) } : void 0);
    this.name = "RateLimitError";
    this.retryAfterSec = retryAfterSec;
  }
};
var ConflictError = class extends AppError {
  constructor(message) {
    super(message, 409, "CONFLICT_ERROR");
    this.name = "ConflictError";
  }
};
var NotFoundError = class extends AppError {
  constructor(message = "Resource not found") {
    super(message, 404, "NOT_FOUND");
    this.name = "NotFoundError";
  }
};
function isDatabaseOfflineError(err) {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return msg.includes("ECONNREFUSED") || msg.includes("ETIMEDOUT") || msg.includes("ENOTFOUND") || msg.includes("EHOSTUNREACH") || msg.includes("PROTOCOL_CONNECTION_LOST");
}
function sendSuccess(res, payload, statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    ...payload
  });
}
function sendCreated(res, payload) {
  return sendSuccess(res, payload, 201);
}

// server/middleware/auth.middleware.ts
function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || "127.0.0.1";
}
function getUserAgent(req) {
  return String(req.headers["user-agent"] || "Unknown Client").slice(0, 240);
}
function attachSession(req, res, next) {
  const rawToken = extractSessionToken(req);
  if (!rawToken) {
    return next();
  }
  const resolved = securityStore.validateSessionToken(rawToken);
  if (!resolved) {
    clearSessionCookie(res);
    return next();
  }
  const role = securityStore.getRoleByKey(resolved.user.roleKey) ?? securityStore.getRoleByKey("regular_user");
  req.auth = {
    user: resolved.user,
    session: resolved.session,
    role,
    permissions: new Set(role.permissions),
    ipAddress: getClientIp(req),
    userAgent: getUserAgent(req)
  };
  next();
}
function requireAuth(req, _res, next) {
  if (!req.auth) {
    securityStore.recordAudit({
      action: "UNAUTHENTICATED_ACCESS",
      outcome: "DENIED",
      resource: `${req.method} ${req.originalUrl}`,
      ipAddress: getClientIp(req),
      userAgent: getUserAgent(req),
      details: "Blocked unauthenticated request to protected endpoint."
    });
    return next(new AuthenticationError("Authentication required. Please sign in to continue."));
  }
  next();
}
function requirePermission(permissionKey) {
  return (req, _res, next) => {
    if (!req.auth) {
      securityStore.recordAudit({
        action: "UNAUTHENTICATED_ACCESS",
        outcome: "DENIED",
        resource: `${req.method} ${req.originalUrl}`,
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
        details: `Unauthenticated request blocked; missing permission '${permissionKey}'.`
      });
      return next(new AuthenticationError("Authentication required. Please sign in to continue."));
    }
    if (!req.auth.permissions.has(permissionKey)) {
      securityStore.recordAudit({
        actorUserId: req.auth.user.id,
        actorEmail: req.auth.user.email,
        actorRole: req.auth.role.key,
        action: "AUTHZ_DENIED",
        outcome: "DENIED",
        resource: `${req.method} ${req.originalUrl}`,
        ipAddress: req.auth.ipAddress,
        userAgent: req.auth.userAgent,
        details: `Denied access: role '${req.auth.role.key}' lacks required permission '${permissionKey}'.`
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
function requireAnyPermission(permissionKeys) {
  return (req, _res, next) => {
    if (!req.auth) {
      securityStore.recordAudit({
        action: "UNAUTHENTICATED_ACCESS",
        outcome: "DENIED",
        resource: `${req.method} ${req.originalUrl}`,
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
        details: `Unauthenticated request blocked; requires one of [${permissionKeys.join(", ")}].`
      });
      return next(new AuthenticationError("Authentication required. Please sign in to continue."));
    }
    const allowed = permissionKeys.some((key) => req.auth.permissions.has(key));
    if (!allowed) {
      securityStore.recordAudit({
        actorUserId: req.auth.user.id,
        actorEmail: req.auth.user.email,
        actorRole: req.auth.role.key,
        action: "AUTHZ_DENIED",
        outcome: "DENIED",
        resource: `${req.method} ${req.originalUrl}`,
        ipAddress: req.auth.ipAddress,
        userAgent: req.auth.userAgent,
        details: `Denied access: role '${req.auth.role.key}' lacks any of [${permissionKeys.join(", ")}].`
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
function requireSelfOrPermission(getTargetUserId, fallbackPermission) {
  return (req, _res, next) => {
    if (!req.auth) {
      return next(new AuthenticationError("Authentication required. Please sign in to continue."));
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
      action: "AUTHZ_DENIED",
      outcome: "DENIED",
      resource: `${req.method} ${req.originalUrl}`,
      targetUserId: targetId ?? void 0,
      ipAddress: req.auth.ipAddress,
      userAgent: req.auth.userAgent,
      details: `Blocked cross-user private data access to user #${targetId ?? "unknown"}; missing '${fallbackPermission}'.`
    });
    return next(
      new AuthorizationError("Access denied. You cannot access another user\u2019s private account data.")
    );
  };
}

// server/db/connection.ts
import mysql from "mysql2/promise";
var MONITORED_TABLES = [
  "donors",
  "blood_units",
  "blood_requests",
  "donation_camps",
  "camp_registrations",
  "donation_appointments",
  "patients",
  "audit_logs",
  "users"
];
function parseDatabaseUri(uri) {
  if (!uri) return {};
  try {
    const url = new URL(uri);
    return {
      host: url.hostname || "localhost",
      port: url.port ? Number.parseInt(url.port, 10) : 3306,
      user: decodeURIComponent(url.username || "root"),
      password: url.password ? decodeURIComponent(url.password) : "",
      database: url.pathname.replace(/^\//, "") || "bloodconnect_db",
      ssl: url.searchParams.get("ssl-mode") === "REQUIRED" || url.searchParams.get("ssl") === "true" || url.protocol === "mysqls:"
    };
  } catch {
    return {};
  }
}
function getDefaultConfig() {
  const parsed = env.db.uri ? parseDatabaseUri(env.db.uri) : {};
  return {
    host: parsed.host || env.db.host,
    port: parsed.port || env.db.port,
    user: parsed.user || env.db.user,
    password: parsed.password !== void 0 ? parsed.password : env.db.password,
    database: parsed.database || env.db.database,
    ssl: parsed.ssl !== void 0 ? parsed.ssl : env.db.ssl,
    uri: env.db.uri
  };
}
var activeConfig = getDefaultConfig();
var pool = null;
var lastError = null;
var isConnected = false;
function setActiveConfig(customConfig) {
  let updated = {
    ...activeConfig,
    ...Object.fromEntries(
      Object.entries(customConfig).filter(([, value]) => value !== void 0)
    )
  };
  if (updated.uri && updated.uri.trim().startsWith("mysql")) {
    const parsed = parseDatabaseUri(updated.uri.trim());
    updated = { ...updated, ...parsed };
  }
  activeConfig = updated;
  if (pool) {
    pool.end().catch(() => {
    });
    pool = null;
  }
  return activeConfig;
}
function isDbConnected() {
  return isConnected;
}
function getPool(customConfig) {
  if (customConfig) {
    setActiveConfig(customConfig);
  }
  if (!pool) {
    const options = {
      host: activeConfig.host,
      port: activeConfig.port,
      user: activeConfig.user,
      password: activeConfig.password,
      database: activeConfig.database,
      ssl: activeConfig.ssl ? { rejectUnauthorized: false } : void 0,
      waitForConnections: true,
      connectionLimit: env.db.connectionLimit,
      queueLimit: 0,
      connectTimeout: env.db.connectTimeoutMs,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0
    };
    pool = mysql.createPool(options);
  }
  return pool;
}
async function testConnection(customConfig) {
  if (customConfig) {
    setActiveConfig(customConfig);
  }
  const safeConfig = {
    host: activeConfig.host,
    port: activeConfig.port,
    user: activeConfig.user,
    database: activeConfig.database,
    ssl: activeConfig.ssl
  };
  try {
    const testPool = getPool();
    await testPool.query("SELECT 1 + 1 AS result");
    let tables = [];
    try {
      const [tableRows] = await testPool.query("SHOW TABLES");
      tables = tableRows.map((row) => String(Object.values(row)[0]));
    } catch {
      tables = [];
    }
    const counts = {};
    for (const table of MONITORED_TABLES) {
      if (tables.includes(table)) {
        try {
          const [rows] = await testPool.query(`SELECT COUNT(*) AS count FROM \`${table}\``);
          counts[table] = Number(rows[0]?.count ?? 0);
        } catch {
        }
      }
    }
    isConnected = true;
    lastError = null;
    return {
      success: true,
      connected: true,
      message: `Successfully connected to live MySQL server at ${activeConfig.host}:${activeConfig.port}/${activeConfig.database}`,
      config: safeConfig,
      tables,
      counts
    };
  } catch (err) {
    isConnected = false;
    lastError = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      connected: false,
      message: `Failed to connect to MySQL: ${lastError}`,
      config: safeConfig
    };
  }
}
function getStatus() {
  return {
    connected: isConnected,
    host: activeConfig.host,
    port: activeConfig.port,
    database: activeConfig.database,
    user: activeConfig.user,
    lastError
  };
}

// server/db/schema.ts
var SCHEMA_SQL = `-- ==========================================================
-- BloodConnect MySQL 8.0 Relational Database Schema
-- 3NF Normalized Schema with Foreign Keys, Indexes & Audit Trail
-- ==========================================================

CREATE DATABASE IF NOT EXISTS bloodconnect_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE bloodconnect_db;

-- 1. USERS & ACCESS MANAGEMENT
CREATE TABLE IF NOT EXISTS users (
  user_id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  email VARCHAR(100) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin', 'staff', 'hospital', 'donor') NOT NULL,
  full_name VARCHAR(100) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 2. BLOOD GROUPS LOOKUP
CREATE TABLE IF NOT EXISTS blood_groups (
  blood_group_id INT AUTO_INCREMENT PRIMARY KEY,
  blood_group_name VARCHAR(5) NOT NULL UNIQUE,
  rh_factor ENUM('Positive', 'Negative') NOT NULL,
  compatible_donate_to VARCHAR(100) NOT NULL,
  compatible_receive_from VARCHAR(100) NOT NULL
) ENGINE=InnoDB;

-- 3. REGISTERED DONORS
CREATE TABLE IF NOT EXISTS donors (
  donor_id INT AUTO_INCREMENT PRIMARY KEY,
  donor_code VARCHAR(20) NOT NULL UNIQUE,
  user_id INT NULL,
  full_name VARCHAR(100) NOT NULL,
  email VARCHAR(100) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  date_of_birth DATE NOT NULL,
  gender ENUM('Male', 'Female', 'Other') NOT NULL,
  blood_group VARCHAR(5) NOT NULL,
  address_line VARCHAR(255) NOT NULL,
  city VARCHAR(80) NOT NULL,
  state VARCHAR(80) NOT NULL DEFAULT 'Maharashtra',
  pincode VARCHAR(10) NOT NULL,
  weight_kg DECIMAL(5,2) NOT NULL,
  eligibility_status ENUM('Eligible', 'Temporarily Deferred', 'Permanently Deferred') DEFAULT 'Eligible',
  donor_status ENUM('Active', 'Inactive') DEFAULT 'Active',
  availability ENUM('Available', 'Not Available') DEFAULT 'Available',
  verification_status ENUM('Verified', 'Pending Verification', 'Rejected') DEFAULT 'Verified',
  total_donations INT DEFAULT 0,
  last_donation_date DATE NULL,
  next_eligible_date DATE NOT NULL,
  medical_notes TEXT NULL,
  consent_accepted BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_donors_blood_group (blood_group),
  INDEX idx_donors_city (city),
  INDEX idx_donors_availability (availability)
) ENGINE=InnoDB;

-- 4. MEDICAL SCREENINGS
CREATE TABLE IF NOT EXISTS medical_screenings (
  screening_id INT AUTO_INCREMENT PRIMARY KEY,
  screening_code VARCHAR(20) NOT NULL UNIQUE,
  donor_id INT NOT NULL,
  screening_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  weight_kg DECIMAL(5,2) NOT NULL,
  hemoglobin_gdl DECIMAL(4,2) NOT NULL,
  blood_pressure VARCHAR(15) NOT NULL,
  pulse_bpm INT NOT NULL,
  temperature_c DECIMAL(4,2) NOT NULL,
  is_eligible BOOLEAN NOT NULL,
  eligibility_status VARCHAR(50) NOT NULL,
  deferral_reason VARCHAR(255) NULL,
  screened_by_staff_id INT DEFAULT 1,
  staff_name VARCHAR(100) DEFAULT 'Staff RN',
  FOREIGN KEY (donor_id) REFERENCES donors(donor_id) ON DELETE CASCADE,
  INDEX idx_screenings_donor (donor_id)
) ENGINE=InnoDB;

-- 5. DONATION CAMPS
CREATE TABLE IF NOT EXISTS donation_camps (
  camp_id INT AUTO_INCREMENT PRIMARY KEY,
  camp_code VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  organizer VARCHAR(150) NOT NULL,
  camp_date DATE NOT NULL,
  start_time VARCHAR(20) NOT NULL,
  end_time VARCHAR(20) NOT NULL,
  location VARCHAR(255) NOT NULL,
  city VARCHAR(80) NOT NULL,
  capacity INT NOT NULL,
  registered_donors_count INT DEFAULT 0,
  collected_units_count INT DEFAULT 0,
  status ENUM('Upcoming', 'Ongoing', 'Completed') DEFAULT 'Upcoming',
  contact_person VARCHAR(100) NOT NULL,
  contact_phone VARCHAR(20) NOT NULL,
  INDEX idx_camps_date (camp_date),
  INDEX idx_camps_city (city)
) ENGINE=InnoDB;

-- 6. BLOOD INVENTORY UNITS
CREATE TABLE IF NOT EXISTS blood_units (
  unit_id INT AUTO_INCREMENT PRIMARY KEY,
  unit_code VARCHAR(30) NOT NULL UNIQUE,
  donor_id INT NULL,
  blood_group VARCHAR(5) NOT NULL,
  component_type ENUM('Whole Blood', 'Packed Red Blood Cells', 'Packed Red Cells', 'Platelets', 'Fresh Frozen Plasma', 'Cryoprecipitate') NOT NULL,
  volume_ml INT NOT NULL,
  collection_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expiry_date TIMESTAMP NOT NULL,
  status ENUM('Available', 'Reserved', 'Issued', 'Discarded', 'Expired', 'Quarantined') DEFAULT 'Available',
  cold_storage_location VARCHAR(100) NOT NULL,
  temperature_c DECIMAL(4,2) NOT NULL,
  barcode VARCHAR(50) NOT NULL,
  is_tested BOOLEAN DEFAULT TRUE,
  hiv_status VARCHAR(20) DEFAULT 'Negative',
  hbv_status VARCHAR(20) DEFAULT 'Negative',
  hcv_status VARCHAR(20) DEFAULT 'Negative',
  syphilis_status VARCHAR(20) DEFAULT 'Negative',
  malaria_status VARCHAR(20) DEFAULT 'Negative',
  INDEX idx_units_blood_group (blood_group),
  INDEX idx_units_status (status),
  INDEX idx_units_expiry (expiry_date)
) ENGINE=InnoDB;

-- 7. BLOOD REQUESTS (HOSPITALS & EMERGENCY)
CREATE TABLE IF NOT EXISTS blood_requests (
  request_id INT AUTO_INCREMENT PRIMARY KEY,
  request_code VARCHAR(30) NOT NULL UNIQUE,
  hospital_id INT NOT NULL,
  hospital_name VARCHAR(150) NOT NULL,
  patient_name VARCHAR(100) NOT NULL,
  patient_age INT NOT NULL,
  patient_gender ENUM('Male', 'Female', 'Other') NOT NULL,
  blood_group VARCHAR(5) NOT NULL,
  component_type VARCHAR(50) NOT NULL,
  units_needed INT NOT NULL,
  urgency ENUM('Normal', 'Routine', 'Urgent', 'Emergency', 'Immediate (Emergency)') NOT NULL,
  diagnosis VARCHAR(255) NOT NULL,
  attending_physician VARCHAR(100) NOT NULL,
  contact_phone VARCHAR(20) NOT NULL,
  required_date TIMESTAMP NOT NULL,
  status ENUM('Pending', 'Under Review', 'In Cross-Match', 'Approved', 'Partially Fulfilled', 'Fulfilled', 'Rejected', 'Cancelled') DEFAULT 'Pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_requests_status (status),
  INDEX idx_requests_urgency (urgency)
) ENGINE=InnoDB;

-- 8. AUDIT LOGS
CREATE TABLE IF NOT EXISTS audit_logs (
  log_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT DEFAULT 1,
  action VARCHAR(100) NOT NULL,
  table_name VARCHAR(50) NOT NULL,
  record_id INT NOT NULL,
  old_value TEXT NULL,
  new_value TEXT NULL,
  ip_address VARCHAR(45) DEFAULT '127.0.0.1',
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 9. POPULATE INITIAL BLOOD GROUPS
INSERT IGNORE INTO blood_groups (blood_group_id, blood_group_name, rh_factor, compatible_donate_to, compatible_receive_from) VALUES
(1, 'O-', 'Negative', 'O-, O+, A-, A+, B-, B+, AB-, AB+', 'O-'),
(2, 'O+', 'Positive', 'O+, A+, B+, AB+', 'O-, O+'),
(3, 'A-', 'Negative', 'A-, A+, AB-, AB+', 'O-, A-'),
(4, 'A+', 'Positive', 'A+, AB+', 'O-, O+, A-, A+'),
(5, 'B-', 'Negative', 'B-, B+, AB-, AB+', 'O-, B-'),
(6, 'B+', 'Positive', 'B+, AB+', 'O-, O+, B-, B+'),
(7, 'AB-', 'Negative', 'AB-, AB+', 'O-, A-, B-, AB-'),
(8, 'AB+', 'Positive', 'AB+', 'ALL (Universal Recipient)');

-- 10. CAMP REGISTRATIONS
CREATE TABLE IF NOT EXISTS camp_registrations (
  registration_id INT AUTO_INCREMENT PRIMARY KEY,
  camp_id INT NOT NULL,
  camp_name VARCHAR(150) NOT NULL,
  donor_id INT NOT NULL,
  donor_name VARCHAR(100) NOT NULL,
  donor_code VARCHAR(30) NOT NULL,
  blood_group VARCHAR(5) NOT NULL,
  time_slot VARCHAR(50) NOT NULL,
  status VARCHAR(30) DEFAULT 'Registered',
  registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 11. PATIENTS REGISTRY
CREATE TABLE IF NOT EXISTS patients (
  patient_id INT AUTO_INCREMENT PRIMARY KEY,
  patient_code VARCHAR(30) NOT NULL UNIQUE,
  hospital_id INT NOT NULL,
  hospital_name VARCHAR(150) NOT NULL,
  full_name VARCHAR(100) NOT NULL,
  age INT NOT NULL,
  gender ENUM('Male', 'Female', 'Other') NOT NULL,
  blood_group VARCHAR(5) NOT NULL,
  diagnosis VARCHAR(255) NOT NULL,
  attending_doctor VARCHAR(100) NOT NULL,
  admission_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 12. BLOOD DISPATCH / ISSUES
CREATE TABLE IF NOT EXISTS blood_issues (
  issue_id INT AUTO_INCREMENT PRIMARY KEY,
  issue_code VARCHAR(30) NOT NULL UNIQUE,
  request_id INT NOT NULL,
  request_code VARCHAR(30) NOT NULL,
  hospital_id INT NOT NULL,
  hospital_name VARCHAR(150) NOT NULL,
  patient_name VARCHAR(100) NOT NULL,
  blood_group VARCHAR(5) NOT NULL,
  component VARCHAR(50) NOT NULL,
  units_issued INT NOT NULL,
  issued_by_staff_id INT NOT NULL,
  staff_name VARCHAR(100) NOT NULL,
  blood_unit_codes TEXT NOT NULL,
  transaction_hash VARCHAR(64) NOT NULL,
  issued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 13. DONATIONS LOG
CREATE TABLE IF NOT EXISTS donations (
  donation_id INT AUTO_INCREMENT PRIMARY KEY,
  donation_code VARCHAR(30) NOT NULL UNIQUE,
  donor_id INT NOT NULL,
  donor_name VARCHAR(100) NOT NULL,
  blood_group VARCHAR(5) NOT NULL,
  donation_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  donation_type VARCHAR(50) NOT NULL,
  units_collected INT DEFAULT 1,
  staff_id INT DEFAULT 1,
  status VARCHAR(30) DEFAULT 'Completed',
  blood_unit_id INT NULL,
  notes TEXT NULL
) ENGINE=InnoDB;

-- 14. DIRECT DONATION APPOINTMENTS & DIGITAL PASSES
CREATE TABLE IF NOT EXISTS donation_appointments (
  appointment_id INT AUTO_INCREMENT PRIMARY KEY,
  appointment_code VARCHAR(30) NOT NULL UNIQUE,
  donor_id INT NULL,
  donor_name VARCHAR(100) NOT NULL,
  donor_phone VARCHAR(25) NOT NULL,
  donor_email VARCHAR(100) NOT NULL,
  blood_group VARCHAR(5) NOT NULL,
  hospital_id INT NOT NULL,
  center_name VARCHAR(150) NOT NULL,
  center_address VARCHAR(255) NOT NULL,
  city VARCHAR(80) NOT NULL,
  donation_type ENUM('Whole Blood', 'Apheresis Platelets', 'Plasma') NOT NULL DEFAULT 'Whole Blood',
  appointment_date DATE NOT NULL,
  time_slot VARCHAR(50) NOT NULL,
  status ENUM('Scheduled', 'Checked In', 'Completed', 'Cancelled') NOT NULL DEFAULT 'Scheduled',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_appointments_date (appointment_date),
  INDEX idx_appointments_status (status),
  INDEX idx_appointments_donor (donor_id)
) ENGINE=InnoDB;

-- ==========================================================
-- 15. RBAC & AUTHENTICATION SECURITY SUBSYSTEM TABLES
-- ==========================================================

-- 15a. CONFIGURABLE ROLES & AUTHORITY HIERARCHY
CREATE TABLE IF NOT EXISTS roles (
  role_id INT AUTO_INCREMENT PRIMARY KEY,
  role_key VARCHAR(50) NOT NULL UNIQUE,
  role_name VARCHAR(100) NOT NULL,
  description VARCHAR(255) NOT NULL,
  authority_rank INT NOT NULL DEFAULT 10,
  portal_scope ENUM('donor', 'hospital', 'staff', 'admin') NOT NULL DEFAULT 'donor',
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_roles_rank (authority_rank)
) ENGINE=InnoDB;

-- 15b. GRANULAR PERMISSIONS CATALOG
CREATE TABLE IF NOT EXISTS permissions (
  permission_id INT AUTO_INCREMENT PRIMARY KEY,
  permission_key VARCHAR(80) NOT NULL UNIQUE,
  category VARCHAR(50) NOT NULL,
  label VARCHAR(120) NOT NULL,
  description VARCHAR(255) NOT NULL
) ENGINE=InnoDB;

-- 15c. ROLE -> PERMISSION MAPPING (M:N)
CREATE TABLE IF NOT EXISTS role_permissions (
  role_id INT NOT NULL,
  permission_id INT NOT NULL,
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (role_id, permission_id),
  FOREIGN KEY (role_id) REFERENCES roles(role_id) ON DELETE CASCADE,
  FOREIGN KEY (permission_id) REFERENCES permissions(permission_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 15d. USER -> ROLE ASSIGNMENT
CREATE TABLE IF NOT EXISTS user_roles (
  user_id INT NOT NULL,
  role_id INT NOT NULL,
  assigned_by_user_id INT NULL,
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, role_id),
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  FOREIGN KEY (role_id) REFERENCES roles(role_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 15e. SERVER-MANAGED AUTHENTICATION SESSIONS (SHA-256 HASHED TOKENS)
CREATE TABLE IF NOT EXISTS user_sessions (
  session_id VARCHAR(64) PRIMARY KEY,
  user_id INT NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  ip_address VARCHAR(64) NOT NULL,
  user_agent VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_active_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  revoked_at TIMESTAMP NULL,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  INDEX idx_sessions_user (user_id),
  INDEX idx_sessions_expires (expires_at)
) ENGINE=InnoDB;

-- 15f. PASSWORD RESET TOKENS (SINGLE-USE, SHA-256 HASHED)
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  token_id VARCHAR(64) PRIMARY KEY,
  user_id INT NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  INDEX idx_reset_user (user_id)
) ENGINE=InnoDB;

-- 15g. EMAIL VERIFICATION TOKENS (SINGLE-USE, SHA-256 HASHED)
CREATE TABLE IF NOT EXISTS email_verification_tokens (
  token_id VARCHAR(64) PRIMARY KEY,
  user_id INT NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  INDEX idx_verify_user (user_id)
) ENGINE=InnoDB;

-- 15h. BRUTE-FORCE & LOGIN ATTEMPT TRACKER
CREATE TABLE IF NOT EXISTS login_attempts (
  attempt_key VARCHAR(160) PRIMARY KEY,
  failure_count INT NOT NULL DEFAULT 0,
  first_failed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  locked_until TIMESTAMP NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 15i. OPTIONAL TOTP MULTI-FACTOR AUTHENTICATION (RFC 6238)
CREATE TABLE IF NOT EXISTS user_mfa (
  user_id INT PRIMARY KEY,
  totp_secret VARCHAR(128) NULL,
  pending_secret VARCHAR(128) NULL,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  recovery_code_hashes JSON NULL,
  enabled_at TIMESTAMP NULL,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 15j. IMMUTABLE SECURITY & AUTHORIZATION AUDIT LOGS
CREATE TABLE IF NOT EXISTS security_audit_logs (
  event_id VARCHAR(64) PRIMARY KEY,
  actor_user_id INT NULL,
  actor_email VARCHAR(120) NULL,
  actor_role VARCHAR(50) NULL,
  action VARCHAR(80) NOT NULL,
  outcome ENUM('SUCCESS', 'DENIED', 'BLOCKED', 'WARNING') NOT NULL,
  resource VARCHAR(160) NOT NULL,
  target_user_id INT NULL,
  ip_address VARCHAR(64) NOT NULL,
  user_agent VARCHAR(255) NULL,
  details TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_sec_audit_action (action),
  INDEX idx_sec_audit_outcome (outcome),
  INDEX idx_sec_audit_created (created_at)
) ENGINE=InnoDB;
`;

// server/db/repositories/donor.repository.ts
async function listDonors({ page, limit, bloodGroup, city }) {
  const pool2 = getPool();
  const offset = (page - 1) * limit;
  let query = "SELECT * FROM donors WHERE 1=1";
  const params = [];
  if (bloodGroup && bloodGroup !== "all" && bloodGroup !== "ALL") {
    query += " AND blood_group = ?";
    params.push(bloodGroup);
  }
  if (city && city !== "all" && city !== "ALL") {
    query += " AND city = ?";
    params.push(city);
  }
  const countQuery = query.replace("SELECT *", "SELECT COUNT(*) AS total");
  const [countResult] = await pool2.query(countQuery, params);
  const total = Number(countResult[0]?.total ?? 0);
  query += " ORDER BY donor_id ASC LIMIT ? OFFSET ?";
  const [rows] = await pool2.query(query, [...params, limit, offset]);
  return { total, page, limit, donors: rows };
}
async function upsertDonor(d) {
  const pool2 = getPool();
  const sql = `
    INSERT INTO donors (
      donor_code, full_name, email, phone, date_of_birth, gender, blood_group,
      address_line, city, state, pincode, weight_kg, eligibility_status,
      donor_status, availability, verification_status, total_donations,
      last_donation_date, next_eligible_date
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      full_name = VALUES(full_name),
      phone = VALUES(phone),
      email = VALUES(email),
      weight_kg = VALUES(weight_kg),
      eligibility_status = VALUES(eligibility_status),
      donor_status = VALUES(donor_status),
      availability = VALUES(availability),
      verification_status = VALUES(verification_status),
      total_donations = VALUES(total_donations),
      last_donation_date = VALUES(last_donation_date),
      next_eligible_date = VALUES(next_eligible_date)
  `;
  const params = [
    d.donorCode || d.donor_code || `DON-${Date.now().toString().slice(-6)}`,
    d.fullName || d.full_name || "Anonymous Donor",
    d.email || `donor_${Date.now()}@bloodconnect.org`,
    d.phone || "+91 98000 00000",
    d.dateOfBirth || d.date_of_birth || "1995-01-01",
    d.gender || "Male",
    d.bloodGroup || d.blood_group || "O+",
    d.address || d.address_line || "Central District",
    d.city || "Mumbai",
    d.state || "Maharashtra",
    d.pincode || "400001",
    Number(d.weightKg ?? d.weight_kg ?? 65),
    d.eligibilityStatus || d.eligibility_status || "Eligible",
    d.donorStatus || d.donor_status || "Active",
    d.availability || "Available",
    d.verificationStatus || d.verification_status || "Verified",
    Number(d.totalDonations ?? d.total_donations ?? 0),
    d.lastDonationDate || d.last_donation_date || null,
    d.nextEligibleDate || d.next_eligible_date || (/* @__PURE__ */ new Date()).toISOString().split("T")[0]
  ];
  const [res] = await pool2.query(sql, params);
  return { insertId: res.insertId, affectedRows: res.affectedRows };
}
async function updateDonorByIdOrCode(idOrCode, updates) {
  const pool2 = getPool();
  const fields = [];
  const params = [];
  if (updates.fullName || updates.full_name) {
    fields.push("full_name = ?");
    params.push(updates.fullName || updates.full_name);
  }
  if (updates.phone) {
    fields.push("phone = ?");
    params.push(updates.phone);
  }
  if (updates.email) {
    fields.push("email = ?");
    params.push(updates.email);
  }
  if (updates.city) {
    fields.push("city = ?");
    params.push(updates.city);
  }
  if (updates.donorStatus || updates.donor_status) {
    fields.push("donor_status = ?");
    params.push(updates.donorStatus || updates.donor_status);
  }
  if (updates.availability) {
    fields.push("availability = ?");
    params.push(updates.availability);
  }
  if (updates.verificationStatus || updates.verification_status) {
    fields.push("verification_status = ?");
    params.push(updates.verificationStatus || updates.verification_status);
  }
  if (updates.eligibilityStatus || updates.eligibility_status) {
    fields.push("eligibility_status = ?");
    params.push(updates.eligibilityStatus || updates.eligibility_status);
  }
  if (updates.totalDonations !== void 0) {
    fields.push("total_donations = ?");
    params.push(Number(updates.totalDonations));
  }
  if (fields.length === 0) return { affectedRows: 0 };
  const whereClause = typeof idOrCode === "string" && idOrCode.startsWith("DON-") ? "WHERE donor_code = ?" : "WHERE donor_id = ?";
  const [res] = await pool2.query(
    `UPDATE donors SET ${fields.join(", ")} ${whereClause}`,
    [...params, idOrCode]
  );
  return { affectedRows: res.affectedRows };
}

// server/db/repositories/bloodUnit.repository.ts
async function listBloodUnits(status) {
  const pool2 = getPool();
  let query = "SELECT * FROM blood_units WHERE 1=1";
  const params = [];
  if (status && status !== "all" && status !== "ALL") {
    query += " AND status = ?";
    params.push(status);
  }
  query += " ORDER BY unit_id DESC LIMIT 100";
  const [rows] = await pool2.query(query, params);
  return rows;
}
async function upsertBloodUnit(unit) {
  const pool2 = getPool();
  const sql = `
    INSERT INTO blood_units (
      unit_code, donor_id, blood_group, component_type, volume_ml,
      collection_date, expiry_date, status, cold_storage_location,
      temperature_c, barcode, is_tested
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      status = VALUES(status),
      cold_storage_location = VALUES(cold_storage_location)
  `;
  const params = [
    unit.unitCode || unit.unit_code || `BC-${Date.now().toString().slice(-8)}`,
    unit.donorId || unit.donor_id || null,
    unit.bloodGroup || unit.blood_group || "O+",
    unit.component || unit.component_type || "Packed Red Blood Cells",
    Number(unit.volumeMl ?? unit.volume_ml ?? 350),
    unit.collectionDate ? new Date(unit.collectionDate) : /* @__PURE__ */ new Date(),
    unit.expiryDate ? new Date(unit.expiryDate) : new Date(Date.now() + 35 * 864e5),
    unit.status || "Available",
    unit.storageLocation || unit.cold_storage_location || "Freezer Bay Alpha-1",
    Number(unit.temperatureC ?? unit.temperature_c ?? 4),
    unit.barcode || `BAR${Date.now().toString().slice(-10)}`,
    unit.isTested !== void 0 ? Boolean(unit.isTested) : true
  ];
  const [res] = await pool2.query(sql, params);
  return { insertId: res.insertId, affectedRows: res.affectedRows };
}

// server/db/repositories/request.repository.ts
async function listBloodRequests() {
  const pool2 = getPool();
  const [rows] = await pool2.query("SELECT * FROM blood_requests ORDER BY request_id DESC LIMIT 100");
  return rows;
}
async function upsertBloodRequest(req) {
  const pool2 = getPool();
  const sql = `
    INSERT INTO blood_requests (
      request_code, hospital_id, hospital_name, patient_name, patient_age,
      patient_gender, blood_group, component_type, units_needed, urgency,
      diagnosis, attending_physician, contact_phone, required_date, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      status = VALUES(status),
      units_needed = VALUES(units_needed)
  `;
  const params = [
    req.requestCode || req.request_code || `REQ-${Date.now().toString().slice(-6)}`,
    Number(req.hospitalId ?? req.hospital_id ?? 1),
    req.hospitalName || req.hospital_name || "General Referral Hospital",
    req.patientName || req.patient_name || "Emergency Patient",
    Number(req.patientAge ?? req.patient_age ?? 35),
    req.patientGender || req.patient_gender || "Male",
    req.bloodGroup || req.blood_group || "O+",
    req.component || req.component_type || "Packed Red Blood Cells",
    Number(req.unitsRequired ?? req.units_needed ?? 1),
    req.urgency || "Urgent",
    req.diagnosis || req.remarks || "Acute need / Trauma",
    req.attendingPhysician || req.attending_physician || "Duty Consultant, MD",
    req.contactPhone || req.contact_phone || "+91 98000 11111",
    req.requiredDate ? new Date(req.requiredDate) : new Date(Date.now() + 864e5),
    req.status || "Pending"
  ];
  const [res] = await pool2.query(sql, params);
  return { insertId: res.insertId, affectedRows: res.affectedRows };
}
async function updateBloodRequestStatus(idOrCode, status, note) {
  const pool2 = getPool();
  const whereClause = typeof idOrCode === "string" && idOrCode.startsWith("REQ-") ? "WHERE request_code = ?" : "WHERE request_id = ?";
  const [res] = await pool2.query(
    `UPDATE blood_requests SET status = ? ${whereClause}`,
    [status, idOrCode]
  );
  try {
    await pool2.query(
      "INSERT INTO audit_logs (user_id, action, table_name, record_id, new_value) VALUES (?, ?, ?, ?, ?)",
      [
        1,
        "UPDATE_REQUEST_STATUS",
        "blood_requests",
        typeof idOrCode === "number" ? idOrCode : 1,
        `Shifted to ${status}. ${note || ""}`.trim()
      ]
    );
  } catch {
  }
  return { affectedRows: res.affectedRows };
}

// server/db/repositories/camp.repository.ts
async function listCamps() {
  const pool2 = getPool();
  const [rows] = await pool2.query("SELECT * FROM donation_camps ORDER BY camp_id DESC");
  return rows;
}
async function upsertCamp(camp) {
  const pool2 = getPool();
  const sql = `
    INSERT INTO donation_camps (
      camp_code, name, organizer, camp_date, start_time, end_time,
      location, city, capacity, registered_donors_count, collected_units_count,
      status, contact_person, contact_phone
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      registered_donors_count = VALUES(registered_donors_count),
      status = VALUES(status)
  `;
  const params = [
    camp.campCode || camp.camp_code || `CMP-${Date.now().toString().slice(-6)}`,
    camp.name || "Community Blood Drive",
    camp.organizer || "Red Cross Society",
    camp.date || camp.camp_date || (/* @__PURE__ */ new Date()).toISOString().split("T")[0],
    camp.startTime || camp.start_time || "09:00 AM",
    camp.endTime || camp.end_time || "05:00 PM",
    camp.location || "Community Center",
    camp.city || "Mumbai",
    Number(camp.capacity ?? 100),
    Number(camp.registeredDonorsCount ?? camp.registered_donors_count ?? 0),
    Number(camp.collectedUnitsCount ?? camp.collected_units_count ?? 0),
    camp.status || "Upcoming",
    camp.contactPerson || camp.contact_person || "Coordinator",
    camp.contactPhone || camp.contact_phone || "+91 98000 22222"
  ];
  const [res] = await pool2.query(sql, params);
  return { insertId: res.insertId, affectedRows: res.affectedRows };
}
async function registerCampDonor(campId, donor, timeSlot) {
  const pool2 = getPool();
  const sql = `
    INSERT INTO camp_registrations (
      camp_id, camp_name, donor_id, donor_name, donor_code, blood_group, time_slot, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;
  const params = [
    campId,
    donor.campName || "Donation Drive",
    Number(donor.id ?? donor.donorId ?? 1),
    donor.fullName || donor.donorName || "Donor",
    donor.donorCode || "DON-0001",
    donor.bloodGroup || "O+",
    timeSlot || "10:00 AM - 11:00 AM",
    "Registered"
  ];
  const [res] = await pool2.query(sql, params);
  await pool2.query(
    "UPDATE donation_camps SET registered_donors_count = registered_donors_count + 1 WHERE camp_id = ?",
    [campId]
  );
  return { insertId: res.insertId };
}

// server/db/repositories/appointment.repository.ts
async function listAppointments(donorId) {
  const pool2 = getPool();
  if (donorId) {
    const [rows2] = await pool2.query(
      "SELECT * FROM donation_appointments WHERE donor_id = ? ORDER BY appointment_date ASC, appointment_id DESC",
      [donorId]
    );
    return rows2;
  }
  const [rows] = await pool2.query(
    "SELECT * FROM donation_appointments ORDER BY appointment_id DESC LIMIT 100"
  );
  return rows;
}
async function upsertAppointment(apt) {
  const pool2 = getPool();
  const sql = `
    INSERT INTO donation_appointments (
      appointment_code, donor_id, donor_name, donor_phone, donor_email,
      blood_group, hospital_id, center_name, center_address, city,
      donation_type, appointment_date, time_slot, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      appointment_date = VALUES(appointment_date),
      time_slot = VALUES(time_slot),
      status = VALUES(status)
  `;
  const params = [
    apt.appointmentCode || apt.appointment_code || `APT-${(/* @__PURE__ */ new Date()).getFullYear()}-${Math.floor(1e3 + Math.random() * 9e3)}`,
    apt.donorId ?? apt.donor_id ?? null,
    apt.donorName || apt.donor_name || "Donor",
    apt.donorPhone || apt.donor_phone || "",
    apt.donorEmail || apt.donor_email || "",
    apt.bloodGroup || apt.blood_group || "O+",
    Number(apt.hospitalId ?? apt.hospital_id ?? 1),
    apt.centerName || apt.center_name || "BloodConnect Collection Center",
    apt.centerAddress || apt.center_address || "Main Campus",
    apt.city || "Mumbai",
    apt.donationType || apt.donation_type || "Whole Blood",
    apt.appointmentDate || apt.appointment_date || (/* @__PURE__ */ new Date()).toISOString().split("T")[0],
    apt.timeSlot || apt.time_slot || "10:00 AM - 11:00 AM",
    apt.status || "Scheduled"
  ];
  const [res] = await pool2.query(sql, params);
  return { insertId: res.insertId, affectedRows: res.affectedRows };
}
async function updateAppointmentByIdOrCode(idOrCode, updates) {
  const pool2 = getPool();
  const fields = [];
  const params = [];
  if (updates.status) {
    fields.push("status = ?");
    params.push(updates.status);
  }
  if (updates.appointmentDate) {
    fields.push("appointment_date = ?");
    params.push(updates.appointmentDate);
  }
  if (updates.timeSlot) {
    fields.push("time_slot = ?");
    params.push(updates.timeSlot);
  }
  if (fields.length === 0) return { affectedRows: 0 };
  const whereClause = typeof idOrCode === "string" && idOrCode.startsWith("APT-") ? "WHERE appointment_code = ?" : "WHERE appointment_id = ?";
  const [res] = await pool2.query(
    `UPDATE donation_appointments SET ${fields.join(", ")} ${whereClause}`,
    [...params, idOrCode]
  );
  return { affectedRows: res.affectedRows };
}

// server/db/repositories/sync.repository.ts
async function executeAutoInit(customConfig) {
  try {
    const currentPool = getPool(customConfig);
    const statements = SCHEMA_SQL.split(";").map((s) => s.replace(/--[^\r\n]*/g, "").trim()).filter((s) => s.length > 0);
    let executed = 0;
    const errors = [];
    for (const stmt of statements) {
      try {
        await currentPool.query(stmt);
        executed++;
      } catch (e) {
        const upper = stmt.toUpperCase();
        if (upper.startsWith("CREATE DATABASE") || upper.startsWith("USE ")) {
          continue;
        }
        errors.push(e instanceof Error ? e.message : String(e));
      }
    }
    if (errors.length > 0 && executed === 0) {
      if (isDatabaseOfflineError(new Error(errors[0]))) {
        return {
          success: false,
          offline: true,
          message: `MySQL host ${customConfig?.host || "localhost"} is unreachable (${errors[0]}). Configure DB_HOST/DB_USER/DB_PASSWORD or start your MySQL server to initialize tables.`,
          executedQueries: 0
        };
      }
      return {
        success: false,
        message: `Schema execution error: ${errors[0]}`,
        executedQueries: 0
      };
    }
    return {
      success: true,
      message: `Successfully executed schema statements in MySQL (${executed} DDL/DML statements applied).`,
      executedQueries: executed
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      offline: isDatabaseOfflineError(err),
      message: `Schema initialization failed: ${msg}`,
      executedQueries: 0
    };
  }
}
async function seedSampleDatabase(customConfig) {
  const pool2 = getPool(customConfig);
  const demoHash = hashPassword("password123");
  await pool2.query(
    `INSERT IGNORE INTO users (username, email, password_hash, role, full_name, phone) VALUES
    ('donor_rahul', 'rahul.sharma@donor.bloodconnect.org', ?, 'donor', 'Rahul Sharma', '+91 98201 45678'),
    ('hosp_metro', 'admin@metrohealth.org', ?, 'hospital', 'Dr. Anita Desai', '+91 98450 12345'),
    ('staff_sarah', 'nurse.sarah@bloodconnect.org', ?, 'staff', 'Sarah Jenkins, RN', '+91 98111 87654'),
    ('admin_system', 'director@bloodconnect.org', ?, 'admin', 'Dr. Rajesh Nair', '+91 98220 99887')`,
    [demoHash, demoHash, demoHash, demoHash]
  );
  await pool2.query(`
    INSERT IGNORE INTO donors (donor_code, full_name, email, phone, date_of_birth, gender, blood_group, address_line, city, pincode, weight_kg, total_donations, next_eligible_date) VALUES
    ('DNR-2026-001', 'Rahul Sharma', 'rahul.sharma@donor.bloodconnect.org', '+91 98201 45678', '1992-04-12', 'Male', 'O+', '402 Sunrise Heights, Bandra West', 'Mumbai', '400050', 74.5, 4, '2026-10-15'),
    ('DNR-2026-002', 'Priya Patel', 'priya.p@gmail.com', '+91 98210 23456', '1996-08-25', 'Female', 'A+', '12 Gulmohar Lane, Vile Parle', 'Mumbai', '400056', 58.0, 2, '2026-11-01'),
    ('DNR-2026-003', 'Vikramaditya Rao', 'vikram.rao@techcorp.in', '+91 97400 34567', '1989-11-03', 'Male', 'O-', '88 Koramangala 4th Block', 'Bengaluru', '560034', 81.0, 7, '2026-09-20'),
    ('DNR-2026-004', 'Ananya Sen', 'ananya.sen@kolkata.edu', '+91 98300 45678', '1998-02-14', 'Female', 'B+', '15 Ballygunge Circular Rd', 'Kolkata', '700019', 61.5, 3, '2026-10-05'),
    ('DNR-2026-005', 'Gurpreet Singh', 'gurpreet.s@delhitech.ac.in', '+91 98101 56789', '1994-07-19', 'Male', 'AB+', 'C-42 Hauz Khas Enclave', 'New Delhi', '110016', 79.0, 5, '2026-09-30')
  `);
  await pool2.query(`
    INSERT IGNORE INTO blood_units (unit_code, donor_id, blood_group, component_type, volume_ml, collection_date, expiry_date, status, cold_storage_location, temperature_c, barcode) VALUES
    ('BC-2026-OP-001', 1, 'O+', 'Packed Red Blood Cells', 350, NOW(), DATE_ADD(NOW(), INTERVAL 35 DAY), 'Available', 'Freezer Bay Alpha-1', 3.8, 'BC99201456781'),
    ('BC-2026-ON-002', 3, 'O-', 'Whole Blood', 450, NOW(), DATE_ADD(NOW(), INTERVAL 28 DAY), 'Available', 'Freezer Bay Alpha-2', 4.0, 'BC99201456782'),
    ('BC-2026-AP-003', 2, 'A+', 'Platelets', 250, NOW(), DATE_ADD(NOW(), INTERVAL 5 DAY), 'Available', 'Agitator Chamber C-1', 22.0, 'BC99201456783'),
    ('BC-2026-BP-004', 4, 'B+', 'Fresh Frozen Plasma', 200, NOW(), DATE_ADD(NOW(), INTERVAL 365 DAY), 'Available', 'Deep Subzero Vault D-1', -25.0, 'BC99201456784'),
    ('BC-2026-ABP-005', 5, 'AB+', 'Packed Red Blood Cells', 350, NOW(), DATE_ADD(NOW(), INTERVAL 32 DAY), 'Available', 'Freezer Bay Alpha-3', 3.5, 'BC99201456785')
  `);
  await pool2.query(`
    INSERT IGNORE INTO blood_requests (request_code, hospital_id, hospital_name, patient_name, patient_age, patient_gender, blood_group, component_type, units_needed, urgency, diagnosis, attending_physician, contact_phone, required_date, status) VALUES
    ('REQ-2026-8801', 1, 'Metro General Hospital & Trauma Center', 'Deepak Verma', 42, 'Male', 'O-', 'Packed Red Blood Cells', 3, 'Immediate (Emergency)', 'Polytrauma / Road Accident with acute hemorrhage', 'Dr. Anita Desai', '+91 98450 12345', DATE_ADD(NOW(), INTERVAL 2 HOUR), 'Pending'),
    ('REQ-2026-8802', 2, 'Apollo Emergency Trauma Care', 'Sunita Roy', 28, 'Female', 'A+', 'Platelets', 2, 'Urgent', 'Severe Dengue with Thrombocytopenia', 'Dr. Arvind Mehra', '+91 98200 67890', DATE_ADD(NOW(), INTERVAL 8 HOUR), 'Approved')
  `);
  await pool2.query(`
    INSERT INTO audit_logs (user_id, action, table_name, record_id, old_value, new_value) VALUES
    (1, 'DATABASE_SAMPLE_DATA_SEEDED', 'system', 1, NULL, 'Initialized sample users, donors, units, and emergency requests in MySQL')
  `);
}
async function executeRawQuery(sql, customConfig) {
  const start = Date.now();
  const trimmed = sql.trim().replace(/;+$/, "");
  try {
    const currentPool = getPool(customConfig);
    const [result, fieldDefs] = await currentPool.query(trimmed);
    const durationMs = Date.now() - start;
    if (Array.isArray(result)) {
      const fields = fieldDefs ? fieldDefs.map((f) => f.name) : result.length > 0 ? Object.keys(result[0]) : [];
      return {
        success: true,
        message: `Query executed successfully in ${durationMs}ms (${result.length} rows returned).`,
        rows: result,
        fields,
        durationMs
      };
    }
    return {
      success: true,
      message: `Query executed successfully in ${durationMs}ms (${result.affectedRows || 0} rows affected).`,
      rows: [result],
      fields: Object.keys(result),
      durationMs
    };
  } catch (err) {
    const durationMs = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    const offline = isDatabaseOfflineError(err);
    return {
      success: false,
      offline,
      message: offline ? `MySQL server is not reachable (${msg}). Connect to a live MySQL instance to execute SQL queries.` : msg,
      durationMs
    };
  }
}
async function bulkSyncToMySQL(payload) {
  const pool2 = getPool();
  const results = {
    donorsSynced: 0,
    unitsSynced: 0,
    requestsSynced: 0,
    campsSynced: 0,
    appointmentsSynced: 0
  };
  if (Array.isArray(payload.donors)) {
    for (const d of payload.donors.slice(0, 500)) {
      try {
        await upsertDonor(d);
        results.donorsSynced++;
      } catch {
      }
    }
  }
  if (Array.isArray(payload.bloodUnits)) {
    for (const u of payload.bloodUnits) {
      try {
        await upsertBloodUnit(u);
        results.unitsSynced++;
      } catch {
      }
    }
  }
  if (Array.isArray(payload.requests)) {
    for (const r of payload.requests) {
      try {
        await upsertBloodRequest(r);
        results.requestsSynced++;
      } catch {
      }
    }
  }
  if (Array.isArray(payload.camps)) {
    for (const c of payload.camps) {
      try {
        await upsertCamp(c);
        results.campsSynced++;
      } catch {
      }
    }
  }
  if (Array.isArray(payload.appointments)) {
    for (const apt of payload.appointments) {
      try {
        await upsertAppointment(apt);
        results.appointmentsSynced++;
      } catch {
      }
    }
  }
  try {
    await pool2.query(
      "INSERT INTO audit_logs (user_id, action, table_name, record_id, new_value) VALUES (?, ?, ?, ?, ?)",
      [
        1,
        "FULL_DATABASE_BULK_SYNC",
        "system",
        1,
        `Bulk sync completed: ${results.donorsSynced} donors, ${results.unitsSynced} units, ${results.requestsSynced} requests, ${results.campsSynced} camps, ${results.appointmentsSynced} appointments.`
      ]
    );
  } catch {
  }
  return results;
}
async function fetchAllLiveData() {
  const pool2 = getPool();
  const data = {
    donors: [],
    bloodUnits: [],
    requests: [],
    camps: [],
    appointments: [],
    patients: [],
    auditLogs: [],
    liveCounts: {}
  };
  const queries = [
    { key: "donors", sql: "SELECT * FROM donors ORDER BY donor_id DESC LIMIT 200" },
    { key: "bloodUnits", sql: "SELECT * FROM blood_units ORDER BY unit_id DESC LIMIT 200" },
    { key: "requests", sql: "SELECT * FROM blood_requests ORDER BY request_id DESC LIMIT 100" },
    { key: "camps", sql: "SELECT * FROM donation_camps ORDER BY camp_id DESC" },
    { key: "appointments", sql: "SELECT * FROM donation_appointments ORDER BY appointment_id DESC LIMIT 100" },
    { key: "patients", sql: "SELECT * FROM patients ORDER BY patient_id DESC LIMIT 50" },
    { key: "auditLogs", sql: "SELECT * FROM audit_logs ORDER BY log_id DESC LIMIT 50" }
  ];
  for (const item of queries) {
    try {
      const [rows] = await pool2.query(item.sql);
      data[item.key] = rows;
    } catch {
      data[item.key] = [];
    }
  }
  for (const table of MONITORED_TABLES) {
    try {
      const [rows] = await pool2.query(`SELECT COUNT(*) AS count FROM \`${table}\``);
      data.liveCounts[table] = Number(rows[0]?.count ?? 0);
    } catch {
    }
  }
  return data;
}

// server/utils/validators.ts
var VALID_BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
var VALID_REQUEST_STATUSES = [
  "Pending",
  "Under Review",
  "In Cross-Match",
  "Approved",
  "Partially Fulfilled",
  "Fulfilled",
  "Rejected",
  "Cancelled"
];
var VALID_APPOINTMENT_STATUSES = [
  "Scheduled",
  "Checked In",
  "Completed",
  "Cancelled"
];
var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function isValidBloodGroup(value) {
  return typeof value === "string" && VALID_BLOOD_GROUPS.includes(value);
}
function isValidEmail(value) {
  return typeof value === "string" && EMAIL_RE.test(value.trim());
}
function sanitizeNonEmptyString(value, maxLen = 255) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLen);
}
function parsePositiveInt(value, fallback, max = 1e4) {
  const num = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(num) || num < 1) return fallback;
  return Math.min(num, max);
}
function extractDbConfigInput(body) {
  if (!body || typeof body !== "object") return void 0;
  const { host, port, user, password, database, ssl, uri } = body;
  const hasAny = host !== void 0 || port !== void 0 || user !== void 0 || password !== void 0 || database !== void 0 || ssl !== void 0 || uri !== void 0;
  if (!hasAny) return void 0;
  const parsedPort = port !== void 0 && port !== "" ? Number.parseInt(String(port), 10) : void 0;
  if (parsedPort !== void 0 && (!Number.isFinite(parsedPort) || parsedPort < 1 || parsedPort > 65535)) {
    throw new ValidationError("Invalid MySQL port number", { port: "Port must be between 1 and 65535" });
  }
  return {
    host: typeof host === "string" && host.trim() ? host.trim() : void 0,
    port: parsedPort,
    user: typeof user === "string" && user.trim() ? user.trim() : void 0,
    password: typeof password === "string" ? password : void 0,
    database: typeof database === "string" && database.trim() ? database.trim() : void 0,
    ssl: ssl !== void 0 ? Boolean(ssl) : void 0,
    uri: typeof uri === "string" && uri.trim() ? uri.trim() : void 0
  };
}

// server/controllers/database.controller.ts
async function getDatabaseStatus(_req, res) {
  const result = await testConnection();
  return res.json(result);
}
async function testDatabaseConnection(req, res) {
  const config = extractDbConfigInput(req.body);
  const result = await testConnection(config);
  return res.json(result);
}
async function connectDatabase(req, res) {
  const config = extractDbConfigInput(req.body);
  const result = await testConnection(config);
  if (result.success) {
    try {
      await executeAutoInit();
    } catch {
    }
  }
  return res.json(result);
}
async function initDatabaseTables(req, res) {
  const config = extractDbConfigInput(req.body);
  const result = await executeAutoInit(config);
  return res.status(result.success ? 200 : result.offline ? 503 : 500).json(result);
}
function downloadSchemaSql(_req, res) {
  res.setHeader("Content-Type", "application/sql");
  res.setHeader("Content-Disposition", 'attachment; filename="bloodconnect_schema.sql"');
  res.send(SCHEMA_SQL);
}
async function runSqlQuery(req, res) {
  const { query } = req.body || {};
  if (!query || typeof query !== "string" || !query.trim()) {
    throw new ValidationError("SQL query string is required", { query: "Provide a non-empty SQL statement" });
  }
  const config = extractDbConfigInput(req.body);
  const result = await executeRawQuery(query, config);
  return res.status(result.success ? 200 : result.offline ? 503 : 400).json(result);
}
async function seedDatabase(req, res) {
  const config = extractDbConfigInput(req.body);
  try {
    await seedSampleDatabase(config);
    return sendSuccess(res, {
      message: "Successfully populated MySQL database with sample users, donors, blood units, and hospital requests."
    });
  } catch (err) {
    if (isDatabaseOfflineError(err)) {
      return res.status(503).json({
        success: false,
        offline: true,
        message: "Cannot seed MySQL because the database host is unreachable. Start MySQL and connect first.",
        config: getStatus()
      });
    }
    throw err;
  }
}
async function syncAllRecords(req, res) {
  const body = req.body || {};
  try {
    const synced = await bulkSyncToMySQL({
      donors: Array.isArray(body.donors) ? body.donors : [],
      bloodUnits: Array.isArray(body.bloodUnits) ? body.bloodUnits : [],
      requests: Array.isArray(body.requests) ? body.requests : [],
      camps: Array.isArray(body.camps) ? body.camps : [],
      appointments: Array.isArray(body.appointments) ? body.appointments : []
    });
    const liveData = await fetchAllLiveData();
    return sendSuccess(res, {
      message: `Synchronized live with MySQL: ${synced.donorsSynced} donors, ${synced.unitsSynced} units, ${synced.requestsSynced} requests, ${synced.campsSynced} camps, ${synced.appointmentsSynced} appointments.`,
      synced,
      liveCounts: liveData.liveCounts
    });
  } catch (err) {
    if (isDatabaseOfflineError(err)) {
      return res.status(503).json({
        success: false,
        offline: true,
        message: "MySQL is offline. Connect to a live MySQL instance before pushing records."
      });
    }
    throw err;
  }
}
async function getLiveData(_req, res) {
  try {
    const data = await fetchAllLiveData();
    return sendSuccess(res, {
      connected: isDbConnected(),
      data
    });
  } catch (err) {
    if (isDatabaseOfflineError(err)) {
      return res.status(503).json({
        success: false,
        connected: false,
        offline: true,
        message: "MySQL is currently offline."
      });
    }
    throw err;
  }
}

// server/routes/database.routes.ts
var router = Router();
router.get("/status", asyncHandler(getDatabaseStatus));
router.get("/schema.sql", downloadSchemaSql);
router.post("/test", requirePermission("db:manage"), asyncHandler(testDatabaseConnection));
router.post("/connect", requirePermission("db:manage"), asyncHandler(connectDatabase));
router.post("/init-tables", requirePermission("db:manage"), asyncHandler(initDatabaseTables));
router.post("/query", requirePermission("db:manage"), asyncHandler(runSqlQuery));
router.post("/seed", requirePermission("db:manage"), asyncHandler(seedDatabase));
router.post("/sync-all", requirePermission("db:manage"), asyncHandler(syncAllRecords));
router.get("/live-data", requirePermission("db:manage"), asyncHandler(getLiveData));
var database_routes_default = router;

// server/routes/auth.routes.ts
import { Router as Router2 } from "express";

// server/controllers/auth.controller.ts
async function register(req, res) {
  const email = sanitizeNonEmptyString(req.body?.email, 120);
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  const fullName = sanitizeNonEmptyString(req.body?.fullName, 100);
  const phone = sanitizeNonEmptyString(req.body?.phone, 25) || "";
  const usernameInput = sanitizeNonEmptyString(req.body?.username, 50);
  const department = sanitizeNonEmptyString(req.body?.department, 100) || "Voluntary Donor Network";
  const organizationName = sanitizeNonEmptyString(req.body?.organizationName, 120) || void 0;
  if (!email || !isValidEmail(email)) {
    throw new ValidationError("A valid email address is required.", { email: "Invalid email format" });
  }
  if (!fullName || fullName.length < 2) {
    throw new ValidationError("Full name is required (minimum 2 characters).", {
      fullName: "Full name is required"
    });
  }
  const passwordIssue = validatePasswordStrength(password);
  if (passwordIssue) {
    throw new ValidationError(passwordIssue, { password: passwordIssue });
  }
  const generatedUsername = (usernameInput || `user_${fullName.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12)}_${Date.now().toString().slice(-4)}`).toLowerCase();
  if (securityStore.userExists(email, generatedUsername)) {
    throw new ConflictError("An account with this email address or username already exists.");
  }
  const ipAddress = getClientIp(req);
  const userAgent = getUserAgent(req);
  const attemptedRole = typeof req.body?.role === "string" ? req.body.role : typeof req.body?.roleKey === "string" ? req.body.roleKey : null;
  if (attemptedRole && !["regular_user", "donor"].includes(attemptedRole)) {
    securityStore.recordAudit({
      actorEmail: email.toLowerCase(),
      actorRole: "guest",
      action: "PRIVILEGE_ESCALATION_BLOCKED",
      outcome: "BLOCKED",
      resource: "POST /api/auth/register",
      ipAddress,
      userAgent,
      details: `Ignored client-supplied privileged role '${attemptedRole}' during public registration; enforced 'regular_user'.`
    });
  }
  const passwordHash = hashPassword(password);
  const user = securityStore.createUser({
    username: generatedUsername,
    email: email.toLowerCase(),
    passwordHash,
    fullName,
    phone,
    roleKey: "regular_user",
    // Strictly server-enforced least privilege
    status: "active",
    emailVerified: false,
    department,
    organizationName
  });
  const verification = securityStore.issueEmailVerificationToken(user.id);
  const { rawToken, session, maxAgeSeconds } = securityStore.createSession(user.id, {
    ipAddress,
    userAgent,
    rememberMe: false
  });
  setSessionCookie(res, rawToken, maxAgeSeconds);
  securityStore.recordAudit({
    actorUserId: user.id,
    actorEmail: user.email,
    actorRole: user.roleKey,
    action: "USER_REGISTERED",
    outcome: "SUCCESS",
    resource: "POST /api/auth/register",
    targetUserId: user.id,
    ipAddress,
    userAgent,
    details: "Registered new regular_user account with scrypt password hash and verification token."
  });
  return sendCreated(res, {
    message: "Account created successfully. Please verify your email address.",
    user: securityStore.toPublicUser(user),
    sessionId: session.id,
    emailVerification: {
      required: true,
      expiresAt: verification.expiresAt,
      deliveryMode: env.smtp.configured ? "smtp" : "development_preview",
      ...env.nodeEnv !== "production" && !env.smtp.configured ? { devPreviewToken: verification.rawToken } : {}
    }
  });
}
async function login(req, res) {
  const identifier = sanitizeNonEmptyString(req.body?.identifier, 120);
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  const rememberMe = Boolean(req.body?.rememberMe);
  if (!identifier || !password) {
    throw new ValidationError("Email or username and password are required.", {
      identifier: !identifier ? "Required" : "",
      password: !password ? "Required" : ""
    });
  }
  const ipAddress = getClientIp(req);
  const userAgent = getUserAgent(req);
  const lockout = securityStore.checkBruteForceLockout(identifier, ipAddress);
  if (lockout.locked) {
    securityStore.recordAudit({
      actorEmail: identifier.toLowerCase(),
      action: "BRUTE_FORCE_LOCKOUT",
      outcome: "BLOCKED",
      resource: "POST /api/auth/login",
      ipAddress,
      userAgent,
      details: `Blocked login attempt during active lockout window (${lockout.retryAfterSec}s remaining).`
    });
    throw new RateLimitError(
      `Account temporarily locked due to repeated failed login attempts. Try again in ${Math.ceil(lockout.retryAfterSec / 60)} minute(s).`,
      lockout.retryAfterSec
    );
  }
  const user = securityStore.findUserByIdentifier(identifier);
  if (!user) {
    const attempt = securityStore.recordFailedLogin(identifier, ipAddress);
    securityStore.recordAudit({
      actorEmail: identifier.toLowerCase(),
      action: attempt.lockedNow ? "BRUTE_FORCE_LOCKOUT" : "LOGIN_FAILED",
      outcome: attempt.lockedNow ? "BLOCKED" : "DENIED",
      resource: "POST /api/auth/login",
      ipAddress,
      userAgent,
      details: `Invalid login identifier (${attempt.attemptsUsed}/${env.security.maxLoginAttempts} attempts).`
    });
    if (attempt.lockedNow) {
      throw new RateLimitError(
        `Too many failed login attempts. Temporarily locked for ${env.security.lockoutWindowMinutes} minutes.`,
        attempt.retryAfterSec
      );
    }
    throw new AuthenticationError("Invalid email/username or password.");
  }
  if (user.status === "suspended" || user.status === "deactivated") {
    securityStore.recordAudit({
      actorUserId: user.id,
      actorEmail: user.email,
      actorRole: user.roleKey,
      action: "LOGIN_BLOCKED_STATUS",
      outcome: "BLOCKED",
      resource: "POST /api/auth/login",
      targetUserId: user.id,
      ipAddress,
      userAgent,
      details: `Blocked login for ${user.status} account.`
    });
    throw new AuthorizationError(
      user.status === "suspended" ? "Your account has been suspended by an administrator. Please contact security support." : "This account has been deactivated and cannot sign in.",
      "ACCOUNT_DISABLED"
    );
  }
  const validPassword = verifyPassword(password, user.passwordHash);
  if (!validPassword) {
    const attempt = securityStore.recordFailedLogin(identifier, ipAddress);
    securityStore.recordAudit({
      actorUserId: user.id,
      actorEmail: user.email,
      actorRole: user.roleKey,
      action: attempt.lockedNow ? "BRUTE_FORCE_LOCKOUT" : "LOGIN_FAILED",
      outcome: attempt.lockedNow ? "BLOCKED" : "DENIED",
      resource: "POST /api/auth/login",
      targetUserId: user.id,
      ipAddress,
      userAgent,
      details: `Invalid password (${attempt.attemptsUsed}/${env.security.maxLoginAttempts} attempts).`
    });
    if (attempt.lockedNow) {
      throw new RateLimitError(
        `Too many failed login attempts. Account locked for ${env.security.lockoutWindowMinutes} minutes.`,
        attempt.retryAfterSec
      );
    }
    const remaining = Math.max(0, env.security.maxLoginAttempts - attempt.attemptsUsed);
    throw new AuthenticationError(
      `Invalid email/username or password. ${remaining} attempt(s) remaining before temporary lockout.`
    );
  }
  securityStore.clearLoginAttempts(identifier, ipAddress);
  const mfaStatus = securityStore.getMfaStatus(user.id);
  if (mfaStatus.enabled) {
    const challenge = securityStore.createMfaChallenge(user.id, {
      rememberMe,
      ipAddress,
      userAgent
    });
    securityStore.recordAudit({
      actorUserId: user.id,
      actorEmail: user.email,
      actorRole: user.roleKey,
      action: "MFA_CHALLENGE_ISSUED",
      outcome: "SUCCESS",
      resource: "POST /api/auth/login",
      targetUserId: user.id,
      ipAddress,
      userAgent,
      details: "Primary password verified; issued 5-minute TOTP MFA verification challenge."
    });
    return sendSuccess(res, {
      mfaRequired: true,
      challengeToken: challenge.challengeToken,
      expiresAt: challenge.expiresAt,
      message: "Enter the 6-digit code from your authenticator app or a backup recovery code."
    });
  }
  const { rawToken, session, maxAgeSeconds } = securityStore.createSession(user.id, {
    ipAddress,
    userAgent,
    rememberMe
  });
  securityStore.markUserLogin(user.id);
  setSessionCookie(res, rawToken, maxAgeSeconds);
  securityStore.recordAudit({
    actorUserId: user.id,
    actorEmail: user.email,
    actorRole: user.roleKey,
    action: "LOGIN_SUCCESS",
    outcome: "SUCCESS",
    resource: "POST /api/auth/login",
    targetUserId: user.id,
    ipAddress,
    userAgent,
    details: `Authenticated session ${session.id} established.`
  });
  return sendSuccess(res, {
    mfaRequired: false,
    user: securityStore.toPublicUser(user),
    sessionId: session.id
  });
}
async function verifyMfaLogin(req, res) {
  const challengeToken = sanitizeNonEmptyString(req.body?.challengeToken, 200);
  const code = sanitizeNonEmptyString(req.body?.code, 32);
  if (!challengeToken || !code) {
    throw new ValidationError("Challenge token and verification code are required.");
  }
  const ipAddress = getClientIp(req);
  const userAgent = getUserAgent(req);
  const challenge = securityStore.getActiveMfaChallenge(challengeToken);
  if (!challenge) {
    throw new AuthenticationError("MFA verification challenge is invalid or has expired. Please sign in again.");
  }
  const user = securityStore.findUserById(challenge.userId);
  if (!user || user.status === "suspended" || user.status === "deactivated") {
    throw new AuthorizationError("Account is no longer active.");
  }
  const check = securityStore.verifyUserMfaCode(user.id, code);
  if (!check.verified) {
    securityStore.recordAudit({
      actorUserId: user.id,
      actorEmail: user.email,
      actorRole: user.roleKey,
      action: "MFA_FAILED",
      outcome: "DENIED",
      resource: "POST /api/auth/mfa/verify-login",
      targetUserId: user.id,
      ipAddress,
      userAgent,
      details: "Invalid TOTP or recovery code submitted during login."
    });
    throw new AuthenticationError("Invalid authenticator code or backup recovery code.");
  }
  securityStore.consumeMfaChallenge(challenge.id);
  const { rawToken, session, maxAgeSeconds } = securityStore.createSession(user.id, {
    ipAddress,
    userAgent,
    rememberMe: challenge.rememberMe
  });
  securityStore.markUserLogin(user.id);
  setSessionCookie(res, rawToken, maxAgeSeconds);
  securityStore.recordAudit({
    actorUserId: user.id,
    actorEmail: user.email,
    actorRole: user.roleKey,
    action: "LOGIN_SUCCESS_MFA",
    outcome: "SUCCESS",
    resource: "POST /api/auth/mfa/verify-login",
    targetUserId: user.id,
    ipAddress,
    userAgent,
    details: check.usedRecoveryCode ? `Authenticated via single-use backup recovery code (session ${session.id}).` : `Authenticated via RFC 6238 TOTP code (session ${session.id}).`
  });
  return sendSuccess(res, {
    user: securityStore.toPublicUser(user),
    sessionId: session.id,
    usedRecoveryCode: check.usedRecoveryCode
  });
}
async function logout(req, res) {
  if (req.auth) {
    securityStore.revokeSessionById(req.auth.session.id, req.auth.user.id);
    securityStore.recordAudit({
      actorUserId: req.auth.user.id,
      actorEmail: req.auth.user.email,
      actorRole: req.auth.role.key,
      action: "LOGOUT",
      outcome: "SUCCESS",
      resource: "POST /api/auth/logout",
      targetUserId: req.auth.user.id,
      ipAddress: req.auth.ipAddress,
      userAgent: req.auth.userAgent,
      details: `Revoked session ${req.auth.session.id} on logout.`
    });
  }
  clearSessionCookie(res);
  return sendSuccess(res, { message: "Signed out successfully." });
}
async function getMe(req, res) {
  if (!req.auth) {
    throw new AuthenticationError("Not authenticated.");
  }
  const mfa = securityStore.getMfaStatus(req.auth.user.id);
  return sendSuccess(res, {
    user: securityStore.toPublicUser(req.auth.user),
    sessionId: req.auth.session.id,
    sessionExpiresAt: req.auth.session.expiresAt,
    mfa
  });
}
async function forgotPassword(req, res) {
  const email = sanitizeNonEmptyString(req.body?.email, 120);
  if (!email || !isValidEmail(email)) {
    throw new ValidationError("Please provide a valid email address.");
  }
  const ipAddress = getClientIp(req);
  const userAgent = getUserAgent(req);
  const user = securityStore.findUserByIdentifier(email);
  let devPreviewToken;
  let expiresAt;
  if (user && user.status !== "deactivated") {
    const issued = securityStore.issuePasswordResetToken(user.id);
    expiresAt = issued.expiresAt;
    if (env.nodeEnv !== "production" && !env.smtp.configured) {
      devPreviewToken = issued.rawToken;
    }
    securityStore.recordAudit({
      actorUserId: user.id,
      actorEmail: user.email,
      actorRole: user.roleKey,
      action: "PASSWORD_RESET_REQUESTED",
      outcome: "SUCCESS",
      resource: "POST /api/auth/forgot-password",
      targetUserId: user.id,
      ipAddress,
      userAgent,
      details: `Issued single-use password reset token expiring at ${issued.expiresAt}.`
    });
  }
  return sendSuccess(res, {
    message: "If an account matches that email, password reset instructions have been issued.",
    deliveryMode: env.smtp.configured ? "smtp" : "development_preview",
    ...expiresAt ? { expiresAt } : {},
    ...devPreviewToken ? { devPreviewToken } : {}
  });
}
async function resetPassword(req, res) {
  const token = sanitizeNonEmptyString(req.body?.token, 200);
  const newPassword = typeof req.body?.newPassword === "string" ? req.body.newPassword : "";
  if (!token) {
    throw new ValidationError("Reset token is required.");
  }
  const passwordIssue = validatePasswordStrength(newPassword);
  if (passwordIssue) {
    throw new ValidationError(passwordIssue, { newPassword: passwordIssue });
  }
  const user = securityStore.consumePasswordResetToken(token);
  if (!user) {
    throw new AuthenticationError("Password reset token is invalid, expired, or already used.");
  }
  securityStore.updateUserPassword(user.id, hashPassword(newPassword));
  const revokedCount = securityStore.revokeAllUserSessions(user.id);
  clearSessionCookie(res);
  securityStore.recordAudit({
    actorUserId: user.id,
    actorEmail: user.email,
    actorRole: user.roleKey,
    action: "PASSWORD_RESET_COMPLETED",
    outcome: "SUCCESS",
    resource: "POST /api/auth/reset-password",
    targetUserId: user.id,
    ipAddress: getClientIp(req),
    userAgent: getUserAgent(req),
    details: `Password reset via single-use token; revoked ${revokedCount} active session(s).`
  });
  return sendSuccess(res, {
    message: "Password has been reset and all previous sessions were revoked. You may now sign in."
  });
}
async function verifyEmail(req, res) {
  const token = sanitizeNonEmptyString(req.body?.token, 200);
  if (!token) {
    throw new ValidationError("Verification token is required.");
  }
  const user = securityStore.consumeEmailVerificationToken(token);
  if (!user) {
    throw new AuthenticationError("Email verification token is invalid, expired, or already used.");
  }
  securityStore.recordAudit({
    actorUserId: user.id,
    actorEmail: user.email,
    actorRole: user.roleKey,
    action: "EMAIL_VERIFIED",
    outcome: "SUCCESS",
    resource: "POST /api/auth/verify-email",
    targetUserId: user.id,
    ipAddress: getClientIp(req),
    userAgent: getUserAgent(req),
    details: "Confirmed account email ownership via single-use verification token."
  });
  return sendSuccess(res, {
    message: "Email address verified successfully.",
    user: securityStore.toPublicUser(user)
  });
}
async function resendVerification(req, res) {
  const user = req.auth.user;
  if (user.emailVerified) {
    return sendSuccess(res, {
      message: "Your email address is already verified.",
      alreadyVerified: true
    });
  }
  const verification = securityStore.issueEmailVerificationToken(user.id);
  securityStore.recordAudit({
    actorUserId: user.id,
    actorEmail: user.email,
    actorRole: req.auth.role.key,
    action: "EMAIL_VERIFICATION_SENT",
    outcome: "SUCCESS",
    resource: "POST /api/auth/resend-verification",
    targetUserId: user.id,
    ipAddress: req.auth.ipAddress,
    userAgent: req.auth.userAgent,
    details: "Issued new email verification token."
  });
  return sendSuccess(res, {
    message: "A new email verification token has been issued.",
    expiresAt: verification.expiresAt,
    deliveryMode: env.smtp.configured ? "smtp" : "development_preview",
    ...env.nodeEnv !== "production" && !env.smtp.configured ? { devPreviewToken: verification.rawToken } : {}
  });
}
async function listSessions(req, res) {
  const sessions = securityStore.listUserSessions(req.auth.user.id).map((s) => ({
    id: s.id,
    ipAddress: s.ipAddress,
    userAgent: s.userAgent,
    createdAt: s.createdAt,
    lastActiveAt: s.lastActiveAt,
    expiresAt: s.expiresAt,
    isCurrent: s.id === req.auth.session.id
  }));
  return sendSuccess(res, { sessions });
}
async function revokeSession(req, res) {
  const sessionId = sanitizeNonEmptyString(req.params.sessionId, 80);
  if (!sessionId) {
    throw new ValidationError("Session ID is required.");
  }
  const revoked = securityStore.revokeSessionById(sessionId, req.auth.user.id);
  if (!revoked) {
    throw new AuthorizationError("Session not found or does not belong to your account.");
  }
  const revokedCurrent = sessionId === req.auth.session.id;
  if (revokedCurrent) {
    clearSessionCookie(res);
  }
  securityStore.recordAudit({
    actorUserId: req.auth.user.id,
    actorEmail: req.auth.user.email,
    actorRole: req.auth.role.key,
    action: "SESSION_REVOKED",
    outcome: "SUCCESS",
    resource: `DELETE /api/auth/sessions/${sessionId}`,
    targetUserId: req.auth.user.id,
    ipAddress: req.auth.ipAddress,
    userAgent: req.auth.userAgent,
    details: `Revoked active session ${sessionId}${revokedCurrent ? " (current session)" : ""}.`
  });
  return sendSuccess(res, {
    message: "Session revoked successfully.",
    revokedCurrent
  });
}
async function revokeOtherSessions(req, res) {
  const count = securityStore.revokeOtherSessions(req.auth.user.id, req.auth.session.id);
  securityStore.recordAudit({
    actorUserId: req.auth.user.id,
    actorEmail: req.auth.user.email,
    actorRole: req.auth.role.key,
    action: "SESSIONS_REVOKED_OTHERS",
    outcome: "SUCCESS",
    resource: "POST /api/auth/sessions/revoke-others",
    targetUserId: req.auth.user.id,
    ipAddress: req.auth.ipAddress,
    userAgent: req.auth.userAgent,
    details: `Revoked ${count} other active session(s).`
  });
  return sendSuccess(res, {
    message: `Revoked ${count} other active session(s).`,
    revokedCount: count
  });
}
async function updateProfile(req, res) {
  const fullName = req.body?.fullName !== void 0 ? sanitizeNonEmptyString(req.body.fullName, 100) : void 0;
  const phone = req.body?.phone !== void 0 ? sanitizeNonEmptyString(req.body.phone, 25) || "" : void 0;
  const department = req.body?.department !== void 0 ? String(req.body.department).slice(0, 100) : void 0;
  const organizationName = req.body?.organizationName !== void 0 ? String(req.body.organizationName).slice(0, 120) : void 0;
  if (fullName === null || fullName !== void 0 && fullName.length < 2) {
    throw new ValidationError("Full name must be at least 2 characters.");
  }
  const updated = securityStore.updateUserProfile(req.auth.user.id, {
    fullName: fullName ?? void 0,
    phone,
    department,
    organizationName
  });
  securityStore.recordAudit({
    actorUserId: req.auth.user.id,
    actorEmail: req.auth.user.email,
    actorRole: req.auth.role.key,
    action: "PROFILE_UPDATED",
    outcome: "SUCCESS",
    resource: "PATCH /api/auth/profile",
    targetUserId: req.auth.user.id,
    ipAddress: req.auth.ipAddress,
    userAgent: req.auth.userAgent,
    details: "Updated personal profile details."
  });
  return sendSuccess(res, {
    message: "Profile updated successfully.",
    user: securityStore.toPublicUser(updated)
  });
}
async function changePassword(req, res) {
  const currentPassword = typeof req.body?.currentPassword === "string" ? req.body.currentPassword : "";
  const newPassword = typeof req.body?.newPassword === "string" ? req.body.newPassword : "";
  if (!currentPassword) {
    throw new ValidationError("Current password is required.");
  }
  const passwordIssue = validatePasswordStrength(newPassword);
  if (passwordIssue) {
    throw new ValidationError(passwordIssue, { newPassword: passwordIssue });
  }
  const user = req.auth.user;
  if (!verifyPassword(currentPassword, user.passwordHash)) {
    throw new AuthenticationError("Current password is incorrect.");
  }
  securityStore.updateUserPassword(user.id, hashPassword(newPassword));
  const revokedCount = securityStore.revokeOtherSessions(user.id, req.auth.session.id);
  securityStore.recordAudit({
    actorUserId: user.id,
    actorEmail: user.email,
    actorRole: req.auth.role.key,
    action: "PASSWORD_CHANGED",
    outcome: "SUCCESS",
    resource: "POST /api/auth/change-password",
    targetUserId: user.id,
    ipAddress: req.auth.ipAddress,
    userAgent: req.auth.userAgent,
    details: `Changed account password and revoked ${revokedCount} other session(s).`
  });
  return sendSuccess(res, {
    message: "Password updated successfully. All other active sessions have been revoked.",
    revokedOtherSessions: revokedCount
  });
}
async function setupMfa(req, res) {
  const user = req.auth.user;
  const { secret } = securityStore.beginMfaEnrollment(user.id);
  const otpauthUri = buildOtpAuthUri(user.email, secret, "BloodConnect");
  return sendSuccess(res, {
    secret,
    otpauthUri,
    issuer: "BloodConnect",
    account: user.email,
    message: "Add this secret to your authenticator app and confirm with a 6-digit TOTP code."
  });
}
async function confirmMfa(req, res) {
  const code = sanitizeNonEmptyString(req.body?.code, 12);
  if (!code) {
    throw new ValidationError("6-digit authenticator code is required.");
  }
  const user = req.auth.user;
  const result = securityStore.confirmMfaEnrollment(user.id, code);
  if (!result.success) {
    throw new AuthenticationError("Invalid 6-digit verification code. Ensure your device clock is synced.");
  }
  securityStore.recordAudit({
    actorUserId: user.id,
    actorEmail: user.email,
    actorRole: req.auth.role.key,
    action: "MFA_ENABLED",
    outcome: "SUCCESS",
    resource: "POST /api/auth/mfa/confirm",
    targetUserId: user.id,
    ipAddress: req.auth.ipAddress,
    userAgent: req.auth.userAgent,
    details: "Enabled RFC 6238 TOTP Multi-Factor Authentication and issued 8 backup recovery codes."
  });
  return sendSuccess(res, {
    message: "Multi-Factor Authentication is now enabled. Store your backup recovery codes securely.",
    recoveryCodes: result.recoveryCodes,
    user: securityStore.toPublicUser(user)
  });
}
async function disableMfa(req, res) {
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  const code = sanitizeNonEmptyString(req.body?.code, 24);
  if (!password || !code) {
    throw new ValidationError("Current password and an authenticator or recovery code are required.");
  }
  const user = req.auth.user;
  if (!verifyPassword(password, user.passwordHash)) {
    throw new AuthenticationError("Current password is incorrect.");
  }
  const check = securityStore.verifyUserMfaCode(user.id, code);
  if (!check.verified) {
    throw new AuthenticationError("Invalid authenticator code or backup recovery code.");
  }
  securityStore.disableMfa(user.id);
  securityStore.recordAudit({
    actorUserId: user.id,
    actorEmail: user.email,
    actorRole: req.auth.role.key,
    action: "MFA_DISABLED",
    outcome: "WARNING",
    resource: "POST /api/auth/mfa/disable",
    targetUserId: user.id,
    ipAddress: req.auth.ipAddress,
    userAgent: req.auth.userAgent,
    details: "Disabled TOTP Multi-Factor Authentication on account."
  });
  return sendSuccess(res, {
    message: "Multi-Factor Authentication has been disabled.",
    user: securityStore.toPublicUser(user)
  });
}

// server/routes/auth.routes.ts
var router2 = Router2();
router2.post("/register", asyncHandler(register));
router2.post("/login", asyncHandler(login));
router2.post("/mfa/verify-login", asyncHandler(verifyMfaLogin));
router2.post("/logout", asyncHandler(logout));
router2.post("/forgot-password", asyncHandler(forgotPassword));
router2.post("/reset-password", asyncHandler(resetPassword));
router2.post("/verify-email", asyncHandler(verifyEmail));
router2.get("/me", requireAuth, asyncHandler(getMe));
router2.post("/resend-verification", requireAuth, asyncHandler(resendVerification));
router2.patch("/profile", requirePermission("profile:update_own"), asyncHandler(updateProfile));
router2.post("/change-password", requirePermission("profile:update_own"), asyncHandler(changePassword));
router2.get("/sessions", requirePermission("sessions:manage_own"), asyncHandler(listSessions));
router2.delete("/sessions/:sessionId", requirePermission("sessions:manage_own"), asyncHandler(revokeSession));
router2.post("/sessions/revoke-others", requirePermission("sessions:manage_own"), asyncHandler(revokeOtherSessions));
router2.post("/mfa/setup", requirePermission("mfa:manage_own"), asyncHandler(setupMfa));
router2.post("/mfa/confirm", requirePermission("mfa:manage_own"), asyncHandler(confirmMfa));
router2.post("/mfa/disable", requirePermission("mfa:manage_own"), asyncHandler(disableMfa));
var auth_routes_default = router2;

// server/routes/rbac.routes.ts
import { Router as Router3 } from "express";

// server/controllers/rbac.controller.ts
var VALID_PORTAL_SCOPES = ["donor", "hospital", "staff", "admin"];
var VALID_STATUSES = [
  "active",
  "pending_verification",
  "suspended",
  "deactivated"
];
function isSuperAdmin(req) {
  return req.auth?.role.key === "super_admin";
}
async function listRoles(_req, res) {
  const users = securityStore.listUsers();
  const counts = /* @__PURE__ */ new Map();
  for (const u of users) {
    counts.set(u.roleKey, (counts.get(u.roleKey) ?? 0) + 1);
  }
  const roles = securityStore.getRoles().map((r) => ({
    ...r,
    userCount: counts.get(r.key) ?? 0
  }));
  return sendSuccess(res, { roles });
}
async function listPermissions(_req, res) {
  return sendSuccess(res, { permissions: PERMISSIONS_CATALOG });
}
async function createCustomRole(req, res) {
  const caller = req.auth;
  const rawKey = sanitizeNonEmptyString(req.body?.key, 48);
  const name = sanitizeNonEmptyString(req.body?.name, 80);
  const description = sanitizeNonEmptyString(req.body?.description, 220) || "Custom organizational role";
  const authorityRank = Number.parseInt(String(req.body?.authorityRank ?? "20"), 10);
  const portalScope = req.body?.portalScope;
  const permissionsInput = Array.isArray(req.body?.permissions) ? req.body.permissions : [];
  if (!rawKey || !/^[a-z][a-z0-9_]{2,40}$/.test(rawKey)) {
    throw new ValidationError(
      "Role key must be 3-40 lowercase characters (letters, digits, underscores, starting with a letter)."
    );
  }
  if (!name) {
    throw new ValidationError("Role display name is required.");
  }
  if (!Number.isFinite(authorityRank) || authorityRank < 1 || authorityRank > 99) {
    throw new ValidationError("Authority rank for custom roles must be between 1 and 99.");
  }
  if (!VALID_PORTAL_SCOPES.includes(portalScope)) {
    throw new ValidationError("Valid portal scope (donor, hospital, staff, admin) is required.");
  }
  if (securityStore.getRoleByKey(rawKey)) {
    throw new ConflictError(`Role key '${rawKey}' already exists.`);
  }
  if (!isSuperAdmin(req) && authorityRank >= caller.role.authorityRank) {
    securityStore.recordAudit({
      actorUserId: caller.user.id,
      actorEmail: caller.user.email,
      actorRole: caller.role.key,
      action: "PRIVILEGE_ESCALATION_BLOCKED",
      outcome: "BLOCKED",
      resource: "POST /api/rbac/roles",
      ipAddress: caller.ipAddress,
      userAgent: caller.userAgent,
      details: `Blocked creation of role '${rawKey}' with rank ${authorityRank} >= caller rank ${caller.role.authorityRank}.`
    });
    throw new AuthorizationError("Cannot create a role with authority rank equal to or higher than your own.");
  }
  const requestedPermissions = permissionsInput.map((p) => String(p)).filter((p) => VALID_PERMISSION_KEYS.has(p));
  if (!isSuperAdmin(req)) {
    const unauthorizedPerm = requestedPermissions.find((p) => !caller.permissions.has(p));
    if (unauthorizedPerm) {
      securityStore.recordAudit({
        actorUserId: caller.user.id,
        actorEmail: caller.user.email,
        actorRole: caller.role.key,
        action: "PRIVILEGE_ESCALATION_BLOCKED",
        outcome: "BLOCKED",
        resource: "POST /api/rbac/roles",
        ipAddress: caller.ipAddress,
        userAgent: caller.userAgent,
        details: `Blocked granting unowned permission '${unauthorizedPerm}' to new role '${rawKey}'.`
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
    permissions: requestedPermissions
  });
  securityStore.recordAudit({
    actorUserId: caller.user.id,
    actorEmail: caller.user.email,
    actorRole: caller.role.key,
    action: "ROLE_CREATED",
    outcome: "SUCCESS",
    resource: `POST /api/rbac/roles/${created.key}`,
    ipAddress: caller.ipAddress,
    userAgent: caller.userAgent,
    details: `Created custom role '${created.name}' (${created.key}, rank ${created.authorityRank}) with ${created.permissions.length} permission(s).`
  });
  return sendCreated(res, { role: created });
}
async function updateRolePermissions(req, res) {
  const caller = req.auth;
  const roleKey = sanitizeNonEmptyString(req.params.roleKey, 50);
  const permissionsInput = req.body?.permissions;
  if (!roleKey || !Array.isArray(permissionsInput)) {
    throw new ValidationError("Role key and permissions array are required.");
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
      action: "PRIVILEGE_ESCALATION_BLOCKED",
      outcome: "BLOCKED",
      resource: `PUT /api/rbac/roles/${roleKey}/permissions`,
      ipAddress: caller.ipAddress,
      userAgent: caller.userAgent,
      details: `Blocked modifying permissions of equal/higher-rank role '${roleKey}'.`
    });
    throw new AuthorizationError("Cannot modify permissions of a role at or above your authority rank.");
  }
  const requestedPermissions = permissionsInput.map((p) => String(p)).filter((p) => VALID_PERMISSION_KEYS.has(p));
  if (!isSuperAdmin(req)) {
    const unauthorizedPerm = requestedPermissions.find((p) => !caller.permissions.has(p));
    if (unauthorizedPerm) {
      securityStore.recordAudit({
        actorUserId: caller.user.id,
        actorEmail: caller.user.email,
        actorRole: caller.role.key,
        action: "PRIVILEGE_ESCALATION_BLOCKED",
        outcome: "BLOCKED",
        resource: `PUT /api/rbac/roles/${roleKey}/permissions`,
        ipAddress: caller.ipAddress,
        userAgent: caller.userAgent,
        details: `Blocked granting unowned permission '${unauthorizedPerm}' to role '${roleKey}'.`
      });
      throw new AuthorizationError(`Cannot grant permission '${unauthorizedPerm}' that your own role does not hold.`);
    }
  }
  const updated = securityStore.updateRolePermissions(roleKey, requestedPermissions);
  securityStore.recordAudit({
    actorUserId: caller.user.id,
    actorEmail: caller.user.email,
    actorRole: caller.role.key,
    action: "PERMISSIONS_UPDATED",
    outcome: "SUCCESS",
    resource: `PUT /api/rbac/roles/${roleKey}/permissions`,
    ipAddress: caller.ipAddress,
    userAgent: caller.userAgent,
    details: `Updated permissions for '${roleKey}' (${updated.permissions.length} active permissions).`
  });
  return sendSuccess(res, {
    message: `Permissions updated for role '${updated.name}'. Changes take effect immediately.`,
    role: updated
  });
}
async function listUsers(_req, res) {
  const users = securityStore.listUsers().map((u) => securityStore.toPublicUser(u));
  return sendSuccess(res, { users });
}
async function getUserById(req, res) {
  const userId = Number.parseInt(req.params.userId, 10);
  if (!Number.isFinite(userId)) {
    throw new ValidationError("Invalid user ID.");
  }
  const user = securityStore.findUserById(userId);
  if (!user) {
    throw new NotFoundError("User account not found.");
  }
  return sendSuccess(res, {
    user: securityStore.toPublicUser(user),
    activeSessionCount: securityStore.listUserSessions(user.id).length
  });
}
async function adminCreateUser(req, res) {
  const caller = req.auth;
  const email = sanitizeNonEmptyString(req.body?.email, 120);
  const fullName = sanitizeNonEmptyString(req.body?.fullName, 100);
  const phone = sanitizeNonEmptyString(req.body?.phone, 25) || "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  const roleKey = sanitizeNonEmptyString(req.body?.roleKey, 50) || "regular_user";
  const department = sanitizeNonEmptyString(req.body?.department, 100) || void 0;
  const organizationName = sanitizeNonEmptyString(req.body?.organizationName, 120) || void 0;
  if (!email || !isValidEmail(email)) {
    throw new ValidationError("A valid email address is required.");
  }
  if (!fullName) {
    throw new ValidationError("Full name is required.");
  }
  const passwordIssue = validatePasswordStrength(password);
  if (passwordIssue) {
    throw new ValidationError(passwordIssue);
  }
  const targetRole = securityStore.getRoleByKey(roleKey);
  if (!targetRole || targetRole.key === "guest") {
    throw new ValidationError("A valid assignable role is required.");
  }
  if (!isSuperAdmin(req) && targetRole.authorityRank >= caller.role.authorityRank) {
    securityStore.recordAudit({
      actorUserId: caller.user.id,
      actorEmail: caller.user.email,
      actorRole: caller.role.key,
      action: "PRIVILEGE_ESCALATION_BLOCKED",
      outcome: "BLOCKED",
      resource: "POST /api/rbac/users",
      ipAddress: caller.ipAddress,
      userAgent: caller.userAgent,
      details: `Blocked creating user with equal/higher role '${targetRole.key}'.`
    });
    throw new AuthorizationError("Cannot provision a user with an authority rank equal to or above your own.");
  }
  const username = `${roleKey.slice(0, 6)}_${fullName.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 10)}_${Date.now().toString().slice(-4)}`;
  if (securityStore.userExists(email, username)) {
    throw new ConflictError("A user with this email already exists.");
  }
  const created = securityStore.createUser({
    username,
    email: email.toLowerCase(),
    passwordHash: hashPassword(password),
    fullName,
    phone,
    roleKey: targetRole.key,
    status: "active",
    emailVerified: true,
    department,
    organizationName
  });
  securityStore.recordAudit({
    actorUserId: caller.user.id,
    actorEmail: caller.user.email,
    actorRole: caller.role.key,
    action: "USER_PROVISIONED",
    outcome: "SUCCESS",
    resource: "POST /api/rbac/users",
    targetUserId: created.id,
    ipAddress: caller.ipAddress,
    userAgent: caller.userAgent,
    details: `Provisioned user ${created.email} with role '${targetRole.key}'.`
  });
  return sendCreated(res, { user: securityStore.toPublicUser(created) });
}
async function assignUserRole(req, res) {
  const caller = req.auth;
  const targetUserId = Number.parseInt(req.params.userId, 10);
  const newRoleKey = sanitizeNonEmptyString(req.body?.roleKey, 50);
  if (!Number.isFinite(targetUserId) || !newRoleKey) {
    throw new ValidationError("Valid userId and roleKey are required.");
  }
  const targetUser = securityStore.findUserById(targetUserId);
  if (!targetUser) {
    throw new NotFoundError("Target user not found.");
  }
  const targetCurrentRole = securityStore.getRoleByKey(targetUser.roleKey);
  const nextRole = securityStore.getRoleByKey(newRoleKey);
  if (!nextRole || nextRole.key === "guest") {
    throw new ValidationError("Invalid or non-assignable role key.");
  }
  if (targetUser.id === caller.user.id) {
    securityStore.recordAudit({
      actorUserId: caller.user.id,
      actorEmail: caller.user.email,
      actorRole: caller.role.key,
      action: "PRIVILEGE_ESCALATION_BLOCKED",
      outcome: "BLOCKED",
      resource: `PATCH /api/rbac/users/${targetUserId}/role`,
      targetUserId,
      ipAddress: caller.ipAddress,
      userAgent: caller.userAgent,
      details: `Blocked self role modification attempt to '${newRoleKey}'.`
    });
    throw new AuthorizationError("You cannot modify your own role assignment.");
  }
  if (!isSuperAdmin(req)) {
    const currentRank = targetCurrentRole?.authorityRank ?? 0;
    if (currentRank >= caller.role.authorityRank || nextRole.authorityRank >= caller.role.authorityRank) {
      securityStore.recordAudit({
        actorUserId: caller.user.id,
        actorEmail: caller.user.email,
        actorRole: caller.role.key,
        action: "PRIVILEGE_ESCALATION_BLOCKED",
        outcome: "BLOCKED",
        resource: `PATCH /api/rbac/users/${targetUserId}/role`,
        targetUserId,
        ipAddress: caller.ipAddress,
        userAgent: caller.userAgent,
        details: `Blocked role change on user #${targetUserId} (${targetUser.roleKey} -> ${newRoleKey}) by '${caller.role.key}' (rank ${caller.role.authorityRank}).`
      });
      throw new AuthorizationError(
        "Privilege escalation blocked: you may only assign roles strictly below your own authority rank and cannot modify equal or higher-ranked users."
      );
    }
  }
  const previousRole = targetUser.roleKey;
  const updated = securityStore.updateUserRole(targetUser.id, nextRole.key);
  securityStore.recordAudit({
    actorUserId: caller.user.id,
    actorEmail: caller.user.email,
    actorRole: caller.role.key,
    action: "ROLE_CHANGED",
    outcome: "SUCCESS",
    resource: `PATCH /api/rbac/users/${targetUserId}/role`,
    targetUserId: targetUser.id,
    ipAddress: caller.ipAddress,
    userAgent: caller.userAgent,
    details: `Changed role of ${targetUser.email} from '${previousRole}' to '${nextRole.key}'.`
  });
  return sendSuccess(res, {
    message: `Assigned '${nextRole.name}' role to ${targetUser.fullName}.`,
    user: securityStore.toPublicUser(updated)
  });
}
async function updateUserStatus(req, res) {
  const caller = req.auth;
  const targetUserId = Number.parseInt(req.params.userId, 10);
  const status = req.body?.status;
  if (!Number.isFinite(targetUserId) || !VALID_STATUSES.includes(status)) {
    throw new ValidationError("Valid userId and status (active, pending_verification, suspended, deactivated) are required.");
  }
  const targetUser = securityStore.findUserById(targetUserId);
  if (!targetUser) {
    throw new NotFoundError("Target user not found.");
  }
  if (targetUser.id === caller.user.id) {
    throw new AuthorizationError("You cannot suspend or deactivate your own active account.");
  }
  const targetRole = securityStore.getRoleByKey(targetUser.roleKey);
  if (!isSuperAdmin(req) && (targetRole?.authorityRank ?? 0) >= caller.role.authorityRank) {
    securityStore.recordAudit({
      actorUserId: caller.user.id,
      actorEmail: caller.user.email,
      actorRole: caller.role.key,
      action: "PRIVILEGE_ESCALATION_BLOCKED",
      outcome: "BLOCKED",
      resource: `PATCH /api/rbac/users/${targetUserId}/status`,
      targetUserId,
      ipAddress: caller.ipAddress,
      userAgent: caller.userAgent,
      details: `Blocked status change (${status}) against equal/higher-rank account ${targetUser.email}.`
    });
    throw new AuthorizationError("Cannot change the status of an account with equal or higher authority rank.");
  }
  const previousStatus = targetUser.status;
  const updated = securityStore.updateUserStatus(targetUser.id, status);
  securityStore.recordAudit({
    actorUserId: caller.user.id,
    actorEmail: caller.user.email,
    actorRole: caller.role.key,
    action: "ACCOUNT_STATUS_CHANGED",
    outcome: status === "suspended" || status === "deactivated" ? "WARNING" : "SUCCESS",
    resource: `PATCH /api/rbac/users/${targetUserId}/status`,
    targetUserId: targetUser.id,
    ipAddress: caller.ipAddress,
    userAgent: caller.userAgent,
    details: `Changed account status of ${targetUser.email} from '${previousStatus}' to '${status}'${status === "suspended" || status === "deactivated" ? " (all active sessions revoked)" : ""}.`
  });
  return sendSuccess(res, {
    message: `Account status updated to '${status}'.`,
    user: securityStore.toPublicUser(updated)
  });
}
async function listSecurityAuditLogs(req, res) {
  const outcomeRaw = typeof req.query.outcome === "string" ? req.query.outcome.toUpperCase() : void 0;
  const outcome = outcomeRaw === "SUCCESS" || outcomeRaw === "DENIED" || outcomeRaw === "BLOCKED" || outcomeRaw === "WARNING" ? outcomeRaw : void 0;
  const action = typeof req.query.action === "string" ? req.query.action : void 0;
  const limit = req.query.limit ? Number.parseInt(String(req.query.limit), 10) : 120;
  const logs = securityStore.listAuditLogs({ outcome, action, limit });
  return sendSuccess(res, { logs });
}

// server/routes/rbac.routes.ts
var router3 = Router3();
router3.get("/roles", requirePermission("roles:read"), asyncHandler(listRoles));
router3.get("/permissions", requirePermission("roles:read"), asyncHandler(listPermissions));
router3.post("/roles", requirePermission("roles:manage"), asyncHandler(createCustomRole));
router3.put(
  "/roles/:roleKey/permissions",
  requirePermission("roles:manage"),
  asyncHandler(updateRolePermissions)
);
router3.get("/users", requirePermission("users:read"), asyncHandler(listUsers));
router3.post("/users", requirePermission("users:create"), asyncHandler(adminCreateUser));
router3.get(
  "/users/:userId",
  requireSelfOrPermission((req) => {
    const id = Number.parseInt(req.params.userId, 10);
    return Number.isFinite(id) ? id : null;
  }, "users:read"),
  asyncHandler(getUserById)
);
router3.patch(
  "/users/:userId/role",
  requirePermission("users:assign_role"),
  asyncHandler(assignUserRole)
);
router3.patch(
  "/users/:userId/status",
  requirePermission("users:manage_status"),
  asyncHandler(updateUserStatus)
);
router3.get("/audit-logs", requirePermission("audit:read"), asyncHandler(listSecurityAuditLogs));
var rbac_routes_default = router3;

// server/routes/donor.routes.ts
import { Router as Router4 } from "express";

// server/controllers/donor.controller.ts
async function getDonors(req, res) {
  const page = parsePositiveInt(req.query.page, 1, 1e4);
  const limit = parsePositiveInt(req.query.limit, 20, 100);
  const bloodGroup = typeof req.query.bloodGroup === "string" ? req.query.bloodGroup : void 0;
  const city = typeof req.query.city === "string" ? req.query.city : void 0;
  if (bloodGroup && bloodGroup !== "all" && bloodGroup !== "ALL" && !isValidBloodGroup(bloodGroup)) {
    throw new ValidationError("Invalid blood group filter");
  }
  try {
    const data = await listDonors({ page, limit, bloodGroup, city });
    return sendSuccess(res, { source: "mysql", ...data });
  } catch (err) {
    if (isDatabaseOfflineError(err)) {
      return sendSuccess(res, {
        source: "fallback",
        message: "MySQL is offline; frontend databaseStore is active.",
        donors: []
      });
    }
    throw err;
  }
}
async function createDonor(req, res) {
  const body = req.body || {};
  const bloodGroup = body.bloodGroup || body.blood_group;
  if (bloodGroup && !isValidBloodGroup(bloodGroup)) {
    throw new ValidationError("Invalid blood group");
  }
  try {
    const result = await upsertDonor(body);
    return sendCreated(res, {
      source: "mysql",
      message: "Donor registered in live MySQL database",
      result
    });
  } catch (err) {
    if (isDatabaseOfflineError(err)) {
      return sendSuccess(res, {
        source: "fallback",
        message: "Donor saved locally; will sync when MySQL is connected."
      });
    }
    throw err;
  }
}
async function updateDonor(req, res) {
  const id = req.params.id;
  if (!id) {
    throw new ValidationError("Donor ID or code is required");
  }
  try {
    const result = await updateDonorByIdOrCode(id, req.body || {});
    return sendSuccess(res, { source: "mysql", result });
  } catch (err) {
    if (isDatabaseOfflineError(err)) {
      return sendSuccess(res, {
        source: "fallback",
        message: "Donor updated locally; MySQL offline."
      });
    }
    throw err;
  }
}

// server/routes/donor.routes.ts
var router4 = Router4();
router4.get("/", requirePermission("donors:read"), asyncHandler(getDonors));
router4.post("/", requirePermission("donors:create"), asyncHandler(createDonor));
router4.put("/:id", requirePermission("donors:update"), asyncHandler(updateDonor));
var donor_routes_default = router4;

// server/routes/bloodUnit.routes.ts
import { Router as Router5 } from "express";

// server/controllers/bloodUnit.controller.ts
async function getBloodUnits(req, res) {
  const status = typeof req.query.status === "string" ? req.query.status : void 0;
  try {
    const units = await listBloodUnits(status);
    return sendSuccess(res, { source: "mysql", units });
  } catch (err) {
    if (isDatabaseOfflineError(err)) {
      return sendSuccess(res, { source: "fallback", units: [] });
    }
    throw err;
  }
}
async function createBloodUnit(req, res) {
  const body = req.body || {};
  const bloodGroup = body.bloodGroup || body.blood_group;
  if (bloodGroup && !isValidBloodGroup(bloodGroup)) {
    throw new ValidationError("Invalid blood group for blood unit");
  }
  try {
    const result = await upsertBloodUnit(body);
    return sendCreated(res, {
      source: "mysql",
      message: "Blood unit added to live MySQL inventory",
      result
    });
  } catch (err) {
    if (isDatabaseOfflineError(err)) {
      return sendSuccess(res, { source: "fallback" });
    }
    throw err;
  }
}

// server/routes/bloodUnit.routes.ts
var router5 = Router5();
router5.get("/", asyncHandler(getBloodUnits));
router5.post("/", requirePermission("inventory:manage"), asyncHandler(createBloodUnit));
var bloodUnit_routes_default = router5;

// server/routes/request.routes.ts
import { Router as Router6 } from "express";

// server/controllers/request.controller.ts
async function getBloodRequests(_req, res) {
  try {
    const requests = await listBloodRequests();
    return sendSuccess(res, { source: "mysql", requests });
  } catch (err) {
    if (isDatabaseOfflineError(err)) {
      return sendSuccess(res, { source: "fallback", requests: [] });
    }
    throw err;
  }
}
async function createBloodRequest(req, res) {
  const body = req.body || {};
  const bloodGroup = body.bloodGroup || body.blood_group;
  if (bloodGroup && !isValidBloodGroup(bloodGroup)) {
    throw new ValidationError("Invalid blood group in blood request");
  }
  const units = Number(body.unitsRequired ?? body.units_needed ?? 1);
  if (!Number.isFinite(units) || units < 1 || units > 50) {
    throw new ValidationError("Units required must be between 1 and 50");
  }
  try {
    const result = await upsertBloodRequest(body);
    return sendCreated(res, {
      source: "mysql",
      message: "Blood request registered live in MySQL database",
      result
    });
  } catch (err) {
    if (isDatabaseOfflineError(err)) {
      return sendSuccess(res, { source: "fallback" });
    }
    throw err;
  }
}
async function patchBloodRequestStatus(req, res) {
  const id = req.params.id;
  const { status, note } = req.body || {};
  if (!id) {
    throw new ValidationError("Request ID or code is required");
  }
  if (!status || !VALID_REQUEST_STATUSES.includes(status)) {
    throw new ValidationError("Invalid blood request status");
  }
  try {
    const result = await updateBloodRequestStatus(id, status, typeof note === "string" ? note : void 0);
    return sendSuccess(res, {
      source: "mysql",
      message: `Request status updated to ${status} in MySQL`,
      result
    });
  } catch (err) {
    if (isDatabaseOfflineError(err)) {
      return sendSuccess(res, { source: "fallback" });
    }
    throw err;
  }
}

// server/routes/request.routes.ts
var router6 = Router6();
router6.get("/", requirePermission("requests:read"), asyncHandler(getBloodRequests));
router6.post("/", asyncHandler(createBloodRequest));
router6.patch("/:id", requirePermission("requests:approve"), asyncHandler(patchBloodRequestStatus));
var request_routes_default = router6;

// server/routes/camp.routes.ts
import { Router as Router7 } from "express";

// server/controllers/camp.controller.ts
async function getCamps(_req, res) {
  try {
    const camps = await listCamps();
    return sendSuccess(res, { source: "mysql", camps });
  } catch (err) {
    if (isDatabaseOfflineError(err)) {
      return sendSuccess(res, { source: "fallback", camps: [] });
    }
    throw err;
  }
}
async function createCamp(req, res) {
  const body = req.body || {};
  if (!body.name || typeof body.name !== "string") {
    throw new ValidationError("Camp name is required");
  }
  try {
    const result = await upsertCamp(body);
    return sendCreated(res, { source: "mysql", result });
  } catch (err) {
    if (isDatabaseOfflineError(err)) {
      return sendSuccess(res, { source: "fallback" });
    }
    throw err;
  }
}
async function registerForCamp(req, res) {
  const campId = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(campId) || campId < 1) {
    throw new ValidationError("Valid numeric camp ID is required");
  }
  const { donor, timeSlot } = req.body || {};
  try {
    const result = await registerCampDonor(campId, donor || {}, timeSlot || "10:00 AM");
    return sendSuccess(res, {
      source: "mysql",
      message: "Registered in live MySQL database",
      result
    });
  } catch (err) {
    if (isDatabaseOfflineError(err)) {
      return sendSuccess(res, { source: "fallback" });
    }
    throw err;
  }
}

// server/routes/camp.routes.ts
var router7 = Router7();
router7.get("/", asyncHandler(getCamps));
router7.post("/", requirePermission("camps:manage"), asyncHandler(createCamp));
router7.post("/:id/register", requirePermission("camps:register"), asyncHandler(registerForCamp));
var camp_routes_default = router7;

// server/routes/appointment.routes.ts
import { Router as Router8 } from "express";

// server/controllers/appointment.controller.ts
async function getAppointments(req, res) {
  const auth = req.auth;
  const canReadAll = auth.permissions.has("appointments:read_all");
  const donorIdRaw = req.query.donorId ? Number.parseInt(String(req.query.donorId), 10) : void 0;
  const requestedDonorId = donorIdRaw && Number.isFinite(donorIdRaw) ? donorIdRaw : void 0;
  const ownDonorId = auth.user.donorId ?? auth.user.id;
  if (!canReadAll && requestedDonorId !== void 0 && requestedDonorId !== ownDonorId) {
    throw new AuthorizationError("You may only view your own donation appointments.");
  }
  const effectiveDonorId = canReadAll ? requestedDonorId : ownDonorId;
  try {
    const appointments = await listAppointments(effectiveDonorId);
    return sendSuccess(res, { source: "mysql", appointments });
  } catch (err) {
    if (isDatabaseOfflineError(err)) {
      return sendSuccess(res, { source: "fallback", appointments: [] });
    }
    throw err;
  }
}
async function createAppointment(req, res) {
  const body = req.body || {};
  const bloodGroup = body.bloodGroup || body.blood_group;
  if (bloodGroup && !isValidBloodGroup(bloodGroup)) {
    throw new ValidationError("Invalid blood group for appointment");
  }
  if (!body.appointmentDate && !body.appointment_date) {
    throw new ValidationError("Appointment date is required");
  }
  try {
    const result = await upsertAppointment(body);
    return sendCreated(res, {
      source: "mysql",
      message: "Donation appointment saved in live MySQL database",
      result
    });
  } catch (err) {
    if (isDatabaseOfflineError(err)) {
      return sendSuccess(res, { source: "fallback" });
    }
    throw err;
  }
}
async function patchAppointment(req, res) {
  const id = req.params.id;
  if (!id) {
    throw new ValidationError("Appointment ID or code is required");
  }
  const { status, appointmentDate, timeSlot } = req.body || {};
  if (status && !VALID_APPOINTMENT_STATUSES.includes(status)) {
    throw new ValidationError("Invalid appointment status");
  }
  try {
    const result = await updateAppointmentByIdOrCode(id, {
      status,
      appointmentDate,
      timeSlot
    });
    return sendSuccess(res, {
      source: "mysql",
      message: "Appointment updated in MySQL database",
      result
    });
  } catch (err) {
    if (isDatabaseOfflineError(err)) {
      return sendSuccess(res, { source: "fallback" });
    }
    throw err;
  }
}

// server/routes/appointment.routes.ts
var router8 = Router8();
router8.get(
  "/",
  requireAnyPermission(["appointments:read_all", "appointments:read_own"]),
  asyncHandler(getAppointments)
);
router8.post("/", requireAuth, asyncHandler(createAppointment));
router8.patch(
  "/:id",
  requireAnyPermission(["appointments:manage", "appointments:read_own"]),
  asyncHandler(patchAppointment)
);
var appointment_routes_default = router8;

// server/routes/ai.routes.ts
import { Router as Router9 } from "express";

// server/controllers/ai.controller.ts
import { ThinkingLevel, Type } from "@google/genai";

// server/utils/geminiClient.ts
import { GoogleGenAI } from "@google/genai";
var cachedClient = null;
var cachedKeySignature = "";
function getGeminiClient() {
  const apiKey = (process.env.GEMINI_API_KEY || "").trim();
  if (!apiKey) {
    throw new AppError(
      "AI service is not configured. Please verify GEMINI_API_KEY in Settings > Secrets.",
      503,
      "AI_KEY_MISSING"
    );
  }
  if (!cachedClient || cachedKeySignature !== apiKey) {
    cachedClient = new GoogleGenAI({
      apiKey,
      apiVersion: "v1beta",
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build"
        }
      }
    });
    cachedKeySignature = apiKey;
  }
  return cachedClient;
}
var aiRateBuckets = /* @__PURE__ */ new Map();
function assertAiRateLimit(ipKey, maxRequests = 24, windowMs = 6e4) {
  const now = Date.now();
  const windowStart = now - windowMs;
  const timestamps = (aiRateBuckets.get(ipKey) || []).filter((ts) => ts > windowStart);
  if (timestamps.length >= maxRequests) {
    const oldest = timestamps[0] ?? now;
    const retryAfterSec = Math.max(1, Math.ceil((oldest + windowMs - now) / 1e3));
    throw new RateLimitError(
      `AI request limit reached. Please wait ${retryAfterSec} seconds before trying again.`,
      retryAfterSec
    );
  }
  timestamps.push(now);
  aiRateBuckets.set(ipKey, timestamps);
  if (aiRateBuckets.size > 2e3) {
    for (const [key, list] of aiRateBuckets.entries()) {
      const recent = list.filter((ts) => ts > windowStart);
      if (recent.length === 0) aiRateBuckets.delete(key);
      else aiRateBuckets.set(key, recent);
    }
  }
}
function extractReadableErrorMessage(raw) {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const parsed = JSON.parse(trimmed);
      const inner = parsed.error?.message || parsed.message;
      if (typeof inner === "string" && inner.trim().length > 0) {
        return extractReadableErrorMessage(inner);
      }
    } catch {
    }
  }
  return trimmed;
}
function mapGeminiError(err) {
  if (err instanceof AppError) return err;
  const rawMessage = err instanceof Error ? err.message : String(err ?? "Unknown AI error");
  const cleanMessage = extractReadableErrorMessage(rawMessage);
  const upper = `${rawMessage} ${cleanMessage}`.toUpperCase();
  if (upper.includes("API_KEY_INVALID") || upper.includes("PERMISSION_DENIED") || upper.includes("403")) {
    return new AppError(
      "Unable to authenticate with the AI service. Please check your API key in Settings > Secrets.",
      403,
      "AI_AUTH_ERROR"
    );
  }
  if (upper.includes("RESOURCE_EXHAUSTED") || upper.includes("429") || upper.includes("QUOTA")) {
    return new AppError(
      "AI request quota has been temporarily reached. Please wait a moment or check your billing tier in Settings > Secrets.",
      429,
      "AI_QUOTA_EXCEEDED"
    );
  }
  if (upper.includes("UNAVAILABLE") || upper.includes("503") || upper.includes("HIGH DEMAND") || upper.includes("OVERLOADED")) {
    return new AppError(
      "The AI service is temporarily experiencing high demand. Please wait a few seconds and try again.",
      503,
      "AI_SERVICE_BUSY"
    );
  }
  if (upper.includes("NOT_FOUND") || upper.includes("404")) {
    return new AppError(
      "The requested AI model is currently unavailable. Please try again shortly.",
      502,
      "AI_MODEL_UNAVAILABLE"
    );
  }
  return new AppError(
    cleanMessage || "The AI service encountered an unexpected error. Please try again.",
    502,
    "AI_UPSTREAM_ERROR"
  );
}
async function withModelFallback(primaryModel, fallbackModel, operation, primaryTimeoutMs = 12e3) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), primaryTimeoutMs);
  try {
    return await operation(primaryModel, controller.signal);
  } catch (err) {
    const raw = (err instanceof Error ? err.message : String(err ?? "")).toUpperCase();
    const isTransient = controller.signal.aborted || raw.includes("UNAVAILABLE") || raw.includes("503") || raw.includes("HIGH DEMAND") || raw.includes("OVERLOADED") || raw.includes("ABORT") || raw.includes("TIMEOUT");
    if (!isTransient || primaryModel === fallbackModel) {
      throw err;
    }
    return await operation(fallbackModel);
  } finally {
    clearTimeout(timer);
  }
}

// server/controllers/ai.controller.ts
var TEXT_MODEL = "gemini-4-hydrogen";
var FALLBACK_TEXT_MODEL = "gemini-3.1-flash-lite";
var TTS_MODEL = "gemini-3.8-flash-lite-tts";
var TRANSCRIBE_MODEL = "gemini-3.5-transcribe";
var ALLOWED_IMAGE_MIMES = /* @__PURE__ */ new Set(["image/jpeg", "image/png", "image/webp"]);
var ALLOWED_AUDIO_MIMES = /* @__PURE__ */ new Set([
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/ogg",
  "audio/x-m4a"
]);
var MAX_BASE64_LENGTH = 55e5;
function getClientIp2(req) {
  return (req.ip || req.socket?.remoteAddress || "unknown").slice(0, 64);
}
async function streamTriageChat(req, res, next) {
  try {
    assertAiRateLimit(getClientIp2(req));
    const body = req.body;
    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      throw new ValidationError("At least one message is required.");
    }
    const sanitizedHistory = body.messages.slice(-12).map((turn) => ({
      role: turn.role === "model" ? "model" : "user",
      text: typeof turn.text === "string" ? turn.text.trim().slice(0, 1500) : ""
    })).filter((turn) => turn.text.length > 0);
    if (sanitizedHistory.length === 0) {
      throw new ValidationError("Message text cannot be empty.");
    }
    const ai = getGeminiClient();
    const stockLines = body.liveContext?.availableByGroup ? Object.entries(body.liveContext.availableByGroup).map(([bg, units]) => `${bg}: ${units} units`).join(", ") : "Live inventory context unavailable";
    const hospitalsContext = typeof body.liveContext?.hospitalsSummary === "string" ? body.liveContext.hospitalsSummary.slice(0, 1800) : "Mumbai Metropolitan accredited hospital vaults";
    const campsContext = typeof body.liveContext?.upcomingCampsSummary === "string" ? body.liveContext.upcomingCampsSummary.slice(0, 1e3) : "";
    const systemInstruction = [
      "You are the BloodConnect Clinical Care Desk Assistant for an accredited Mumbai/Maharashtra blood bank network.",
      "Your job is to help families in emergencies, blood donors, and hospital coordinators make fast, safe, clinically accurate decisions.",
      "Follow these strict rules:",
      "1. Ground your availability answers in the LIVE BLOODCONNECT NETWORK SNAPSHOT below. Never invent fake hospitals or phone numbers.",
      "2. Always include accurate ABO/Rh red-cell compatibility substitutes when a rare blood group (like O-, AB-, B-, A-) is discussed.",
      "3. Follow NBTC (National Blood Transfusion Council) India guidelines for donor eligibility (Age 18-65, weight >= 45kg, Hb >= 12.5 g/dL, 90-day male / 120-day female whole blood interval).",
      "4. Keep responses crisp, calm, scannable, and under 180 words with clear bullet points when listing steps.",
      "5. Include a brief 1-line clinical safety note reminding patients that final cross-match and medical clearance must be performed by the attending physician or blood bank medical officer.",
      "",
      `LIVE REGIONAL STOCK: ${stockLines}`,
      `CONNECTED HOSPITAL VAULTS: ${hospitalsContext}`,
      campsContext ? `UPCOMING DONATION CAMPS: ${campsContext}` : ""
    ].filter(Boolean).join("\n");
    const contents = sanitizedHistory.map((turn) => ({
      role: turn.role,
      parts: [{ text: turn.text }]
    }));
    const stream = await withModelFallback(
      TEXT_MODEL,
      FALLBACK_TEXT_MODEL,
      (model, abortSignal) => ai.models.generateContentStream({
        model,
        contents,
        config: {
          systemInstruction,
          abortSignal,
          ...model === TEXT_MODEL ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } : {}
        }
      }),
      8e3
    );
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();
    for await (const chunk of stream) {
      const piece = chunk.text;
      if (piece) {
        res.write(`data: ${JSON.stringify({ chunk: piece })}

`);
      }
    }
    res.write(`data: ${JSON.stringify({ done: true })}

`);
    res.end();
  } catch (err) {
    const mapped = mapGeminiError(err);
    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ error: mapped.message, code: mapped.code })}

`);
      res.end();
      return;
    }
    next(mapped);
  }
}
async function analyzeClinicalSlip(req, res, next) {
  try {
    assertAiRateLimit(getClientIp2(req), 12, 6e4);
    const body = req.body;
    const noteText = typeof body.clinicalNoteText === "string" ? body.clinicalNoteText.trim().slice(0, 2500) : "";
    const hasImage = typeof body.imageBase64 === "string" && body.imageBase64.trim().length > 0;
    if (!hasImage && !noteText) {
      throw new ValidationError("Upload a slip/report image or paste a clinical requisition note.");
    }
    const parts = [];
    if (hasImage) {
      const mime = typeof body.mimeType === "string" ? body.mimeType.toLowerCase().trim() : "";
      if (!ALLOWED_IMAGE_MIMES.has(mime)) {
        throw new ValidationError("Unsupported image format. Please upload a JPG, PNG, or WebP file.");
      }
      const cleanedBase64 = body.imageBase64.replace(/^data:image\/[a-zA-Z+]+;base64,/, "").trim();
      if (cleanedBase64.length > MAX_BASE64_LENGTH) {
        throw new ValidationError("Image exceeds the 4 MB limit. Please upload a smaller image.");
      }
      parts.push({
        inlineData: {
          mimeType: mime,
          data: cleanedBase64
        }
      });
    }
    parts.push({
      text: [
        "Analyze this hospital blood requisition slip, lab CBC report, or clinical transfusion note.",
        noteText ? `Clinical text provided:
${noteText}` : "",
        "Extract structured blood bank requisition details accurately.",
        'If a blood group is not clearly stated, set bloodGroup to "UNKNOWN".',
        'Map component strictly to one of: "Whole Blood", "Packed Red Cells", "Platelets", "Fresh Frozen Plasma", "Cryoprecipitate". Default to "Packed Red Cells" if red cells/PRBC/blood transfusion for low hemoglobin is indicated.',
        'Map urgency strictly to one of: "Emergency", "Urgent", "Normal".',
        "Never invent patient names or lab values not present in the source."
      ].filter(Boolean).join("\n\n")
    });
    const ai = getGeminiClient();
    const response = await withModelFallback(
      TEXT_MODEL,
      FALLBACK_TEXT_MODEL,
      (model, abortSignal) => ai.models.generateContent({
        model,
        contents: { parts },
        config: {
          systemInstruction: "You are a clinical transfusion intake parser. Extract structured fields accurately from blood bank slips, lab CBC reports, or emergency ward notes. Keep clinicalSummary plain-language, concise, and helpful for patients and hospital staff.",
          responseMimeType: "application/json",
          abortSignal,
          ...model === TEXT_MODEL ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } : {},
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              documentType: {
                type: Type.STRING,
                description: 'Short label like "Hospital Requisition Slip", "CBC Lab Report", or "Emergency Ward Note".'
              },
              bloodGroup: {
                type: Type.STRING,
                description: "One of A+, A-, B+, B-, AB+, AB-, O+, O-, or UNKNOWN."
              },
              component: {
                type: Type.STRING,
                description: "One of Whole Blood, Packed Red Cells, Platelets, Fresh Frozen Plasma, Cryoprecipitate."
              },
              unitsRequired: {
                type: Type.INTEGER,
                description: "Number of blood units requested (1 to 10). Default 1 if unspecified."
              },
              urgency: {
                type: Type.STRING,
                description: "One of Emergency, Urgent, Normal."
              },
              patientName: {
                type: Type.STRING,
                description: "Patient name or ward identifier if visible, otherwise empty string."
              },
              hemoglobinGdl: {
                type: Type.STRING,
                description: 'Observed hemoglobin reading with units (e.g. "7.4 g/dL") if present, otherwise empty string.'
              },
              hospitalHint: {
                type: Type.STRING,
                description: "Hospital or clinic name mentioned, otherwise empty string."
              },
              clinicalSummary: {
                type: Type.STRING,
                description: "2-3 concise sentences explaining the requisition in plain language."
              },
              recommendedNextSteps: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "3 concrete immediate actions for the family or coordinator."
              },
              confidenceNote: {
                type: Type.STRING,
                description: "Short note on extraction certainty and reminder to verify against original lab order."
              }
            },
            required: [
              "documentType",
              "bloodGroup",
              "component",
              "unitsRequired",
              "urgency",
              "clinicalSummary",
              "recommendedNextSteps",
              "confidenceNote"
            ]
          }
        }
      }),
      1e4
    );
    const rawJson = (response.text ?? "{}").trim();
    const parsed = JSON.parse(rawJson);
    return sendSuccess(res, { analysis: parsed });
  } catch (err) {
    next(mapGeminiError(err));
  }
}
async function generateDonorPlan(req, res, next) {
  try {
    assertAiRateLimit(getClientIp2(req), 15, 6e4);
    const body = req.body;
    const age = Number(body.age);
    const weightKg = Number(body.weightKg);
    if (!Number.isFinite(age) || age < 14 || age > 90) {
      throw new ValidationError("Please provide a valid age between 14 and 90.");
    }
    if (!Number.isFinite(weightKg) || weightKg < 30 || weightKg > 200) {
      throw new ValidationError("Please provide a valid weight in kilograms.");
    }
    const bloodGroup = typeof body.bloodGroup === "string" ? body.bloodGroup.slice(0, 5) : "O+";
    const gender = typeof body.gender === "string" ? body.gender.slice(0, 16) : "Other";
    const diet = typeof body.dietPreference === "string" ? body.dietPreference.slice(0, 30) : "Vegetarian";
    const lastDonationDate = typeof body.lastDonationDate === "string" ? body.lastDonationDate.slice(0, 20) : "Never / Over 6 months ago";
    const hbText = body.hemoglobinGdl !== null && body.hemoglobinGdl !== void 0 && Number.isFinite(Number(body.hemoglobinGdl)) ? `${Number(body.hemoglobinGdl)} g/dL` : "Not measured recently";
    const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 400) : "None reported";
    const prompt = [
      "Create a personalized blood donation readiness and iron-recovery plan following NBTC India clinical standards:",
      `- Blood Group: ${bloodGroup}`,
      `- Gender: ${gender}`,
      `- Age: ${age} years`,
      `- Weight: ${weightKg} kg`,
      `- Recent Hemoglobin: ${hbText}`,
      `- Dietary Preference: ${diet}`,
      `- Last Donation Date: ${lastDonationDate || "Never / Over 6 months ago"}`,
      `- Recent medications, health notes, or travel: ${notes || "None"}`,
      `Today's date: ${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.`,
      "Make meal suggestions practical, affordable, and tailored to Indian kitchens (e.g., spinach/palak, dates, jaggery/gur, roasted chana, pomegranate, lentils, citrus vitamin-C pairing, or lean iron sources if non-vegetarian)."
    ].join("\n");
    const ai = getGeminiClient();
    const response = await withModelFallback(
      TEXT_MODEL,
      FALLBACK_TEXT_MODEL,
      (model, abortSignal) => ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          systemInstruction: "You are a clinical hematology donor educator following NBTC India blood safety standards. Be encouraging, medically accurate, and concise. Never override a deferral requirement (age < 18 or > 65, weight < 45kg, Hb < 12.5 g/dL, or active antibiotics/fever).",
          responseMimeType: "application/json",
          abortSignal,
          ...model === TEXT_MODEL ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } : {},
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              eligibilityVerdict: {
                type: Type.STRING,
                description: 'One of "Likely Eligible", "Needs Medical Officer Review", or "Temporary Deferral Advised".'
              },
              readinessScore: {
                type: Type.INTEGER,
                description: "Score from 0 to 100 reflecting current donation readiness."
              },
              recommendedDonationType: {
                type: Type.STRING,
                description: 'One of "Whole Blood", "Apheresis Platelets", "Plasma", or "Wait Before Donating".'
              },
              summary: {
                type: Type.STRING,
                description: "2-3 concise sentences explaining the assessment and why their blood group matters."
              },
              hydrationProtocol: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "3 concrete pre- and post-donation hydration & rest steps."
              },
              ironRichMealPlan: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    timing: { type: Type.STRING, description: 'e.g. "24 Hours Before", "2-3 Hours Before", "Post-Donation Recovery"' },
                    suggestion: { type: Type.STRING, description: "Specific iron + Vitamin C food pairing." }
                  },
                  required: ["timing", "suggestion"]
                },
                description: "3-4 practical meal recommendations tailored to dietPreference."
              },
              safetyCautions: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "2-3 concise clinical cautions or deferral reminders."
              }
            },
            required: [
              "eligibilityVerdict",
              "readinessScore",
              "recommendedDonationType",
              "summary",
              "hydrationProtocol",
              "ironRichMealPlan",
              "safetyCautions"
            ]
          }
        }
      }),
      1e4
    );
    const rawJson = (response.text ?? "{}").trim();
    const parsed = JSON.parse(rawJson);
    return sendSuccess(res, { plan: parsed });
  } catch (err) {
    next(mapGeminiError(err));
  }
}
async function synthesizeSpeech(req, res, next) {
  try {
    assertAiRateLimit(getClientIp2(req), 12, 6e4);
    const body = req.body;
    const cleanText = typeof body.text === "string" ? body.text.replace(/[*#`_]/g, "").replace(/\s+/g, " ").trim().slice(0, 750) : "";
    if (!cleanText) {
      throw new ValidationError("Text is required for audio synthesis.");
    }
    const style = body.style === "emergency" ? "Calm, reassuring, crystal-clear medical dispatcher" : "Warm, articulate clinical health advisor";
    const ai = getGeminiClient();
    const response = await ai.models.generateContent({
      model: TTS_MODEL,
      contents: [
        {
          role: "user",
          parts: [
            {
              text: cleanText,
              // speechMetadata supported by gemini-3.8-flash-lite-tts
              ...{ speechMetadata: { style } }
            }
          ]
        }
      ],
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: "Kore" }
          }
        }
      }
    });
    const audioPart = response.candidates?.[0]?.content?.parts?.find(
      (part) => part.inlineData?.data
    );
    const base64Audio = audioPart?.inlineData?.data;
    if (!base64Audio) {
      throw new Error("No audio returned from speech synthesis model.");
    }
    return sendSuccess(res, {
      mimeType: audioPart?.inlineData?.mimeType || "audio/wav",
      audioBase64: base64Audio
    });
  } catch (err) {
    next(mapGeminiError(err));
  }
}
async function transcribeVoiceQuery(req, res, next) {
  try {
    assertAiRateLimit(getClientIp2(req), 16, 6e4);
    const body = req.body;
    const rawMime = typeof body.mimeType === "string" ? body.mimeType.split(";")[0].toLowerCase().trim() : "";
    if (!body.audioBase64 || typeof body.audioBase64 !== "string") {
      throw new ValidationError("Audio recording is required for transcription.");
    }
    if (!ALLOWED_AUDIO_MIMES.has(rawMime)) {
      throw new ValidationError("Unsupported audio format. Please record using your browser microphone.");
    }
    const cleanedBase64 = body.audioBase64.replace(/^data:audio\/[a-zA-Z0-9.+-]+;base64,/, "").trim();
    if (!cleanedBase64 || cleanedBase64.length > MAX_BASE64_LENGTH) {
      throw new ValidationError("Audio clip is empty or exceeds the 4 MB limit.");
    }
    const ai = getGeminiClient();
    const response = await withModelFallback(
      TRANSCRIBE_MODEL,
      FALLBACK_TEXT_MODEL,
      (model, abortSignal) => ai.models.generateContent({
        model,
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: rawMime === "audio/x-m4a" ? "audio/mp4" : rawMime,
                data: cleanedBase64
              }
            },
            {
              text: "Transcribe this spoken blood-bank or donor query accurately. Preserve blood groups (like O-, AB+, B-), hospital names, and medical terms cleanly. If spoken in Hindi or Marathi, output clear natural text (or Hinglish/English as spoken). Return only the transcript without extra commentary."
            }
          ]
        },
        config: { abortSignal }
      }),
      12e3
    );
    const transcript = (response.text ?? "").trim();
    if (!transcript) {
      throw new ValidationError("No clear speech was detected in the recording. Please try speaking closer to the microphone.");
    }
    return sendSuccess(res, { transcript });
  } catch (err) {
    next(mapGeminiError(err));
  }
}
var ALLOWED_LANGUAGES = /* @__PURE__ */ new Set(["English", "Hindi", "Marathi", "Hinglish"]);
async function draftEmergencySosAppeal(req, res, next) {
  try {
    assertAiRateLimit(getClientIp2(req), 18, 6e4);
    const body = req.body;
    const mode = body.mode === "donor_outreach" ? "donor_outreach" : "family_sos";
    const language = typeof body.language === "string" && ALLOWED_LANGUAGES.has(body.language) ? body.language : "English";
    const bloodGroup = typeof body.bloodGroup === "string" ? body.bloodGroup.trim().slice(0, 5) : "";
    if (!bloodGroup) {
      throw new ValidationError("Blood group is required to draft an appeal.");
    }
    const unitsNeeded = Math.max(1, Math.min(10, Number(body.unitsNeeded) || 2));
    const component = typeof body.component === "string" ? body.component.trim().slice(0, 40) : "Packed Red Cells";
    const substitutes = Array.isArray(body.compatibleSubstitutes) ? body.compatibleSubstitutes.slice(0, 8).map((s) => String(s).slice(0, 5)).join(", ") : "";
    const patientName = typeof body.patientName === "string" ? body.patientName.trim().slice(0, 80) : "";
    const hospitalName = typeof body.hospitalName === "string" ? body.hospitalName.trim().slice(0, 120) : "BloodConnect Accredited Hospital Vault";
    const hospitalPhone = typeof body.hospitalPhone === "string" ? body.hospitalPhone.trim().slice(0, 32) : "1800-11-9999";
    const hospitalCity = typeof body.hospitalCity === "string" ? body.hospitalCity.trim().slice(0, 40) : "Mumbai";
    const donorName = typeof body.donorName === "string" ? body.donorName.trim().slice(0, 60) : "";
    const donorCity = typeof body.donorCity === "string" ? body.donorCity.trim().slice(0, 40) : "";
    const prompt = mode === "donor_outreach" ? [
      `Write a polite, concise, respectful WhatsApp/SMS outreach message in ${language} to a verified voluntary blood donor.`,
      `- Donor First Name: ${donorName || "Voluntary Donor"}`,
      `- Donor City: ${donorCity || hospitalCity}`,
      `- Blood Group Needed: ${bloodGroup} (${unitsNeeded} unit(s) of ${component})`,
      `- Accredited Blood Centre: ${hospitalName}, ${hospitalCity}`,
      `- Blood Bank Desk Phone: ${hospitalPhone}`,
      "Rules:",
      "1. Never pressure or guilt-trip the donor; clearly state it is completely voluntary and subject to standard NBTC medical screening.",
      "2. Keep under 90 words so it fits cleanly on a mobile WhatsApp screen.",
      "3. Output plain text only (no markdown headings or commentary)."
    ].join("\n") : [
      `Write a clear, urgent, calm WhatsApp/SMS emergency blood appeal in ${language} for family and community groups.`,
      `- Required Blood Group: ${bloodGroup} (${unitsNeeded} unit(s) of ${component})`,
      substitutes ? `- Clinically Compatible Red-Cell Substitutes: ${substitutes}` : "",
      patientName ? `- Patient / Ward Reference: ${patientName}` : "",
      `- Verified Blood Bank / Hospital: ${hospitalName}, ${hospitalCity}`,
      `- Verified Blood Bank Phone: ${hospitalPhone}`,
      `- 24/7 Helpline: 1800-11-9999`,
      "Rules:",
      "1. Lead clearly with the blood group, units, and hospital so busy readers immediately see if they can help.",
      "2. Keep every number, hospital name, and phone exact \u2014 do not invent any contact details.",
      "3. Keep under 105 words, crisp and scannable with short lines. Output plain text only (no markdown code fences or extra notes)."
    ].filter(Boolean).join("\n");
    const ai = getGeminiClient();
    const response = await withModelFallback(
      TEXT_MODEL,
      FALLBACK_TEXT_MODEL,
      (model, abortSignal) => ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          systemInstruction: "You are a clinical emergency communications coordinator for an accredited Indian blood bank network. Produce accurate, calm, dignified, mobile-ready messages in the exact requested language (English, Hindi in Devanagari script, Marathi in Devanagari script, or natural Hinglish).",
          abortSignal,
          ...model === TEXT_MODEL ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } : {}
        }
      }),
      8e3
    );
    const appealText = (response.text ?? "").trim();
    if (!appealText) {
      throw new Error("Empty appeal returned by AI service.");
    }
    return sendSuccess(res, {
      language,
      mode,
      appealText
    });
  } catch (err) {
    next(mapGeminiError(err));
  }
}

// server/routes/ai.routes.ts
var router9 = Router9();
router9.post("/triage-chat", streamTriageChat);
router9.post("/analyze-slip", analyzeClinicalSlip);
router9.post("/donor-plan", generateDonorPlan);
router9.post("/tts", synthesizeSpeech);
router9.post("/transcribe", transcribeVoiceQuery);
router9.post("/sos-appeal", draftEmergencySosAppeal);
var ai_routes_default = router9;

// server/routes/index.ts
var apiRouter = Router10();
apiRouter.get("/health", (_req, res) => {
  sendSuccess(res, {
    status: "ok",
    service: "bloodconnect-api",
    database: getStatus(),
    time: (/* @__PURE__ */ new Date()).toISOString()
  });
});
apiRouter.use("/db", database_routes_default);
apiRouter.use("/auth", auth_routes_default);
apiRouter.use("/rbac", rbac_routes_default);
apiRouter.use("/donors", donor_routes_default);
apiRouter.use("/blood-units", bloodUnit_routes_default);
apiRouter.use("/requests", request_routes_default);
apiRouter.use("/camps", camp_routes_default);
apiRouter.use("/appointments", appointment_routes_default);
apiRouter.use("/ai", ai_routes_default);
var routes_default = apiRouter;

// server/middleware/security.ts
function securityHeaders(_req, res, next) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-DNS-Prefetch-Control", "off");
  next();
}

// server/middleware/requestLogger.ts
function requestLogger(req, res, next) {
  const start = Date.now();
  res.on("finish", () => {
    const durationMs = Date.now() - start;
    console.log(
      `[API] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${durationMs}ms)`
    );
  });
  next();
}

// server/middleware/errorHandler.ts
function apiNotFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    code: "ROUTE_NOT_FOUND",
    message: `API route not found: ${req.method} ${req.originalUrl}`,
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  });
}
function errorHandler(err, _req, res, _next) {
  if (res.headersSent) {
    return;
  }
  if (err instanceof RateLimitError && err.retryAfterSec) {
    res.setHeader("Retry-After", String(err.retryAfterSec));
  }
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      code: err.code,
      message: err.message,
      ...err.details ? { details: err.details } : {},
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
  }
  if (err instanceof SyntaxError && "body" in err) {
    return res.status(400).json({
      success: false,
      code: "INVALID_JSON",
      message: "Malformed JSON in request body",
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
  }
  console.error("[API Error]", err);
  return res.status(500).json({
    success: false,
    code: "INTERNAL_SERVER_ERROR",
    message: env.nodeEnv === "production" ? "Internal server error" : err.message || "Internal server error",
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  });
}

// server/app.ts
function createApp() {
  const app2 = express();
  app2.set("trust proxy", 1);
  app2.disable("x-powered-by");
  app2.use(securityHeaders);
  app2.use(express.json({ limit: "8mb" }));
  app2.use(express.urlencoded({ extended: true, limit: "1mb" }));
  app2.use("/api", requestLogger, attachSession, routes_default);
  app2.use("/api/*", apiNotFoundHandler);
  app2.use(errorHandler);
  return app2;
}

// server/api.entry.ts
var app = createApp();
var api_entry_default = app;
export {
  api_entry_default as default
};
