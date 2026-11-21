import { Request, Response } from 'express';
import { securityStore } from '../db/securityStore';
import { env } from '../config/env';
import {
  AuthenticationError,
  AuthorizationError,
  ConflictError,
  RateLimitError,
  sendCreated,
  sendSuccess,
  ValidationError,
} from '../utils/apiResponse';
import {
  buildOtpAuthUri,
  hashPassword,
  validatePasswordStrength,
  verifyPassword,
} from '../utils/crypto';
import { clearSessionCookie, setSessionCookie } from '../utils/cookies';
import { isValidEmail, sanitizeNonEmptyString } from '../utils/validators';
import { getClientIp, getUserAgent } from '../middleware/auth.middleware';

/**
 * POST /api/auth/register
 * Public registration ALWAYS creates a 'regular_user' account (least privilege).
 * Any role parameter supplied by the client is intentionally ignored to prevent self-escalation.
 */
export async function register(req: Request, res: Response) {
  const email = sanitizeNonEmptyString(req.body?.email, 120);
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const fullName = sanitizeNonEmptyString(req.body?.fullName, 100);
  const phone = sanitizeNonEmptyString(req.body?.phone, 25) || '';
  const usernameInput = sanitizeNonEmptyString(req.body?.username, 50);
  const department = sanitizeNonEmptyString(req.body?.department, 100) || 'Voluntary Donor Network';
  const organizationName = sanitizeNonEmptyString(req.body?.organizationName, 120) || undefined;

  if (!email || !isValidEmail(email)) {
    throw new ValidationError('A valid email address is required.', { email: 'Invalid email format' });
  }
  if (!fullName || fullName.length < 2) {
    throw new ValidationError('Full name is required (minimum 2 characters).', {
      fullName: 'Full name is required',
    });
  }

  const passwordIssue = validatePasswordStrength(password);
  if (passwordIssue) {
    throw new ValidationError(passwordIssue, { password: passwordIssue });
  }

  const generatedUsername = (
    usernameInput ||
    `user_${fullName.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12)}_${Date.now().toString().slice(-4)}`
  ).toLowerCase();

  if (securityStore.userExists(email, generatedUsername)) {
    throw new ConflictError('An account with this email address or username already exists.');
  }

  const ipAddress = getClientIp(req);
  const userAgent = getUserAgent(req);

  // Security check: record if someone attempted to supply a privileged role during self-registration
  const attemptedRole = typeof req.body?.role === 'string' ? req.body.role : typeof req.body?.roleKey === 'string' ? req.body.roleKey : null;
  if (attemptedRole && !['regular_user', 'donor'].includes(attemptedRole)) {
    securityStore.recordAudit({
      actorEmail: email.toLowerCase(),
      actorRole: 'guest',
      action: 'PRIVILEGE_ESCALATION_BLOCKED',
      outcome: 'BLOCKED',
      resource: 'POST /api/auth/register',
      ipAddress,
      userAgent,
      details: `Ignored client-supplied privileged role '${attemptedRole}' during public registration; enforced 'regular_user'.`,
    });
  }

  const passwordHash = hashPassword(password);
  const user = securityStore.createUser({
    username: generatedUsername,
    email: email.toLowerCase(),
    passwordHash,
    fullName,
    phone,
    roleKey: 'regular_user', // Strictly server-enforced least privilege
    status: 'active',
    emailVerified: false,
    department,
    organizationName,
  });

  const verification = securityStore.issueEmailVerificationToken(user.id);
  const { rawToken, session, maxAgeSeconds } = securityStore.createSession(user.id, {
    ipAddress,
    userAgent,
    rememberMe: false,
  });
  setSessionCookie(res, rawToken, maxAgeSeconds);

  securityStore.recordAudit({
    actorUserId: user.id,
    actorEmail: user.email,
    actorRole: user.roleKey,
    action: 'USER_REGISTERED',
    outcome: 'SUCCESS',
    resource: 'POST /api/auth/register',
    targetUserId: user.id,
    ipAddress,
    userAgent,
    details: 'Registered new regular_user account with scrypt password hash and verification token.',
  });

  return sendCreated(res, {
    message: 'Account created successfully. Please verify your email address.',
    user: securityStore.toPublicUser(user),
    sessionId: session.id,
    emailVerification: {
      required: true,
      expiresAt: verification.expiresAt,
      deliveryMode: env.smtp.configured ? 'smtp' : 'development_preview',
      ...(env.nodeEnv !== 'production' && !env.smtp.configured
        ? { devPreviewToken: verification.rawToken }
        : {}),
    },
  });
}

