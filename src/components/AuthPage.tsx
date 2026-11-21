import { useState, useEffect, FormEvent } from 'react';
import {
  Lock,
  Mail,
  User as UserIcon,
  Phone,
  Droplet,
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  ArrowRight,
  ShieldCheck,
  KeyRound,
  ArrowLeft,
  Smartphone,
  ShieldAlert,
  Copy,
  Check,
} from 'lucide-react';
import { User, UserRole, BloodGroup } from '../types';
import { authApi } from '../services/authApi';
import { ApiClientError } from '../services/apiClient';
import { db } from '../db/databaseStore';

interface AuthPageProps {
  initialMode?: 'sign_in' | 'sign_up';
  initialRole?: UserRole;
  contextNotice?: string | null;
  onLoginSuccess: (user: User) => void;
  onNavigateHome: () => void;
}

const DEMO_ACCOUNTS = [
  {
    label: 'Super Administrator',
    rank: 'Rank 100',
    identifier: 'superadmin@bloodconnect.org',
    desc: 'Full system & RBAC governance',
  },
  {
    label: 'Administrator',
    rank: 'Rank 80',
    identifier: 'admin@bloodconnect.org',
    desc: 'User lifecycle, DB & reports',
  },
  {
    label: 'Authority Officer',
    rank: 'Rank 65',
    identifier: 'officer@bloodconnect.org',
    desc: 'Inventory release & approvals',
  },
  {
    label: 'Department Manager',
    rank: 'Rank 50',
    identifier: 'manager@metrohealth.org',
    desc: 'Hospital transfusion desk',
  },
  {
    label: 'Moderator',
    rank: 'Rank 35',
    identifier: 'moderator@bloodconnect.org',
    desc: 'Donor verification & camps',
  },
  {
    label: 'Regular User (Donor)',
    rank: 'Rank 10',
    identifier: 'rahul.sharma@donor.bloodconnect.org',
    desc: 'Personal donor portal & slots',
  },
] as const;

