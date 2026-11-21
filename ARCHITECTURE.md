# BloodConnect — Software Architecture & Engineering Guide

BloodConnect is a full-stack clinical blood bank & transfusion management platform built with **React 19 + TypeScript + Vite + Tailwind CSS v4** on the frontend and **Express + MySQL 8.0 (`mysql2/promise`)** on the backend.

---

## 1. Directory Structure

```text
server.ts                           # Thin runtime bootstrap (mounts Express app + Vite/static)
server/
  app.ts                            # Express app factory (security headers, JSON limits, /api routes, error middleware)
  config/
    env.ts                          # Centralized dotenv environment parser (no hardcoded secrets)
  db/
    connection.ts                   # MySQL connection pool lifecycle, URI parser, health probes
    schema.ts                       # 3NF MySQL 8.0 InnoDB schema (14 relational tables)
    repositories/                   # Parameterized SQL data access layer (one module per domain)
      auth.repository.ts
      donor.repository.ts
      bloodUnit.repository.ts
      request.repository.ts
      camp.repository.ts
      appointment.repository.ts
      sync.repository.ts
  controllers/                      # HTTP request/response orchestration & domain validation
    auth.controller.ts
    database.controller.ts
    donor.controller.ts
    bloodUnit.controller.ts
    request.controller.ts
    camp.controller.ts
    appointment.controller.ts
  routes/                           # RESTful Express routers mounted under /api/*
    index.ts
    auth.routes.ts
    database.routes.ts
    donor.routes.ts
    bloodUnit.routes.ts
    request.routes.ts
    camp.routes.ts
    appointment.routes.ts
  middleware/
    asyncHandler.ts                 # Promise rejection forwarding to errorHandler
    errorHandler.ts                 # Centralized AppError + 404 JSON error responses
    requestLogger.ts                # Structured HTTP method/path/status/latency logging
    security.ts                     # Lightweight HTTP security headers
  utils/
    apiResponse.ts                  # Typed AppError subclasses + sendSuccess/sendCreated helpers
    crypto.ts                       # Node crypto scrypt password hashing + constant-time verify
    validators.ts                   # Reusable input & DB config validators

src/
  main.tsx                          # React root wrapped in <ErrorBoundary>
  App.tsx                           # View router, cross-page intents, modal orchestration
  types.ts                          # Shared TypeScript domain contracts
  config/
    constants.ts                    # Blood groups, components, slots, view labels, storage keys
  services/
    apiClient.ts                    # Typed fetch client with AbortController timeout & ApiClientError
    databaseApi.ts                  # MySQL connection, schema init, seed, SQL console, sync APIs
    bloodbankApi.ts                 # Domain write-through sync APIs (donors, units, requests, camps, appointments)
  hooks/
    useDatabaseSubscription.ts      # Reactive store subscription hook
    useToast.ts                     # Non-blocking toast notification hook
  utils/
    formatters.ts                   # Consistent clinical date & status badge formatting
    validation.ts                   # Reusable form validators
  db/
    databaseStore.ts                # Client state engine (localStorage persistence + MySQL sync)
    seedData.ts                     # Baseline reference dataset
    donorGenerator.ts               # Deterministic donor dataset generator
    dbmsArchitectureData.ts         # 3NF ER/schema documentation metadata
  components/
    ui/                             # Reusable UI primitives (ErrorBoundary, StatCard, UnderlineTabs, ToastNotification)
    ...                             # Feature views, dashboards, and clinical modals
```

---

## 2. Backend API Contract

All endpoints live under `/api/*` and return standardized JSON payloads with `success` and `timestamp` fields. Validation errors return `400`, auth failures return `401`, duplicates return `409`, unknown API paths return `404`, and unreachable MySQL operations honestly report `503` (`offline: true`) rather than fabricating query results.

