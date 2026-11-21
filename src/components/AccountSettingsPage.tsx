import { useState, useEffect, FormEvent } from 'react';
import {
  User as UserIcon,
  ShieldCheck,
  Lock,
  Smartphone,
  Monitor,
  CheckCircle2,
  AlertCircle,
  MailCheck,
  LogOut,
  KeyRound,
  Copy,
  Check,
  RefreshCw,
} from 'lucide-react';
import { User, UserSessionInfo } from '../types';
import { authApi } from '../services/authApi';
import { ApiClientError } from '../services/apiClient';
import { UnderlineTabs } from './ui/UnderlineTabs';

interface AccountSettingsPageProps {
  currentUser: User;
  onUserUpdated: (user: User) => void;
  onForceLogout: () => void;
  onNotify: (message: string) => void;
}

export default function AccountSettingsPage({
  currentUser,
  onUserUpdated,
  onForceLogout,
  onNotify,
}: AccountSettingsPageProps) {
  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'sessions' | 'permissions'>(
    'profile'
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Profile Form
  const [fullName, setFullName] = useState(currentUser.fullName);
  const [phone, setPhone] = useState(currentUser.phone || '');
  const [department, setDepartment] = useState(currentUser.department || '');
  const [organizationName, setOrganizationName] = useState(currentUser.organizationName || '');
  const [savingProfile, setSavingProfile] = useState(false);

  // Email verification
  const [verifyToken, setVerifyToken] = useState('');
  const [devVerifyPreview, setDevVerifyPreview] = useState<string | null>(null);
  const [verifyingEmail, setVerifyingEmail] = useState(false);

  // Password Change
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  // MFA Setup / Disable
  const [mfaSetup, setMfaSetup] = useState<{ secret: string; otpauthUri: string } | null>(null);
  const [mfaVerifyCode, setMfaVerifyCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [disableMfaPassword, setDisableMfaPassword] = useState('');
  const [disableMfaCode, setDisableMfaCode] = useState('');
  const [mfaLoading, setMfaLoading] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);

  // Sessions
  const [sessions, setSessions] = useState<UserSessionInfo[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);

  const clearBanners = () => {
    setErrorMsg(null);
    setSuccessMsg(null);
  };

  const fetchSessions = async () => {
    setLoadingSessions(true);
    try {
      const res = await authApi.listSessions();
      setSessions(res.sessions);
    } catch (err: unknown) {
      setErrorMsg(err instanceof ApiClientError ? err.message : 'Unable to load active sessions.');
    } finally {
      setLoadingSessions(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'sessions') {
      fetchSessions();
    }
  }, [activeTab]);

  const handleSaveProfile = async (e: FormEvent) => {
    e.preventDefault();
    clearBanners();
    setSavingProfile(true);
    try {
      const res = await authApi.updateProfile({
        fullName: fullName.trim(),
        phone: phone.trim(),
        department: department.trim(),
        organizationName: organizationName.trim(),
      });
      onUserUpdated(res.user);
      setSuccessMsg(res.message);
      onNotify('Profile settings saved.');
    } catch (err: unknown) {
      setErrorMsg(err instanceof ApiClientError ? err.message : 'Failed to update profile.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleResendVerification = async () => {
    clearBanners();
    setVerifyingEmail(true);
    try {
      const res = await authApi.resendVerification();
      setSuccessMsg(res.message);
      if (res.devPreviewToken) {
        setDevVerifyPreview(res.devPreviewToken);
        setVerifyToken(res.devPreviewToken);
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof ApiClientError ? err.message : 'Failed to issue verification token.');
    } finally {
      setVerifyingEmail(false);
    }
  };

  const handleConfirmEmailVerification = async (e: FormEvent) => {
    e.preventDefault();
    clearBanners();
    if (!verifyToken.trim()) return;
    setVerifyingEmail(true);
    try {
      const res = await authApi.verifyEmail(verifyToken.trim());
      onUserUpdated(res.user);
      setDevVerifyPreview(null);
      setVerifyToken('');
      setSuccessMsg(res.message);
      onNotify('Email address verified.');
    } catch (err: unknown) {
      setErrorMsg(err instanceof ApiClientError ? err.message : 'Email verification failed.');
    } finally {
      setVerifyingEmail(false);
    }
  };

  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    clearBanners();
    if (newPassword !== confirmNewPassword) {
      setErrorMsg('New passwords do not match.');
      return;
    }
    setChangingPassword(true);
    try {
      const res = await authApi.changePassword({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setSuccessMsg(res.message);
      onNotify('Password updated and other sessions revoked.');
    } catch (err: unknown) {
      setErrorMsg(err instanceof ApiClientError ? err.message : 'Unable to change password.');
    } finally {
      setChangingPassword(false);
    }
  };

  const handleBeginMfa = async () => {
    clearBanners();
    setMfaLoading(true);
    try {
      const res = await authApi.setupMfa();
      setMfaSetup({ secret: res.secret, otpauthUri: res.otpauthUri });
      setRecoveryCodes(null);
    } catch (err: unknown) {
      setErrorMsg(err instanceof ApiClientError ? err.message : 'Failed to initialize MFA setup.');
    } finally {
      setMfaLoading(false);
    }
  };

  const handleConfirmMfa = async (e: FormEvent) => {
    e.preventDefault();
    clearBanners();
    setMfaLoading(true);
    try {
      const res = await authApi.confirmMfa(mfaVerifyCode.trim());
      onUserUpdated(res.user);
      setRecoveryCodes(res.recoveryCodes);
      setMfaSetup(null);
      setMfaVerifyCode('');
      setSuccessMsg(res.message);
      onNotify('Multi-Factor Authentication enabled.');
    } catch (err: unknown) {
      setErrorMsg(err instanceof ApiClientError ? err.message : 'Invalid 6-digit TOTP code.');
    } finally {
      setMfaLoading(false);
    }
  };

  const handleDisableMfa = async (e: FormEvent) => {
    e.preventDefault();
    clearBanners();
    setMfaLoading(true);
    try {
      const res = await authApi.disableMfa({
        password: disableMfaPassword,
        code: disableMfaCode.trim(),
      });
      onUserUpdated(res.user);
      setDisableMfaPassword('');
      setDisableMfaCode('');
      setRecoveryCodes(null);
      setSuccessMsg(res.message);
      onNotify('Multi-Factor Authentication disabled.');
    } catch (err: unknown) {
      setErrorMsg(err instanceof ApiClientError ? err.message : 'Unable to disable MFA.');
    } finally {
      setMfaLoading(false);
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    clearBanners();
    try {
      const res = await authApi.revokeSession(sessionId);
      if (res.revokedCurrent) {
        onForceLogout();
        return;
      }
      setSuccessMsg(res.message);
      fetchSessions();
    } catch (err: unknown) {
      setErrorMsg(err instanceof ApiClientError ? err.message : 'Unable to revoke session.');
    }
  };

  const handleRevokeOthers = async () => {
    clearBanners();
    try {
      const res = await authApi.revokeOtherSessions();
      setSuccessMsg(res.message);
      fetchSessions();
    } catch (err: unknown) {
      setErrorMsg(err instanceof ApiClientError ? err.message : 'Unable to revoke other sessions.');
    }
  };

  const permissions = currentUser.permissions ?? [];

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <p className="text-xs font-medium text-rose-700">Identity &amp; Account Governance</p>
          <h1 className="text-2xl font-display font-bold text-slate-950 tracking-tight">
            Account &amp; Security Settings
          </h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
            <span>{currentUser.email}</span>
            <span className="text-slate-300">·</span>
            <span>
              Role: <strong className="text-slate-900">{currentUser.roleName || currentUser.role}</strong>{' '}
              (Rank {currentUser.authorityRank ?? 10})
            </span>
            <span className="text-slate-300">·</span>
            <span className={currentUser.mfaEnabled ? 'text-emerald-700 font-semibold' : 'text-slate-500'}>
              MFA {currentUser.mfaEnabled ? 'Enabled (TOTP)' : 'Not Enabled'}
            </span>
          </div>
        </div>
        <span
          className={`px-3 py-1 rounded-lg text-xs font-semibold self-start sm:self-center ${
            currentUser.emailVerified
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-amber-50 text-amber-800 border border-amber-200'
          }`}
        >
          {currentUser.emailVerified ? 'Email Verified' : 'Email Unverified'}
        </span>
      </div>

      <UnderlineTabs
        activeTab={activeTab}
        onChange={(tab) => {
          setActiveTab(tab);
          clearBanners();
        }}
        tabs={[
          { id: 'profile', label: 'Profile & Email' },
          { id: 'security', label: 'Password & MFA' },
          { id: 'sessions', label: 'Active Sessions' },
          { id: 'permissions', label: `Role & Permissions (${permissions.length})` },
        ]}
      />

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

      {/* TAB 1: PROFILE & EMAIL VERIFICATION */}
      {activeTab === 'profile' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form
            onSubmit={handleSaveProfile}
            className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-6 space-y-4"
          >
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <UserIcon className="w-4 h-4 text-rose-700" />
              <span>Personal &amp; Department Details</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:border-rose-700"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Phone Number</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:border-rose-700"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Department</label>
                <input
                  type="text"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  placeholder="e.g. Transfusion Medicine"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:border-rose-700"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Organization</label>
                <input
                  type="text"
                  value={organizationName}
                  onChange={(e) => setOrganizationName(e.target.value)}
                  placeholder="Hospital or network name"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:border-rose-700"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={savingProfile}
              className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold disabled:opacity-50 cursor-pointer"
            >
              {savingProfile ? 'Saving Changes...' : 'Save Profile'}
            </button>
          </form>

          <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <MailCheck className="w-4 h-4 text-rose-700" />
              <span>Email Verification</span>
            </div>

            {currentUser.emailVerified ? (
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 space-y-1">
                <div className="font-semibold">Verified Account Email</div>
                <p className="text-emerald-800">
                  <strong>{currentUser.email}</strong> has been verified on the server.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-slate-600">
                  Your email address <strong>{currentUser.email}</strong> is not yet verified. Issue a
                  single-use verification token below to confirm ownership.
                </p>
                <button
                  type="button"
                  onClick={handleResendVerification}
                  disabled={verifyingEmail}
                  className="px-3.5 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-800 hover:bg-slate-50 cursor-pointer"
                >
                  Generate Verification Token
                </button>

                {devVerifyPreview && (
                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-[11px] font-mono break-all text-slate-800">
                    Dev Token: {devVerifyPreview}
                  </div>
                )}

                <form onSubmit={handleConfirmEmailVerification} className="space-y-2.5 pt-1">
                  <input
                    type="text"
                    value={verifyToken}
                    onChange={(e) => setVerifyToken(e.target.value)}
                    placeholder="Paste verification token"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-mono"
                  />
                  <button
                    type="submit"
                    disabled={verifyingEmail || !verifyToken.trim()}
                    className="w-full py-2 rounded-xl bg-rose-700 hover:bg-rose-800 text-white text-xs font-semibold disabled:opacity-50 cursor-pointer"
                  >
                    Confirm Email Verification
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: PASSWORD & TOTP MFA */}
      {activeTab === 'security' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form
            onSubmit={handleChangePassword}
            className="lg:col-span-6 bg-white rounded-2xl border border-slate-200 p-6 space-y-4"
          >
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <Lock className="w-4 h-4 text-rose-700" />
              <span>Change Account Password</span>
            </div>
            <p className="text-xs text-slate-500">
              Passwords are hashed with scrypt (per-user salt). Updating your password revokes all other
              active sessions automatically.
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Current Password
                </label>
                <input
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  New Password (8+ chars, upper, lower, number)
                </label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  required
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={changingPassword}
              className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold disabled:opacity-50 cursor-pointer"
            >
              {changingPassword ? 'Updating...' : 'Update Password'}
            </button>
          </form>

          <div className="lg:col-span-6 bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <Smartphone className="w-4 h-4 text-rose-700" />
                <span>Multi-Factor Authentication (RFC 6238 TOTP)</span>
              </div>
              <span
                className={`px-2.5 py-0.5 rounded-md text-[11px] font-semibold ${
                  currentUser.mfaEnabled
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                {currentUser.mfaEnabled ? 'Active' : 'Disabled'}
              </span>
            </div>

            {recoveryCodes && (
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 space-y-2 text-xs">
                <div className="font-bold text-amber-950">
                  Save Your Single-Use Backup Recovery Codes
                </div>
                <p className="text-amber-900">
                  These codes are shown only once (hashed with SHA-256 on the server):
                </p>
                <div className="grid grid-cols-2 gap-1.5 font-mono text-[11px]">
                  {recoveryCodes.map((code) => (
                    <div
                      key={code}
                      className="bg-white border border-amber-200 rounded px-2.5 py-1 text-center font-semibold text-slate-900"
                    >
                      {code}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!currentUser.mfaEnabled ? (
              !mfaSetup ? (
                <div className="space-y-3">
                  <p className="text-xs text-slate-600">
                    Protect your account with time-based one-time passcodes (Google Authenticator, Authy,
                    or 1Password) plus 8 single-use backup recovery codes.
                  </p>
                  <button
                    type="button"
                    onClick={handleBeginMfa}
                    disabled={mfaLoading}
                    className="px-4 py-2 rounded-xl bg-rose-700 hover:bg-rose-800 text-white text-xs font-semibold disabled:opacity-50 cursor-pointer"
                  >
                    {mfaLoading ? 'Generating Secret...' : 'Set Up Authenticator App'}
                  </button>
                </div>
              ) : (
                <form onSubmit={handleConfirmMfa} className="space-y-3">
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
                    <div className="font-semibold text-slate-900">1. Add Secret Key to Authenticator App</div>
                    <div className="flex items-center justify-between gap-2 bg-white px-3 py-2 rounded-lg border border-slate-200 font-mono text-xs text-slate-900">
                      <span className="truncate">{mfaSetup.secret}</span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard?.writeText(mfaSetup.secret).catch(() => {});
                          setCopiedSecret(true);
                          setTimeout(() => setCopiedSecret(false), 1800);
                        }}
                        className="inline-flex items-center gap-1 text-rose-700 font-sans font-semibold shrink-0 cursor-pointer"
                      >
                        {copiedSecret ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedSecret ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                    <div className="text-[11px] text-slate-500 break-all font-mono">
                      URI: {mfaSetup.otpauthUri}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      2. Enter 6-Digit Verification Code
                    </label>
                    <input
                      type="text"
                      required
                      value={mfaVerifyCode}
                      onChange={(e) => setMfaVerifyCode(e.target.value)}
                      placeholder="123456"
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-mono tracking-widest"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="submit"
                      disabled={mfaLoading}
                      className="flex-1 py-2 rounded-xl bg-rose-700 hover:bg-rose-800 text-white text-xs font-semibold disabled:opacity-50 cursor-pointer"
                    >
                      Verify &amp; Enable MFA
                    </button>
                    <button
                      type="button"
                      onClick={() => setMfaSetup(null)}
                      className="px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )
            ) : (
              <form onSubmit={handleDisableMfa} className="space-y-3">
                <p className="text-xs text-slate-600">
                  MFA is active. To disable TOTP protection, confirm both your password and a valid
                  authenticator or recovery code.
                </p>
                <input
                  type="password"
                  required
                  value={disableMfaPassword}
                  onChange={(e) => setDisableMfaPassword(e.target.value)}
                  placeholder="Current password"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs"
                />
                <input
                  type="text"
                  required
                  value={disableMfaCode}
                  onChange={(e) => setDisableMfaCode(e.target.value)}
                  placeholder="6-digit TOTP or recovery code"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-mono"
                />
                <button
                  type="submit"
                  disabled={mfaLoading}
                  className="px-4 py-2 rounded-xl border border-rose-300 text-rose-700 hover:bg-rose-50 text-xs font-semibold cursor-pointer"
                >
                  Disable MFA
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: ACTIVE SESSIONS */}
      {activeTab === 'sessions' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Monitor className="w-4 h-4 text-rose-700" />
                <span>Active Server-Managed Sessions</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Session tokens are stored as SHA-256 hashes in the backend store and delivered via HttpOnly cookies.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={fetchSessions}
                className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Refresh</span>
              </button>
              <button
                type="button"
                onClick={handleRevokeOthers}
                className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer"
              >
                Revoke All Other Sessions
              </button>
            </div>
          </div>

          {loadingSessions ? (
            <div className="py-8 text-center text-xs text-slate-500">Loading active sessions...</div>
          ) : (
            <div className="divide-y divide-slate-200 border border-slate-200 rounded-xl overflow-hidden">
              {sessions.map((s) => (
                <div
                  key={s.id}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-900 font-mono">{s.ipAddress}</span>
                      {s.isCurrent && (
                        <span className="px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 text-[10px] font-semibold">
                          Current Session
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-600 truncate max-w-xl">{s.userAgent}</div>
                    <div className="text-[11px] text-slate-500">
                      Started {new Date(s.createdAt).toLocaleString()} · Expires{' '}
                      {new Date(s.expiresAt).toLocaleString()}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRevokeSession(s.id)}
                    className="px-3 py-1.5 rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50 text-xs font-semibold inline-flex items-center gap-1.5 self-start sm:self-center cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>{s.isCurrent ? 'Sign Out' : 'Revoke'}</span>
                  </button>
                </div>
              ))}
              {sessions.length === 0 && (
                <div className="p-6 text-center text-xs text-slate-500">No active sessions found.</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: SERVER-RESOLVED ROLE & PERMISSIONS */}
      {activeTab === 'permissions' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200">
            <div>
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-rose-700" />
                <span>Server-Resolved Authority Profile</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Every protected API endpoint verifies these permissions on the server on each request.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="px-3 py-1 rounded-lg bg-slate-900 text-white font-semibold">
                {currentUser.roleName || currentUser.role}
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 font-mono">
                {currentUser.roleKey || currentUser.role} · Rank {currentUser.authorityRank ?? 10}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
            {permissions.map((perm) => (
              <div
                key={perm}
                className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 flex items-center gap-2 text-xs"
              >
                <KeyRound className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span className="font-mono text-slate-800">{perm}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