export default function AuthPage({
  initialMode = 'sign_in',
  contextNotice,
  onLoginSuccess,
  onNavigateHome,
}: AuthPageProps) {
  const [mode, setMode] = useState<'sign_in' | 'sign_up' | 'forgot'>(initialMode);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  // Shared UI states
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [showDemoAccounts, setShowDemoAccounts] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);

  // Sign In state
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);

  // Two-stage MFA challenge state
  const [mfaChallengeToken, setMfaChallengeToken] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState('');

  // Sign Up state (strictly regular_user — server enforces least privilege)
  const [fullName, setFullName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [bloodGroup, setBloodGroup] = useState<BloodGroup>('O+');
  const [city, setCity] = useState('Mumbai');
  const [regPassword, setRegPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Post-registration email verification state
  const [pendingVerification, setPendingVerification] = useState<{
    user: User;
    devPreviewToken?: string;
  } | null>(null);
  const [verifyTokenInput, setVerifyTokenInput] = useState('');

  // Forgot & Reset Password state
  const [forgotEmail, setForgotEmail] = useState('');
  const [resetStep, setResetStep] = useState<'request' | 'confirm'>('request');
  const [resetTokenInput, setResetTokenInput] = useState('');
  const [devResetPreviewToken, setDevResetPreviewToken] = useState<string | null>(null);
  const [newResetPassword, setNewResetPassword] = useState('');

  const passwordStrength = (() => {
    let score = 0;
    if (regPassword.length >= 8) score += 1;
    if (/[A-Z]/.test(regPassword)) score += 1;
    if (/[0-9]/.test(regPassword)) score += 1;
    if (/[^A-Za-z0-9]/.test(regPassword)) score += 1;
    return score;
  })();

  const resetMessages = () => {
    setErrorMsg(null);
    setSuccessMsg(null);
  };

  const handleCopyToken = (token: string) => {
    navigator.clipboard?.writeText(token).catch(() => {});
    setCopiedToken(true);
    setTimeout(() => setCopiedToken(false), 1800);
  };

  const handleSignIn = async (e: FormEvent) => {
    e.preventDefault();
    resetMessages();

    if (!identifier.trim() || !password) {
      setErrorMsg('Please enter your email/username and password.');
      return;
    }

    setLoading(true);
    try {
      const res = await authApi.login({
        identifier: identifier.trim(),
        password,
        rememberMe,
      });

      if (res.mfaRequired && res.challengeToken) {
        setMfaChallengeToken(res.challengeToken);
        setMfaCode('');
        setSuccessMsg(res.message || 'Enter the 6-digit code from your authenticator app.');
        return;
      }

      if (res.user) {
        onLoginSuccess(res.user);
      }
    } catch (err: unknown) {
      const message =
        err instanceof ApiClientError
          ? err.message
          : 'Unable to sign in. Please verify your credentials.';
      setErrorMsg(message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyMfa = async (e: FormEvent) => {
    e.preventDefault();
    resetMessages();
    if (!mfaChallengeToken || !mfaCode.trim()) {
      setErrorMsg('Please enter your 6-digit authenticator code or backup recovery code.');
      return;
    }

    setLoading(true);
    try {
      const res = await authApi.verifyMfaLogin({
        challengeToken: mfaChallengeToken,
        code: mfaCode.trim(),
      });
      setMfaChallengeToken(null);
      onLoginSuccess(res.user);
    } catch (err: unknown) {
      setErrorMsg(err instanceof ApiClientError ? err.message : 'Invalid verification code.');
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e: FormEvent) => {
    e.preventDefault();
    resetMessages();

    if (fullName.trim().length < 2) {
      setErrorMsg('Please enter your full name (minimum 2 characters).');
      return;
    }
    if (regPassword !== confirmPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const res = await authApi.register({
        fullName: fullName.trim(),
        email: regEmail.trim(),
        phone: phone.trim(),
        password: regPassword,
        department: 'Voluntary Donor Network',
      });

      // Mirror donor profile into local clinical registry so DonorDashboard stats render cleanly
      try {
        db.registerDonor({
          userId: res.user.id,
          fullName: fullName.trim(),
          email: regEmail.trim().toLowerCase(),
          phone: phone.trim() || '+91 98000 00000',
          dateOfBirth: '1996-01-15',
          gender: 'Other',
          bloodGroup,
          address: city.trim() || 'Mumbai',
          city: city.trim() || 'Mumbai',
          state: 'Maharashtra',
          pincode: '400001',
          weightKg: 65,
          eligibilityStatus: 'Eligible',
          availability: 'Available',
          consentAccepted: true,
        });
      } catch {
        // Non-fatal if donor record already exists
      }

      setPendingVerification({
        user: res.user,
        devPreviewToken: res.emailVerification.devPreviewToken,
      });
      setVerifyTokenInput(res.emailVerification.devPreviewToken || '');
      setSuccessMsg(res.message);
    } catch (err: unknown) {
      setErrorMsg(err instanceof ApiClientError ? err.message : 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyEmailNow = async (e: FormEvent) => {
    e.preventDefault();
    resetMessages();
    if (!verifyTokenInput.trim()) {
      setErrorMsg('Enter your verification token.');
      return;
    }

    setLoading(true);
    try {
      const res = await authApi.verifyEmail(verifyTokenInput.trim());
      setSuccessMsg(res.message);
      onLoginSuccess(res.user);
    } catch (err: unknown) {
      setErrorMsg(err instanceof ApiClientError ? err.message : 'Verification failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPasswordRequest = async (e: FormEvent) => {
    e.preventDefault();
    resetMessages();
    if (!forgotEmail.trim()) {
      setErrorMsg('Please enter your account email address.');
      return;
    }

    setLoading(true);
    try {
      const res = await authApi.forgotPassword(forgotEmail.trim());
      setSuccessMsg(res.message);
      if (res.devPreviewToken) {
        setDevResetPreviewToken(res.devPreviewToken);
        setResetTokenInput(res.devPreviewToken);
      }
      setResetStep('confirm');
    } catch (err: unknown) {
      setErrorMsg(err instanceof ApiClientError ? err.message : 'Unable to issue reset request.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPasswordConfirm = async (e: FormEvent) => {
    e.preventDefault();
    resetMessages();
    if (!resetTokenInput.trim() || !newResetPassword) {
      setErrorMsg('Reset token and a new strong password are required.');
      return;
    }

    setLoading(true);
    try {
      const res = await authApi.resetPassword({
        token: resetTokenInput.trim(),
        newPassword: newResetPassword,
      });
      setSuccessMsg(res.message);
      setDevResetPreviewToken(null);
      setResetTokenInput('');
      setNewResetPassword('');
      setResetStep('request');
      setMode('sign_in');
      setIdentifier(forgotEmail.trim());
      setPassword('');
    } catch (err: unknown) {
      setErrorMsg(err instanceof ApiClientError ? err.message : 'Password reset failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-[#F8FAFC] py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onNavigateHome}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-950 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Home</span>
          </button>
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Server-Verified Session &amp; RBAC</span>
          </span>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 sm:p-8">
          <div className="mb-6">
            <div className="flex items-center gap-2.5 mb-2">
              <span className="w-9 h-9 rounded-xl bg-rose-700 text-white flex items-center justify-center">
                <Droplet className="w-4 h-4 fill-white" />
              </span>
              <div>
                <h1 className="text-xl font-display font-bold text-slate-950 tracking-tight">
                  {mfaChallengeToken
                    ? 'Two-Factor Authentication'
                    : pendingVerification
                    ? 'Verify Your Email Address'
                    : mode === 'forgot'
                    ? 'Reset Account Password'
                    : mode === 'sign_up'
                    ? 'Create BloodConnect Account'
                    : 'Sign In to BloodConnect'}
                </h1>
                <p className="text-xs text-slate-500">
                  {mfaChallengeToken
                    ? 'Enter your 6-digit TOTP authenticator code or a single-use backup code.'
                    : pendingVerification
                    ? 'Confirm your email ownership to complete account verification.'
                    : mode === 'forgot'
                    ? 'Password resets invalidate all active sessions across devices.'
                    : 'Permissions and portal access are resolved automatically by the server.'}
                </p>
              </div>
            </div>
          </div>

          {contextNotice && !mfaChallengeToken && !pendingVerification && (
            <div className="mb-5 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2.5">
              <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <span>{contextNotice}</span>
            </div>
          )}

          {!mfaChallengeToken && !pendingVerification && mode !== 'forgot' && (
            <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-xl mb-6">
              <button
                id="auth-tab-signin"
                type="button"
                onClick={() => {
                  setMode('sign_in');
                  resetMessages();
                }}
                className={`py-2.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                  mode === 'sign_in'
                    ? 'bg-white text-slate-950 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Sign In
              </button>
              <button
                id="auth-tab-signup"
                type="button"
                onClick={() => {
                  setMode('sign_up');
                  resetMessages();
                }}
                className={`py-2.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                  mode === 'sign_up'
                    ? 'bg-white text-slate-950 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Register Account
              </button>
            </div>
          )}

          {errorMsg && (
            <div className="mb-5 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="font-medium">{errorMsg}</div>
            </div>
          )}

          {successMsg && (
            <div className="mb-5 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div className="font-medium">{successMsg}</div>
            </div>
          )}

          {/* STAGE 2: MFA TOTP CHALLENGE */}
          {mfaChallengeToken ? (
            <form onSubmit={handleVerifyMfa} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  6-Digit Authenticator Code or Recovery Code
                </label>
                <div className="relative">
                  <Smartphone className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    id="mfa-code-input"
                    type="text"
                    required
                    autoFocus
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value)}
                    placeholder="123456 or XXXX-XXXX"
                    className="w-full pl-10 pr-3 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-mono tracking-widest text-slate-900 focus:outline-hidden focus:border-rose-700 focus:ring-1 focus:ring-rose-700"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-rose-700 hover:bg-rose-800 text-white text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {loading ? 'Verifying Code...' : 'Verify & Complete Sign In'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMfaChallengeToken(null);
                    resetMessages();
                  }}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : pendingVerification ? (
            /* POST-REGISTRATION EMAIL VERIFICATION */
            <form onSubmit={handleVerifyEmailNow} className="space-y-4">
              {pendingVerification.devPreviewToken && (
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
                  <div className="font-semibold text-slate-900">
                    Development Email Verification Token (SMTP not configured)
                  </div>
                  <div className="flex items-center justify-between gap-2 bg-white px-3 py-2 rounded-lg border border-slate-200 font-mono text-[11px] text-slate-800">
                    <span className="truncate">{pendingVerification.devPreviewToken}</span>
                    <button
                      type="button"
                      onClick={() => handleCopyToken(pendingVerification.devPreviewToken!)}
                      className="inline-flex items-center gap-1 text-rose-700 hover:text-rose-800 font-sans font-semibold shrink-0 cursor-pointer"
                    >
                      {copiedToken ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedToken ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Verification Token
                </label>
                <input
                  type="text"
                  required
                  value={verifyTokenInput}
                  onChange={(e) => setVerifyTokenInput(e.target.value)}
                  placeholder="Paste verification token"
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-mono text-slate-900 focus:outline-hidden focus:border-rose-700"
                />
              </div>

              <div className="flex items-center gap-2.5">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-rose-700 hover:bg-rose-800 text-white text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {loading ? 'Verifying...' : 'Verify Email & Continue'}
                </button>
                <button
                  type="button"
                  onClick={() => onLoginSuccess(pendingVerification.user)}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Skip for Now
                </button>
              </div>
            </form>
          ) : mode === 'forgot' ? (
            /* FORGOT & RESET PASSWORD FLOW */
            resetStep === 'request' ? (
              <form onSubmit={handleForgotPasswordRequest} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Registered Email Address
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                    <input
                      type="email"
                      required
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      placeholder="you@bloodconnect.org"
                      className="w-full pl-10 pr-3 py-2.5 bg-white border border-slate-300 rounded-xl text-sm text-slate-900 focus:outline-hidden focus:border-rose-700"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2.5">
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 py-2.5 px-4 rounded-xl bg-rose-700 hover:bg-rose-800 text-white text-xs font-semibold disabled:opacity-50 cursor-pointer"
                  >
                    {loading ? 'Issuing Reset Token...' : 'Request Password Reset'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMode('sign_in');
                      resetMessages();
                    }}
                    className="px-4 py-2.5 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                  >
                    Back
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleResetPasswordConfirm} className="space-y-4">
                {devResetPreviewToken && (
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5 text-xs">
                    <div className="font-semibold text-slate-900">
                      Development Single-Use Reset Token (SMTP not configured)
                    </div>
                    <div className="font-mono text-[11px] bg-white px-3 py-2 rounded-lg border border-slate-200 break-all">
                      {devResetPreviewToken}
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Reset Token
                  </label>
                  <input
                    type="text"
                    required
                    value={resetTokenInput}
                    onChange={(e) => setResetTokenInput(e.target.value)}
                    placeholder="Paste single-use reset token"
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-mono text-slate-900 focus:outline-hidden focus:border-rose-700"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    New Strong Password
                  </label>
                  <input
                    type="password"
                    required
                    value={newResetPassword}
                    onChange={(e) => setNewResetPassword(e.target.value)}
                    placeholder="Min 8 chars, uppercase, lowercase & number"
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-sm text-slate-900 focus:outline-hidden focus:border-rose-700"
                  />
                </div>

                <div className="flex items-center gap-2.5">
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 py-2.5 px-4 rounded-xl bg-rose-700 hover:bg-rose-800 text-white text-xs font-semibold disabled:opacity-50 cursor-pointer"
                  >
                    {loading ? 'Updating Password...' : 'Reset Password & Revoke Sessions'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setResetStep('request');
                      setMode('sign_in');
                      resetMessages();
                    }}
                    className="px-4 py-2.5 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )
          ) : mode === 'sign_in' ? (
            /* SIGN IN FORM */
            <form onSubmit={handleSignIn} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Email Address or Username
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    id="signin-identifier"
                    type="text"
                    required
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="e.g. superadmin@bloodconnect.org or donor_rahul"
                    className="w-full pl-10 pr-3 py-2.5 bg-white border border-slate-300 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-hidden focus:border-rose-700 focus:ring-1 focus:ring-rose-700"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-slate-700">Password</label>
                  <button
                    type="button"
                    onClick={() => {
                      setMode('forgot');
                      setResetStep('request');
                      resetMessages();
                    }}
                    className="text-xs font-medium text-rose-700 hover:text-rose-800 cursor-pointer"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    id="signin-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full pl-10 pr-10 py-2.5 bg-white border border-slate-300 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-hidden focus:border-rose-700 focus:ring-1 focus:ring-rose-700"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="rounded border-slate-300 text-rose-700 focus:ring-rose-700 w-4 h-4"
                />
                <span>Extend session duration on this device (14 days)</span>
              </label>

              <button
                id="signin-submit-btn"
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 rounded-xl bg-rose-700 hover:bg-rose-800 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                <span>{loading ? 'Verifying Credentials...' : 'Sign In'}</span>
                {!loading && <ArrowRight className="w-4 h-4" />}
              </button>

              {/* Authority Hierarchy Test Accounts Drawer */}
              <div className="pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowDemoAccounts(!showDemoAccounts)}
                  className="w-full flex items-center justify-between text-xs font-semibold text-slate-700 hover:text-slate-950 cursor-pointer"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5 text-rose-700" />
                    <span>Seeded RBAC Authority Hierarchy Accounts (Testing)</span>
                  </span>
                  <span className="text-[11px] text-slate-500 underline">
                    {showDemoAccounts ? 'Hide' : 'View 6 Roles'}
                  </span>
                </button>

                {showDemoAccounts && (
                  <div className="mt-3 space-y-2">
                    <p className="text-[11px] text-slate-500">
                      Click any account to populate the sign-in form. Default password for seeded accounts:{' '}
                      <code className="font-mono font-semibold text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded">
                        Password@123
                      </code>
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {DEMO_ACCOUNTS.map((acc) => (
                        <button
                          key={acc.identifier}
                          type="button"
                          onClick={() => {
                            setIdentifier(acc.identifier);
                            setPassword('Password@123');
                            resetMessages();
                          }}
                          className="text-left p-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-white hover:border-rose-300 transition-colors cursor-pointer"
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-xs font-semibold text-slate-900">{acc.label}</span>
                            <span className="text-[10px] font-mono text-slate-500">{acc.rank}</span>
                          </div>
                          <div className="text-[11px] font-mono text-slate-600 truncate mt-0.5">
                            {acc.identifier}
                          </div>
                          <div className="text-[10px] text-slate-500 mt-0.5">{acc.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </form>
          ) : (
            /* SIGN UP FORM (LEAST PRIVILEGE — ALWAYS REGULAR_USER) */
            <form onSubmit={handleSignUp} className="space-y-4">
              <div className="px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600">
                Public registration provisions a <strong className="text-slate-900">Regular User</strong>{' '}
                account under least-privilege policy. Elevated roles (Moderator, Department Manager,
                Authority Officer, Administrator) are assigned exclusively by authorized administrators.
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name *</label>
                  <div className="relative">
                    <UserIcon className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="e.g. Aarav Mehta"
                      className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:border-rose-700"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address *</label>
                  <div className="relative">
                    <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
                    <input
                      type="email"
                      required
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      placeholder="aarav@example.org"
                      className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:border-rose-700"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Phone Number *</label>
                  <div className="relative">
                    <Phone className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
                    <input
                      type="tel"
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+91 98200 12345"
                      className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:border-rose-700"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Blood Group</label>
                    <select
                      value={bloodGroup}
                      onChange={(e) => setBloodGroup(e.target.value as BloodGroup)}
                      className="w-full px-2.5 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:border-rose-700"
                    >
                      {(['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'] as BloodGroup[]).map((bg) => (
                        <option key={bg} value={bg}>
                          {bg}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">City</label>
                    <input
                      type="text"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="Mumbai"
                      className="w-full px-2.5 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:border-rose-700"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Password *</label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    placeholder="Min 8 chars, A-Z, a-z, 0-9"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:border-rose-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Confirm Password *
                  </label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter password"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:border-rose-700"
                  />
                </div>
              </div>

              {regPassword && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <span>Password Policy Strength</span>
                    <span className="font-semibold text-slate-800">
                      {passwordStrength <= 1
                        ? 'Weak'
                        : passwordStrength === 2
                        ? 'Fair'
                        : passwordStrength === 3
                        ? 'Strong'
                        : 'Very Strong'}
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden grid grid-cols-4 gap-1">
                    {[1, 2, 3, 4].map((idx) => (
                      <div
                        key={idx}
                        className={`h-full rounded-full ${
                          passwordStrength >= idx
                            ? passwordStrength >= 3
                              ? 'bg-emerald-600'
                              : 'bg-amber-500'
                            : 'bg-slate-200'
                        }`}
                      />
                    ))}
                  </div>
                </div>
              )}

              <button
                id="signup-submit-btn"
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 rounded-xl bg-rose-700 hover:bg-rose-800 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                <span>{loading ? 'Creating Account...' : 'Create Account'}</span>
                {!loading && <ArrowRight className="w-4 h-4" />}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
