import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Eye,
  EyeOff,
  GraduationCap,
  HelpCircle,
  KeyRound,
  Lock,
  LogIn,
  Mail,
  School,
  Shield,
  UserCheck,
} from 'lucide-react';
import { api } from '../services/api';
import { AppDatabaseState, User } from '../types';

interface LoginViewProps {
  onLoginSuccess: (user: User, state: AppDatabaseState) => void;
  onViewCatalogue?: () => void;
  onViewAbout?: () => void;
  initialEmail?: string;
}

interface DemoPreset {
  name: string;
  email: string;
  role: string;
  department: string;
  tagColor: string;
}

const DEMO_PRESETS: DemoPreset[] = [
  {
    name: 'Aarav Mehta',
    email: 'aarav.mehta@school-demo.edu',
    role: 'Student',
    department: 'College Tech Club & Robotics',
    tagColor: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  },
  {
    name: 'Prof. Rajesh Nair',
    email: 'r.nair@school-demo.edu',
    role: 'Faculty',
    department: 'Electronics & Robotics Faculty',
    tagColor: 'bg-blue-100 text-blue-800 border-blue-300',
  },
  {
    name: 'Mrs. Priya Sharma',
    email: 'p.sharma@school-demo.edu',
    role: 'Resource Manager',
    department: 'Science & Computer Labs Coordinator',
    tagColor: 'bg-teal-100 text-teal-800 border-teal-300',
  },
  {
    name: 'Dr. Ananya Deshmukh',
    email: 'ananya.deshmukh@school-demo.edu',
    role: 'Organisation Admin',
    department: 'Principal & Facilities Leadership',
    tagColor: 'bg-indigo-100 text-indigo-800 border-indigo-300',
  },
];

type AuthMode = 'signin' | 'forgot' | 'reset-password';