/**
 * POST /api/auth/login
 * Authenticates via scrypt verification, enforces brute-force lockout & account status,
 * supports 2-stage TOTP MFA challenge, and issues an HttpOnly server-side session cookie.
 */
export async function login(req: Request, res: Response) {
  const identifier = sanitizeNonEmptyString(req.body?.identifier, 120);
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const rememberMe = Boolean(req.body?.rememberMe);

  if (!identifier || !password) {
    throw new ValidationError('Email or username and password are required.', {
      identifier: !identifier ? 'Required' : '',
      password: !password ? 'Required' : '',
    });
  }

  const ipAddress = getClientIp(req);
  const userAgent = getUserAgent(req);

  // 1. Brute-force protection check
  const lockout = securityStore.checkBruteForceLockout(identifier, ipAddress);
  if (lockout.locked) {
    securityStore.recordAudit({
      actorEmail: identifier.toLowerCase(),
      action: 'BRUTE_FORCE_LOCKOUT',
      outcome: 'BLOCKED',
      resource: 'POST /api/auth/login',
      ipAddress,
      userAgent,
      details: `Blocked login attempt during active lockout window (${lockout.retryAfterSec}s remaining).`,
    });
    throw new RateLimitError(
      `Account temporarily locked due to repeated failed login attempts. Try again in ${Math.ceil(lockout.retryAfterSec / 60)} minute(s).`,
      lockout.retryAfterSec
    );
  }

  // 2. Lookup account
  const user = securityStore.findUserByIdentifier(identifier);
  if (!user) {
    const attempt = securityStore.recordFailedLogin(identifier, ipAddress);
    securityStore.recordAudit({
      actorEmail: identifier.toLowerCase(),
      action: attempt.lockedNow ? 'BRUTE_FORCE_LOCKOUT' : 'LOGIN_FAILED',
      outcome: attempt.lockedNow ? 'BLOCKED' : 'DENIED',
      resource: 'POST /api/auth/login',
      ipAddress,
      userAgent,
      details: `Invalid login identifier (${attempt.attemptsUsed}/${env.security.maxLoginAttempts} attempts).`,
    });
    if (attempt.lockedNow) {
      throw new RateLimitError(
        `Too many failed login attempts. Temporarily locked for ${env.security.lockoutWindowMinutes} minutes.`,
        attempt.retryAfterSec
      );
    }
    throw new AuthenticationError('Invalid email/username or password.');
  }

  // 3. Enforce account lifecycle status
  if (user.status === 'suspended' || user.status === 'deactivated') {
    securityStore.recordAudit({
      actorUserId: user.id,
      actorEmail: user.email,
      actorRole: user.roleKey,
      action: 'LOGIN_BLOCKED_STATUS',
      outcome: 'BLOCKED',
      resource: 'POST /api/auth/login',
      targetUserId: user.id,
      ipAddress,
      userAgent,
      details: `Blocked login for ${user.status} account.`,
    });
    throw new AuthorizationError(
      user.status === 'suspended'
        ? 'Your account has been suspended by an administrator. Please contact security support.'
        : 'This account has been deactivated and cannot sign in.',
      'ACCOUNT_DISABLED'
    );
  }

  // 4. Verify scrypt password hash in constant time
  const validPassword = verifyPassword(password, user.passwordHash);
  if (!validPassword) {
    const attempt = securityStore.recordFailedLogin(identifier, ipAddress);
    securityStore.recordAudit({
      actorUserId: user.id,
      actorEmail: user.email,
      actorRole: user.roleKey,
      action: attempt.lockedNow ? 'BRUTE_FORCE_LOCKOUT' : 'LOGIN_FAILED',
      outcome: attempt.lockedNow ? 'BLOCKED' : 'DENIED',
      resource: 'POST /api/auth/login',
      targetUserId: user.id,
      ipAddress,
      userAgent,
      details: `Invalid password (${attempt.attemptsUsed}/${env.security.maxLoginAttempts} attempts).`,
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

  // 5. Clear brute-force failure counters on valid password
  securityStore.clearLoginAttempts(identifier, ipAddress);

  // 6. Two-stage MFA challenge if TOTP MFA is enabled
  const mfaStatus = securityStore.getMfaStatus(user.id);
  if (mfaStatus.enabled) {
    const challenge = securityStore.createMfaChallenge(user.id, {
      rememberMe,
      ipAddress,
      userAgent,
    });
    securityStore.recordAudit({
      actorUserId: user.id,
      actorEmail: user.email,
      actorRole: user.roleKey,
      action: 'MFA_CHALLENGE_ISSUED',
      outcome: 'SUCCESS',
      resource: 'POST /api/auth/login',
      targetUserId: user.id,
      ipAddress,
      userAgent,
      details: 'Primary password verified; issued 5-minute TOTP MFA verification challenge.',
    });
    return sendSuccess(res, {
      mfaRequired: true,
      challengeToken: challenge.challengeToken,
      expiresAt: challenge.expiresAt,
      message: 'Enter the 6-digit code from your authenticator app or a backup recovery code.',
    });
  }

  // 7. Issue HttpOnly opaque session cookie
  const { rawToken, session, maxAgeSeconds } = securityStore.createSession(user.id, {
    ipAddress,
    userAgent,
    rememberMe,
  });
  securityStore.markUserLogin(user.id);
  setSessionCookie(res, rawToken, maxAgeSeconds);

  securityStore.recordAudit({
    actorUserId: user.id,
    actorEmail: user.email,
    actorRole: user.roleKey,
    action: 'LOGIN_SUCCESS',
    outcome: 'SUCCESS',
    resource: 'POST /api/auth/login',
    targetUserId: user.id,
    ipAddress,
    userAgent,
    details: `Authenticated session ${session.id} established.`,
  });

  return sendSuccess(res, {
    mfaRequired: false,
    user: securityStore.toPublicUser(user),
    sessionId: session.id,
  });
}

/**
 * POST /api/auth/mfa/verify-login
 * Completes stage 2 of login when MFA is enabled on the account.
 */
export async function verifyMfaLogin(req: Request, res: Response) {
  const challengeToken = sanitizeNonEmptyString(req.body?.challengeToken, 200);
  const code = sanitizeNonEmptyString(req.body?.code, 32);

  if (!challengeToken || !code) {
    throw new ValidationError('Challenge token and verification code are required.');
  }

  const ipAddress = getClientIp(req);
  const userAgent = getUserAgent(req);
  const challenge = securityStore.getActiveMfaChallenge(challengeToken);
  if (!challenge) {
    throw new AuthenticationError('MFA verification challenge is invalid or has expired. Please sign in again.');
  }

  const user = securityStore.findUserById(challenge.userId);
  if (!user || user.status === 'suspended' || user.status === 'deactivated') {
    throw new AuthorizationError('Account is no longer active.');
  }

  const check = securityStore.verifyUserMfaCode(user.id, code);
  if (!check.verified) {
    securityStore.recordAudit({
      actorUserId: user.id,
      actorEmail: user.email,
      actorRole: user.roleKey,
      action: 'MFA_FAILED',
      outcome: 'DENIED',
      resource: 'POST /api/auth/mfa/verify-login',
      targetUserId: user.id,
      ipAddress,
      userAgent,
      details: 'Invalid TOTP or recovery code submitted during login.',
    });
    throw new AuthenticationError('Invalid authenticator code or backup recovery code.');
  }

  securityStore.consumeMfaChallenge(challenge.id);
  const { rawToken, session, maxAgeSeconds } = securityStore.createSession(user.id, {
    ipAddress,
    userAgent,
    rememberMe: challenge.rememberMe,
  });
  securityStore.markUserLogin(user.id);
  setSessionCookie(res, rawToken, maxAgeSeconds);

  securityStore.recordAudit({
    actorUserId: user.id,
    actorEmail: user.email,
    actorRole: user.roleKey,
    action: 'LOGIN_SUCCESS_MFA',
    outcome: 'SUCCESS',
    resource: 'POST /api/auth/mfa/verify-login',
    targetUserId: user.id,
    ipAddress,
    userAgent,
    details: check.usedRecoveryCode
      ? `Authenticated via single-use backup recovery code (session ${session.id}).`
      : `Authenticated via RFC 6238 TOTP code (session ${session.id}).`,
  });

  return sendSuccess(res, {
    user: securityStore.toPublicUser(user),
    sessionId: session.id,
    usedRecoveryCode: check.usedRecoveryCode,
  });
}

/**
 * POST /api/auth/logout
 */
export async function logout(req: Request, res: Response) {
  if (req.auth) {
    securityStore.revokeSessionById(req.auth.session.id, req.auth.user.id);
    securityStore.recordAudit({
      actorUserId: req.auth.user.id,
      actorEmail: req.auth.user.email,
      actorRole: req.auth.role.key,
      action: 'LOGOUT',
      outcome: 'SUCCESS',
      resource: 'POST /api/auth/logout',
      targetUserId: req.auth.user.id,
      ipAddress: req.auth.ipAddress,
      userAgent: req.auth.userAgent,
      details: `Revoked session ${req.auth.session.id} on logout.`,
    });
  }

  clearSessionCookie(res);
  return sendSuccess(res, { message: 'Signed out successfully.' });
}

/**
 * GET /api/auth/me
 */
export async function getMe(req: Request, res: Response) {
  if (!req.auth) {
    throw new AuthenticationError('Not authenticated.');
  }

  const mfa = securityStore.getMfaStatus(req.auth.user.id);
  return sendSuccess(res, {
    user: securityStore.toPublicUser(req.auth.user),
    sessionId: req.auth.session.id,
    sessionExpiresAt: req.auth.session.expiresAt,
    mfa,
  });
}

/**
 * POST /api/auth/forgot-password
 * Generates a cryptographically secure, expiring, single-use reset token (hashed at rest).
 */
export async function forgotPassword(req: Request, res: Response) {
  const email = sanitizeNonEmptyString(req.body?.email, 120);
  if (!email || !isValidEmail(email)) {
    throw new ValidationError('Please provide a valid email address.');
  }

  const ipAddress = getClientIp(req);
  const userAgent = getUserAgent(req);
  const user = securityStore.findUserByIdentifier(email);

  let devPreviewToken: string | undefined;
  let expiresAt: string | undefined;

  if (user && user.status !== 'deactivated') {
    const issued = securityStore.issuePasswordResetToken(user.id);
    expiresAt = issued.expiresAt;
    if (env.nodeEnv !== 'production' && !env.smtp.configured) {
      devPreviewToken = issued.rawToken;
    }

    securityStore.recordAudit({
      actorUserId: user.id,
      actorEmail: user.email,
      actorRole: user.roleKey,
      action: 'PASSWORD_RESET_REQUESTED',
      outcome: 'SUCCESS',
      resource: 'POST /api/auth/forgot-password',
      targetUserId: user.id,
      ipAddress,
      userAgent,
      details: `Issued single-use password reset token expiring at ${issued.expiresAt}.`,
    });
  }

  // Always return a generic message to avoid leaking whether an email exists
  return sendSuccess(res, {
    message: 'If an account matches that email, password reset instructions have been issued.',
    deliveryMode: env.smtp.configured ? 'smtp' : 'development_preview',
    ...(expiresAt ? { expiresAt } : {}),
    ...(devPreviewToken ? { devPreviewToken } : {}),
  });
}

/**
 * POST /api/auth/reset-password
 * Consumes a single-use reset token, updates the scrypt password hash, and revokes all active sessions.
 */
export async function resetPassword(req: Request, res: Response) {
  const token = sanitizeNonEmptyString(req.body?.token, 200);
  const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';

  if (!token) {
    throw new ValidationError('Reset token is required.');
  }
  const passwordIssue = validatePasswordStrength(newPassword);
  if (passwordIssue) {
    throw new ValidationError(passwordIssue, { newPassword: passwordIssue });
  }

  const user = securityStore.consumePasswordResetToken(token);
  if (!user) {
    throw new AuthenticationError('Password reset token is invalid, expired, or already used.');
  }

  securityStore.updateUserPassword(user.id, hashPassword(newPassword));
  const revokedCount = securityStore.revokeAllUserSessions(user.id);
  clearSessionCookie(res);

  securityStore.recordAudit({
    actorUserId: user.id,
    actorEmail: user.email,
    actorRole: user.roleKey,
    action: 'PASSWORD_RESET_COMPLETED',
    outcome: 'SUCCESS',
    resource: 'POST /api/auth/reset-password',
    targetUserId: user.id,
    ipAddress: getClientIp(req),
    userAgent: getUserAgent(req),
    details: `Password reset via single-use token; revoked ${revokedCount} active session(s).`,
  });

  return sendSuccess(res, {
    message: 'Password has been reset and all previous sessions were revoked. You may now sign in.',
  });
}

/**
 * POST /api/auth/verify-email
 */
export async function verifyEmail(req: Request, res: Response) {
  const token = sanitizeNonEmptyString(req.body?.token, 200);
  if (!token) {
    throw new ValidationError('Verification token is required.');
  }

  const user = securityStore.consumeEmailVerificationToken(token);
  if (!user) {
    throw new AuthenticationError('Email verification token is invalid, expired, or already used.');
  }

  securityStore.recordAudit({
    actorUserId: user.id,
    actorEmail: user.email,
    actorRole: user.roleKey,
    action: 'EMAIL_VERIFIED',
    outcome: 'SUCCESS',
    resource: 'POST /api/auth/verify-email',
    targetUserId: user.id,
    ipAddress: getClientIp(req),
    userAgent: getUserAgent(req),
    details: 'Confirmed account email ownership via single-use verification token.',
  });

  return sendSuccess(res, {
    message: 'Email address verified successfully.',
    user: securityStore.toPublicUser(user),
  });
}

/**
 * POST /api/auth/resend-verification
 */
export async function resendVerification(req: Request, res: Response) {
  const user = req.auth!.user;
  if (user.emailVerified) {
    return sendSuccess(res, {
      message: 'Your email address is already verified.',
      alreadyVerified: true,
    });
  }

  const verification = securityStore.issueEmailVerificationToken(user.id);
  securityStore.recordAudit({
    actorUserId: user.id,
    actorEmail: user.email,
    actorRole: req.auth!.role.key,
    action: 'EMAIL_VERIFICATION_SENT',
    outcome: 'SUCCESS',
    resource: 'POST /api/auth/resend-verification',
    targetUserId: user.id,
    ipAddress: req.auth!.ipAddress,
    userAgent: req.auth!.userAgent,
    details: 'Issued new email verification token.',
  });

  return sendSuccess(res, {
    message: 'A new email verification token has been issued.',
    expiresAt: verification.expiresAt,
    deliveryMode: env.smtp.configured ? 'smtp' : 'development_preview',
    ...(env.nodeEnv !== 'production' && !env.smtp.configured
      ? { devPreviewToken: verification.rawToken }
      : {}),
  });
}

/**
 * GET /api/auth/sessions
 */
export async function listSessions(req: Request, res: Response) {
  const sessions = securityStore.listUserSessions(req.auth!.user.id).map((s) => ({
    id: s.id,
    ipAddress: s.ipAddress,
    userAgent: s.userAgent,
    createdAt: s.createdAt,
    lastActiveAt: s.lastActiveAt,
    expiresAt: s.expiresAt,
    isCurrent: s.id === req.auth!.session.id,
  }));

  return sendSuccess(res, { sessions });
}

/**
 * DELETE /api/auth/sessions/:sessionId
 */
export async function revokeSession(req: Request, res: Response) {
  const sessionId = sanitizeNonEmptyString(req.params.sessionId, 80);
  if (!sessionId) {
    throw new ValidationError('Session ID is required.');
  }

  const revoked = securityStore.revokeSessionById(sessionId, req.auth!.user.id);
  if (!revoked) {
    throw new AuthorizationError('Session not found or does not belong to your account.');
  }

  const revokedCurrent = sessionId === req.auth!.session.id;
  if (revokedCurrent) {
    clearSessionCookie(res);
  }

  securityStore.recordAudit({
    actorUserId: req.auth!.user.id,
    actorEmail: req.auth!.user.email,
    actorRole: req.auth!.role.key,
    action: 'SESSION_REVOKED',
    outcome: 'SUCCESS',
    resource: `DELETE /api/auth/sessions/${sessionId}`,
    targetUserId: req.auth!.user.id,
    ipAddress: req.auth!.ipAddress,
    userAgent: req.auth!.userAgent,
    details: `Revoked active session ${sessionId}${revokedCurrent ? ' (current session)' : ''}.`,
  });

  return sendSuccess(res, {
    message: 'Session revoked successfully.',
    revokedCurrent,
  });
}

/**
 * POST /api/auth/sessions/revoke-others
 */
export async function revokeOtherSessions(req: Request, res: Response) {
  const count = securityStore.revokeOtherSessions(req.auth!.user.id, req.auth!.session.id);

  securityStore.recordAudit({
    actorUserId: req.auth!.user.id,
    actorEmail: req.auth!.user.email,
    actorRole: req.auth!.role.key,
    action: 'SESSIONS_REVOKED_OTHERS',
    outcome: 'SUCCESS',
    resource: 'POST /api/auth/sessions/revoke-others',
    targetUserId: req.auth!.user.id,
    ipAddress: req.auth!.ipAddress,
    userAgent: req.auth!.userAgent,
    details: `Revoked ${count} other active session(s).`,
  });

  return sendSuccess(res, {
    message: `Revoked ${count} other active session(s).`,
    revokedCount: count,
  });
}

/**
 * PATCH /api/auth/profile
 */
export async function updateProfile(req: Request, res: Response) {
  const fullName =
    req.body?.fullName !== undefined ? sanitizeNonEmptyString(req.body.fullName, 100) : undefined;
  const phone =
    req.body?.phone !== undefined ? sanitizeNonEmptyString(req.body.phone, 25) || '' : undefined;
  const department =
    req.body?.department !== undefined ? String(req.body.department).slice(0, 100) : undefined;
  const organizationName =
    req.body?.organizationName !== undefined
      ? String(req.body.organizationName).slice(0, 120)
      : undefined;

  if (fullName === null || (fullName !== undefined && fullName.length < 2)) {
    throw new ValidationError('Full name must be at least 2 characters.');
  }

  // Strictly ignore role/status/permissions if sent to profile update
  const updated = securityStore.updateUserProfile(req.auth!.user.id, {
    fullName: fullName ?? undefined,
    phone,
    department,
    organizationName,
  });

  securityStore.recordAudit({
    actorUserId: req.auth!.user.id,
    actorEmail: req.auth!.user.email,
    actorRole: req.auth!.role.key,
    action: 'PROFILE_UPDATED',
    outcome: 'SUCCESS',
    resource: 'PATCH /api/auth/profile',
    targetUserId: req.auth!.user.id,
    ipAddress: req.auth!.ipAddress,
    userAgent: req.auth!.userAgent,
    details: 'Updated personal profile details.',
  });

  return sendSuccess(res, {
    message: 'Profile updated successfully.',
    user: securityStore.toPublicUser(updated!),
  });
}

/**
 * POST /api/auth/change-password
 */
export async function changePassword(req: Request, res: Response) {
  const currentPassword = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
  const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';

  if (!currentPassword) {
    throw new ValidationError('Current password is required.');
  }
  const passwordIssue = validatePasswordStrength(newPassword);
  if (passwordIssue) {
    throw new ValidationError(passwordIssue, { newPassword: passwordIssue });
  }

  const user = req.auth!.user;
  if (!verifyPassword(currentPassword, user.passwordHash)) {
    throw new AuthenticationError('Current password is incorrect.');
  }

  securityStore.updateUserPassword(user.id, hashPassword(newPassword));
  const revokedCount = securityStore.revokeOtherSessions(user.id, req.auth!.session.id);

  securityStore.recordAudit({
    actorUserId: user.id,
    actorEmail: user.email,
    actorRole: req.auth!.role.key,
    action: 'PASSWORD_CHANGED',
    outcome: 'SUCCESS',
    resource: 'POST /api/auth/change-password',
    targetUserId: user.id,
    ipAddress: req.auth!.ipAddress,
    userAgent: req.auth!.userAgent,
    details: `Changed account password and revoked ${revokedCount} other session(s).`,
  });

  return sendSuccess(res, {
    message: 'Password updated successfully. All other active sessions have been revoked.',
    revokedOtherSessions: revokedCount,
  });
}

/**
 * POST /api/auth/mfa/setup
 */
export async function setupMfa(req: Request, res: Response) {
  const user = req.auth!.user;
  const { secret } = securityStore.beginMfaEnrollment(user.id);
  const otpauthUri = buildOtpAuthUri(user.email, secret, 'BloodConnect');

  return sendSuccess(res, {
    secret,
    otpauthUri,
    issuer: 'BloodConnect',
    account: user.email,
    message: 'Add this secret to your authenticator app and confirm with a 6-digit TOTP code.',
  });
}

/**
 * POST /api/auth/mfa/confirm
 */
export async function confirmMfa(req: Request, res: Response) {
  const code = sanitizeNonEmptyString(req.body?.code, 12);
  if (!code) {
    throw new ValidationError('6-digit authenticator code is required.');
  }

  const user = req.auth!.user;
  const result = securityStore.confirmMfaEnrollment(user.id, code);
  if (!result.success) {
    throw new AuthenticationError('Invalid 6-digit verification code. Ensure your device clock is synced.');
  }

  securityStore.recordAudit({
    actorUserId: user.id,
    actorEmail: user.email,
    actorRole: req.auth!.role.key,
    action: 'MFA_ENABLED',
    outcome: 'SUCCESS',
    resource: 'POST /api/auth/mfa/confirm',
    targetUserId: user.id,
    ipAddress: req.auth!.ipAddress,
    userAgent: req.auth!.userAgent,
    details: 'Enabled RFC 6238 TOTP Multi-Factor Authentication and issued 8 backup recovery codes.',
  });

  return sendSuccess(res, {
    message: 'Multi-Factor Authentication is now enabled. Store your backup recovery codes securely.',
    recoveryCodes: result.recoveryCodes,
    user: securityStore.toPublicUser(user),
  });
}

/**
 * POST /api/auth/mfa/disable
 */
export async function disableMfa(req: Request, res: Response) {
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const code = sanitizeNonEmptyString(req.body?.code, 24);

  if (!password || !code) {
    throw new ValidationError('Current password and an authenticator or recovery code are required.');
  }

  const user = req.auth!.user;
  if (!verifyPassword(password, user.passwordHash)) {
    throw new AuthenticationError('Current password is incorrect.');
  }

  const check = securityStore.verifyUserMfaCode(user.id, code);
  if (!check.verified) {
    throw new AuthenticationError('Invalid authenticator code or backup recovery code.');
  }

  securityStore.disableMfa(user.id);

  securityStore.recordAudit({
    actorUserId: user.id,
    actorEmail: user.email,
    actorRole: req.auth!.role.key,
    action: 'MFA_DISABLED',
    outcome: 'WARNING',
    resource: 'POST /api/auth/mfa/disable',
    targetUserId: user.id,
    ipAddress: req.auth!.ipAddress,
    userAgent: req.auth!.userAgent,
    details: 'Disabled TOTP Multi-Factor Authentication on account.',
  });

  return sendSuccess(res, {
    message: 'Multi-Factor Authentication has been disabled.',
    user: securityStore.toPublicUser(user),
  });
}
