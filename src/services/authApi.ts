import { apiClient } from './apiClient';
import { User, UserSessionInfo } from '../types';

export interface LoginResponse {
  success: boolean;
  mfaRequired?: boolean;
  challengeToken?: string;
  expiresAt?: string;
  message?: string;
  user?: User;
  sessionId?: string;
}

export interface RegisterResponse {
  success: boolean;
  message: string;
  user: User;
  sessionId: string;
  emailVerification: {
    required: boolean;
    expiresAt: string;
    deliveryMode: 'smtp' | 'development_preview';
    devPreviewToken?: string;
  };
}

export interface MeResponse {
  success: boolean;
  user: User;
  sessionId: string;
  sessionExpiresAt: string;
  mfa: {
    enabled: boolean;
    recoveryCodesRemaining: number;
    enabledAt?: string;
  };
}

export interface ForgotPasswordResponse {
  success: boolean;
  message: string;
  deliveryMode: 'smtp' | 'development_preview';
  expiresAt?: string;
  devPreviewToken?: string;
}

export interface MfaSetupResponse {
  success: boolean;
  secret: string;
  otpauthUri: string;
  issuer: string;
  account: string;
  message: string;
}

export interface MfaConfirmResponse {
  success: boolean;
  message: string;
  recoveryCodes: string[];
  user: User;
}

export const authApi = {
  login: (payload: { identifier: string; password: string; rememberMe?: boolean }) =>
    apiClient.post<LoginResponse>('/api/auth/login', payload),

  verifyMfaLogin: (payload: { challengeToken: string; code: string }) =>
    apiClient.post<{ success: boolean; user: User; sessionId: string; usedRecoveryCode?: boolean }>(
      '/api/auth/mfa/verify-login',
      payload
    ),

  register: (payload: {
    fullName: string;
    email: string;
    phone: string;
    password: string;
    department?: string;
    organizationName?: string;
  }) => apiClient.post<RegisterResponse>('/api/auth/register', payload),

  logout: () => apiClient.post<{ success: boolean; message: string }>('/api/auth/logout'),

  getMe: () => apiClient.get<MeResponse>('/api/auth/me'),

  forgotPassword: (email: string) =>
    apiClient.post<ForgotPasswordResponse>('/api/auth/forgot-password', { email }),

  resetPassword: (payload: { token: string; newPassword: string }) =>
    apiClient.post<{ success: boolean; message: string }>('/api/auth/reset-password', payload),

  verifyEmail: (token: string) =>
    apiClient.post<{ success: boolean; message: string; user: User }>('/api/auth/verify-email', {
      token,
    }),

  resendVerification: () =>
    apiClient.post<{
      success: boolean;
      message: string;
      alreadyVerified?: boolean;
      expiresAt?: string;
      deliveryMode?: 'smtp' | 'development_preview';
      devPreviewToken?: string;
    }>('/api/auth/resend-verification'),

  updateProfile: (payload: {
    fullName?: string;
    phone?: string;
    department?: string;
    organizationName?: string;
  }) => apiClient.patch<{ success: boolean; message: string; user: User }>('/api/auth/profile', payload),

  changePassword: (payload: { currentPassword: string; newPassword: string }) =>
    apiClient.post<{ success: boolean; message: string; revokedOtherSessions: number }>(
      '/api/auth/change-password',
      payload
    ),

  listSessions: () =>
    apiClient.get<{ success: boolean; sessions: UserSessionInfo[] }>('/api/auth/sessions'),

  revokeSession: (sessionId: string) =>
    apiClient.delete<{ success: boolean; message: string; revokedCurrent: boolean }>(
      `/api/auth/sessions/${encodeURIComponent(sessionId)}`
    ),

  revokeOtherSessions: () =>
    apiClient.post<{ success: boolean; message: string; revokedCount: number }>(
      '/api/auth/sessions/revoke-others'
    ),

  setupMfa: () => apiClient.post<MfaSetupResponse>('/api/auth/mfa/setup'),

  confirmMfa: (code: string) => apiClient.post<MfaConfirmResponse>('/api/auth/mfa/confirm', { code }),

  disableMfa: (payload: { password: string; code: string }) =>
    apiClient.post<{ success: boolean; message: string; user: User }>('/api/auth/mfa/disable', payload),
};