| Group | Endpoints |
| :--- | :--- |
| **Health** | `GET /api/health` |
| **Auth & Sessions** | `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/mfa/verify-login`, `POST /api/auth/logout`, `GET /api/auth/me`, `POST /api/auth/forgot-password`, `POST /api/auth/reset-password`, `POST /api/auth/verify-email`, `POST /api/auth/resend-verification`, `PATCH /api/auth/profile`, `POST /api/auth/change-password`, `GET /api/auth/sessions`, `DELETE /api/auth/sessions/:sessionId`, `POST /api/auth/sessions/revoke-others`, `POST /api/auth/mfa/setup`, `POST /api/auth/mfa/confirm`, `POST /api/auth/mfa/disable` |
| **RBAC & Governance** | `GET /api/rbac/roles`, `POST /api/rbac/roles`, `PUT /api/rbac/roles/:roleKey/permissions`, `GET /api/rbac/permissions`, `GET /api/rbac/users`, `POST /api/rbac/users`, `GET /api/rbac/users/:userId`, `PATCH /api/rbac/users/:userId/role`, `PATCH /api/rbac/users/:userId/status`, `GET /api/rbac/audit-logs` |
| **Database Ops (`db:manage`)** | `GET /api/db/status`, `POST /api/db/test`, `POST /api/db/connect`, `POST /api/db/init-tables`, `POST /api/db/seed`, `POST /api/db/query`, `POST /api/db/sync-all`, `GET /api/db/live-data`, `GET /api/db/schema.sql` |
| **Clinical Domains** | `/api/donors`, `/api/blood-units`, `/api/requests`, `/api/camps`, `/api/appointments` (permission- & ownership-enforced) |

---

## 3. Authentication, Authorization (RBAC/PBAC) & Security Controls

- **7-Tier Configurable Authority Hierarchy**: `super_admin` (Rank 100), `admin` (Rank 80), `authority_officer` (Rank 65), `department_manager` (Rank 50), `moderator` (Rank 35), `regular_user` (Rank 10), and `guest` (Rank 0), plus custom admin-created roles. Role-to-permission mappings are stored dynamically in `server/db/securityStore.ts` (and normalized MySQL tables `roles`, `permissions`, `role_permissions`, `user_roles`) and take effect immediately without hardcoding role names across routes.
- **Zero Frontend Role Trust**: Public registration always assigns `regular_user` and ignores any client-supplied role. Every request resolves the active session and live permissions strictly on the server via `attachSession` + `requirePermission` / `requireSelfOrPermission`.
- **Anti-Escalation & Anti-IDOR**: Users cannot modify their own role or status, cannot assign roles equal to or above their own rank (unless `super_admin`), cannot touch higher/equal-ranked accounts, and cannot access another user's private profile or appointments without explicit administrative permission.
- **Modern Cryptography**: Passwords hashed via Node `crypto.scryptSync` (N=16384, r=8, p=1, 16-byte random salt) and verified with `crypto.timingSafeEqual`. Opaque session tokens, password reset tokens, email verification tokens, and MFA backup recovery codes are stored exclusively as SHA-256 hashes.
- **HttpOnly Sessions & Revocation**: Delivered via `HttpOnly; SameSite=Lax; Path=/` cookies (`Secure` in production), with expiration, device listing, individual/bulk revocation, and automatic full revocation on password reset, suspension, or deactivation.
- **Brute-Force Protection**: Per-identifier and per-IP failure tracking triggers temporary account lockout (`429 Too Many Requests` + `Retry-After`) and records `BRUTE_FORCE_LOCKOUT` audit events.
- **Optional RFC 6238 TOTP MFA**: Standard 160-bit Base32 secret, `otpauth://` URI, 6-digit 30-second HMAC-SHA1 verification (±1 step drift window), 8 single-use hashed recovery codes, and a 2-stage login challenge.
- **Immutable Security Audit Trail**: Records `LOGIN_SUCCESS`, `LOGIN_FAILED`, `BRUTE_FORCE_LOCKOUT`, `AUTHZ_DENIED`, `PRIVILEGE_ESCALATION_BLOCKED`, `ROLE_CHANGED`, `PERMISSIONS_UPDATED`, `ACCOUNT_STATUS_CHANGED`, `MFA_ENABLED`, `MFA_FAILED`, and session revocations.

---

## 4. Connecting Live MySQL & Optional Outbound SMTP

1. Copy `.env.example` to `.env` and supply your MySQL credentials (`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, or a single `DATABASE_URL`).
2. Start your local or cloud MySQL 8.0 instance and sign in as an Administrator (`db:manage` permission) to open **MySQL Manager & SQL Console** and initialize all 24 relational tables (clinical + RBAC/security tables).
3. For production outbound password-reset and email-verification delivery, configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and `SMTP_FROM` in `.env` (in local development without SMTP, tokens are surfaced via the secure development preview flow).

