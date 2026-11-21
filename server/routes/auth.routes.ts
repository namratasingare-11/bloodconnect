import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { requireAuth, requirePermission } from '../middleware/auth.middleware';
import {
  changePassword,
  confirmMfa,
  disableMfa,
  forgotPassword,
  getMe,
  listSessions,
  login,
  logout,
  register,
  resendVerification,
  resetPassword,
  revokeOtherSessions,
  revokeSession,
  setupMfa,
  updateProfile,
  verifyEmail,
  verifyMfaLogin,
} from '../controllers/auth.controller';

const router = Router();

// Public authentication lifecycle endpoints
router.post('/register', asyncHandler(register));
router.post('/login', asyncHandler(login));
router.post('/mfa/verify-login', asyncHandler(verifyMfaLogin));
router.post('/logout', asyncHandler(logout));
router.post('/forgot-password', asyncHandler(forgotPassword));
router.post('/reset-password', asyncHandler(resetPassword));
router.post('/verify-email', asyncHandler(verifyEmail));

// Authenticated account, session & MFA management endpoints
router.get('/me', requireAuth, asyncHandler(getMe));
router.post('/resend-verification', requireAuth, asyncHandler(resendVerification));
router.patch('/profile', requirePermission('profile:update_own'), asyncHandler(updateProfile));
router.post('/change-password', requirePermission('profile:update_own'), asyncHandler(changePassword));

router.get('/sessions', requirePermission('sessions:manage_own'), asyncHandler(listSessions));
router.delete('/sessions/:sessionId', requirePermission('sessions:manage_own'), asyncHandler(revokeSession));
router.post('/sessions/revoke-others', requirePermission('sessions:manage_own'), asyncHandler(revokeOtherSessions));

router.post('/mfa/setup', requirePermission('mfa:manage_own'), asyncHandler(setupMfa));
router.post('/mfa/confirm', requirePermission('mfa:manage_own'), asyncHandler(confirmMfa));
router.post('/mfa/disable', requirePermission('mfa:manage_own'), asyncHandler(disableMfa));

export default router;
