import React, { useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Eye,
  EyeOff,
  HelpCircle,
  KeyRound,
  Lock,
  LogIn,
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
    name: 'Diya Krishnan',
    email: 'diya.krishnan@school-demo.edu',
    role: 'Student',
    department: 'Senior Science & Electronics',
    tagColor: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  },
  {
    name: 'Mrs. Priya Sharma',
    email: 'p.sharma@school-demo.edu',
    role: 'Manager / Teacher',
    department: 'Science & Computer Labs Coordinator',
    tagColor: 'bg-teal-100 text-teal-800 border-teal-300',
  },
  {
    name: 'Dr. Ananya Deshmukh',
    email: 'ananya.deshmukh@school-demo.edu',
    role: 'Principal & Admin',
    department: 'Campus Facilities & Academic Leadership',
    tagColor: 'bg-indigo-100 text-indigo-800 border-indigo-300',
  },
];

export const LoginView: React.FC<LoginViewProps> = ({
  onLoginSuccess,
  onViewCatalogue,
  onViewAbout,
  initialEmail = '',
}) => {
  const [email, setEmail] = useState<string>(initialEmail);
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setErrorMessage('Please enter your campus email address.');
      return;
    }
    if (!password) {
      setErrorMessage('Please enter your account password.');
      return;
    }

    setLoading(true);
    setErrorMessage(null);

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

  const handleSelectPreset = (presetEmail: string) => {
    setEmail(presetEmail);
    setErrorMessage(null);
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
              Greenwood College &amp; Senior School Campus Portal
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
          <div className="space-y-1 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-teal-50 text-teal-700 mb-2 border border-teal-100">
              <Lock className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold text-slate-900">Sign In to Campus Workspace</h2>
            <p className="text-xs text-slate-600 leading-relaxed">
              Enter your registered Supabase Auth credentials to access equipment, labs, and bookings.
            </p>
          </div>

          {/* Error Notice */}
          {errorMessage && (
            <div
              role="alert"
              className="p-3.5 rounded-lg bg-rose-50 border border-rose-200 flex items-start gap-2.5 text-xs text-rose-800"
            >
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <span className="font-semibold block">Authentication Error</span>
                <span>{errorMessage}</span>
              </div>
            </div>
          )}

          {/* Sign In Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="login-email" className="block text-xs font-semibold text-slate-800 mb-1">
                Campus Email Address
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
                  <span>Sign In</span>
                </>
              )}
            </button>
          </form>

          {/* Quick-Fill Presets for Seeded Accounts */}
          <div className="pt-4 border-t border-slate-200">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-slate-500" />
                <span>Seeded Campus Accounts</span>
              </span>
              <span className="text-[11px] text-slate-500">Click to fill email</span>
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
                    <div className="font-mono text-[11px] text-slate-500 truncate">{preset.email}</div>
                  </div>
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded border shrink-0 ${preset.tagColor}`}
                  >
                    {preset.role}
                  </span>
                </button>
              ))}
            </div>

            <p className="mt-3 text-[11px] text-slate-500 leading-normal bg-slate-50 p-2.5 rounded border border-slate-200">
              <strong>Campus Security Note:</strong> All authentication tokens are cryptographically
              validated through Supabase Auth. Enter the password configured during database seeding to
              log in.
            </p>
          </div>
        </div>
      </main>

      {/* Footer Info */}
      <footer className="max-w-4xl w-full mx-auto text-center pt-4 border-t border-slate-200 text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Shield className="w-3.5 h-3.5 text-teal-700" />
          <span>Protected by Row Level Security (RLS) &amp; Express token verification</span>
        </div>
        <div className="font-mono text-[11px] text-slate-500">
          Campus Timezone: Asia/Kolkata (IST)
        </div>
      </footer>
    </div>
  );
};