export const LoginView: React.FC<LoginViewProps> = ({
  onLoginSuccess,
  onViewCatalogue,
  onViewAbout,
  initialEmail = '',
}) => {
  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState<string>(initialEmail);
  const [password, setPassword] = useState<string>('');
  const [newPassword, setNewPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Check if user reached page through Supabase Auth recovery or invite link
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash || '';
      if (
        hash.includes('type=recovery') ||
        hash.includes('type=invite') ||
        hash.includes('access_token')
      ) {
        setMode('reset-password');
      }
    }
  }, []);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setErrorMessage('Please enter your registered organisation email address.');
      return;
    }
    if (!password) {
      setErrorMessage('Please enter your account password.');
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const res = await api.signInWithSupabaseAuth(cleanEmail, password);
      onLoginSuccess(res.user, res.state);
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : 'Unable to sign in. Please verify your email and password.';
      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setErrorMessage('Please enter your registered organisation email address.');
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const res = await api.sendPasswordResetEmail(cleanEmail);
      setSuccessMessage(res.message);
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : 'Unable to send password reset email. Please try again.';
      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 8) {
      setErrorMessage('Password must be at least 8 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMessage('Passwords do not match. Please re-enter both passwords.');
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const res = await api.updatePassword(newPassword);
      setSuccessMessage('Password updated successfully! Redirecting to your workspace...');
      window.setTimeout(() => {
        onLoginSuccess(res.user, res.state);
      }, 1000);
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : 'Failed to update password. Your reset link may have expired.';
      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectPreset = (presetEmail: string) => {
    setEmail(presetEmail);
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col justify-between py-8 px-4 sm:px-6 lg:px-8">
      {/* Top Banner Navigation */}
      <header className="max-w-4xl w-full mx-auto flex items-center justify-between pb-6 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-teal-800 text-white flex items-center justify-center font-bold text-lg shadow-sm">
            RB
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-900 tracking-tight">ResourceBridge</h1>
            <p className="text-xs text-slate-500 font-medium">
              Greenwood College &amp; Senior School · Authorised Campus Portal
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {onViewCatalogue && (
            <button
              type="button"
              onClick={onViewCatalogue}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 shadow-sm"
            >
              <BookOpen className="w-3.5 h-3.5 text-slate-500" />
              <span>Browse Catalogue</span>
            </button>
          )}
          {onViewAbout && (
            <button
              type="button"
              onClick={onViewAbout}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 shadow-sm"
            >
              <School className="w-3.5 h-3.5 text-slate-500" />
              <span className="hidden sm:inline">About Campus System</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Authentication Card */}
      <main className="max-w-md w-full mx-auto my-auto pt-6 pb-8">
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 sm:p-8 space-y-6">
          {/* Organisation Header */}
          <div className="space-y-1 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-teal-50 text-teal-700 mb-2 border border-teal-100">
              {mode === 'forgot' ? (
                <Mail className="w-6 h-6" />
              ) : mode === 'reset-password' ? (
                <KeyRound className="w-6 h-6" />
              ) : (
                <Lock className="w-6 h-6" />
              )}
            </div>
            <h2 className="text-xl font-bold text-slate-900">
              {mode === 'forgot'
                ? 'Reset Account Password'
                : mode === 'reset-password'
                ? 'Set New Password'
                : 'Sign In to Campus Workspace'}
            </h2>
            <p className="text-xs text-slate-600 leading-relaxed">
              {mode === 'forgot'
                ? 'Enter your registered organisation email to receive a secure recovery link.'
                : mode === 'reset-password'
                ? 'Establish a secure password for your organisation membership.'
                : 'Enter your organisation-authorised Supabase credentials to access campus facilities.'}
            </p>
          </div>

          {/* Success Notice */}
          {successMessage && (
            <div
              role="status"
              className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 flex items-start gap-2.5 text-xs text-emerald-800"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <span className="font-semibold block">Notification</span>
                <span>{successMessage}</span>
              </div>
            </div>
          )}

          {/* Error Notice */}
          {errorMessage && (
            <div
              role="alert"
              className="p-3.5 rounded-lg bg-rose-50 border border-rose-200 flex items-start gap-2.5 text-xs text-rose-800"
            >
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <span className="font-semibold block">Authentication Notice</span>
                <span>{errorMessage}</span>
              </div>
            </div>
          )}

          {/* MODE 1: SIGN IN FORM */}
          {mode === 'signin' && (
            <form onSubmit={handleSignIn} className="space-y-4">
              <div>
                <label
                  htmlFor="login-email"
                  className="block text-xs font-semibold text-slate-800 mb-1"
                >
                  Organisation Email Address
                </label>
                <input
                  id="login-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. aarav.mehta@school-demo.edu"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600 focus:border-transparent transition-all"
                  disabled={loading}
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label
                    htmlFor="login-password"
                    className="block text-xs font-semibold text-slate-800"
                  >
                    Password
                  </label>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1"
                      tabIndex={-1}
                    >
                      {showPassword ? (
                        <>
                          <EyeOff className="w-3.5 h-3.5" />
                          <span>Hide</span>
                        </>
                      ) : (
                        <>
                          <Eye className="w-3.5 h-3.5" />
                          <span>Show</span>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMode('forgot');
                        setErrorMessage(null);
                        setSuccessMessage(null);
                      }}
                      className="text-xs text-teal-700 hover:text-teal-900 font-semibold"
                    >
                      Forgot Password?
                    </button>
                  </div>
                </div>
                <div className="relative">
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your account password"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600 focus:border-transparent transition-all"
                    disabled={loading}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 bg-teal-800 hover:bg-teal-900 text-white font-semibold text-sm rounded-lg shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed mt-2"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Verifying credentials...</span>
                  </>
                ) : (
                  <>
                    <LogIn className="w-4 h-4" />
                    <span>Sign In to Organisation</span>
                  </>
                )}
              </button>
            </form>
          )}

          {/* MODE 2: FORGOT PASSWORD FORM */}
          {mode === 'forgot' && (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div>
                <label
                  htmlFor="forgot-email"
                  className="block text-xs font-semibold text-slate-800 mb-1"
                >
                  Registered Organisation Email
                </label>
                <input
                  id="forgot-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. aarav.mehta@school-demo.edu"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600 focus:border-transparent transition-all"
                  disabled={loading}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 bg-teal-800 hover:bg-teal-900 text-white font-semibold text-sm rounded-lg shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed mt-2"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Sending password recovery email...</span>
                  </>
                ) : (
                  <>
                    <Mail className="w-4 h-4" />
                    <span>Send Password Reset Link</span>
                  </>
                )}
              </button>

              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setMode('signin');
                    setErrorMessage(null);
                    setSuccessMessage(null);
                  }}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Return to Sign In</span>
                </button>
              </div>
            </form>
          )}

          {/* MODE 3: SET NEW PASSWORD FORM (RECOVERY / INVITATION) */}
          {mode === 'reset-password' && (
            <form onSubmit={handleUpdatePassword} className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label
                    htmlFor="reset-password"
                    className="block text-xs font-semibold text-slate-800"
                  >
                    New Password
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1"
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      <>
                        <EyeOff className="w-3.5 h-3.5" />
                        <span>Hide</span>
                      </>
                    ) : (
                      <>
                        <Eye className="w-3.5 h-3.5" />
                        <span>Show</span>
                      </>
                    )}
                  </button>
                </div>
                <input
                  id="reset-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter at least 8 characters"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600 focus:border-transparent transition-all"
                  disabled={loading}
                />
              </div>

              <div>
                <label
                  htmlFor="confirm-password"
                  className="block text-xs font-semibold text-slate-800 mb-1"
                >
                  Confirm New Password
                </label>
                <input
                  id="confirm-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter your new password"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600 focus:border-transparent transition-all"
                  disabled={loading}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 bg-teal-800 hover:bg-teal-900 text-white font-semibold text-sm rounded-lg shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed mt-2"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Updating password...</span>
                  </>
                ) : (
                  <>
                    <KeyRound className="w-4 h-4" />
                    <span>Update Password &amp; Sign In</span>
                  </>
                )}
              </button>

              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setMode('signin');
                    setErrorMessage(null);
                    setSuccessMessage(null);
                  }}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Return to Sign In</span>
                </button>
              </div>
            </form>
          )}

          {/* Authorised Organisation Demo Account Selector (Fills email only) */}
          <div className="pt-4 border-t border-slate-200">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-teal-700" />
                <span>Authorised Organisation Accounts</span>
              </span>
              <span className="text-[11px] text-slate-500">Quick-fill email</span>
            </div>

            <div className="grid grid-cols-1 gap-2">
              {DEMO_PRESETS.map((preset) => (
                <button
                  key={preset.email}
                  type="button"
                  onClick={() => handleSelectPreset(preset.email)}
                  className={`text-left p-2.5 rounded-lg border text-xs transition-colors flex items-center justify-between ${
                    email === preset.email
                      ? 'bg-teal-50/70 border-teal-300 ring-1 ring-teal-300'
                      : 'bg-slate-50/80 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
                  }`}
                >
                  <div className="min-w-0 pr-2">
                    <div className="font-semibold text-slate-900 truncate">{preset.name}</div>
                    <div className="font-mono text-[11px] text-slate-500 truncate">
                      {preset.email}
                    </div>
                  </div>
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded border shrink-0 ${preset.tagColor}`}
                  >
                    {preset.role}
                  </span>
                </button>
              ))}
            </div>

            <div className="mt-3 text-[11px] text-slate-500 leading-normal bg-slate-50 p-2.5 rounded border border-slate-200 space-y-1">
              <div>
                <strong>Security Policy:</strong> Public registration is disabled. Accounts and roles
                must be provisioned by an organisation administrator.
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer Info */}
      <footer className="max-w-4xl w-full mx-auto text-center pt-4 border-t border-slate-200 text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Shield className="w-3.5 h-3.5 text-teal-700" />
          <span>Organisation Multi-Tenancy &amp; Role-Based Access Control</span>
        </div>
        <div className="font-mono text-[11px] text-slate-500">
          Campus Timezone: Asia/Kolkata (IST)
        </div>
      </footer>
    </div>
  );
};
