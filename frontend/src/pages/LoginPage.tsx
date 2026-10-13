import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Wallet, Lock, Mail, Sparkles, ShieldCheck, ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const LoginPage: React.FC = () => {
  const { login, loginDemo } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !password) {
      setError('Please enter both your email address and password.');
      return;
    }

    setSubmitting(true);
    try {
      await login(email.trim(), password);
      navigate('/dashboard');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed. Please check your credentials.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDemoLogin = async () => {
    setError(null);
    setDemoLoading(true);
    try {
      await loginDemo();
      navigate('/dashboard');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load demo account.');
    } finally {
      setDemoLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-slate-50">
      {/* Left Hero Panel (Navy Foundation) */}
      <div className="lg:w-1/2 bg-navy-950 text-white p-8 sm:p-12 lg:p-16 flex flex-col justify-between relative overflow-hidden">
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-blue-600 flex items-center justify-center shadow-lg">
              <Wallet className="w-6 h-6 text-white" />
            </div>
            <div>
              <span className="font-extrabold text-lg tracking-wide text-white block leading-none">
                EXPENSE TRACKER
              </span>
              <span className="text-xs text-blue-300 font-medium">
                Smart Personal Finance Management System
              </span>
            </div>
          </div>

          <div className="mt-12 lg:mt-20 max-w-lg">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-900/60 border border-blue-700/60 text-blue-200 text-xs font-semibold mb-4">
              <ShieldCheck className="w-3.5 h-3.5" />
              Precision Monetary Analytics & Budgeting
            </span>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white leading-tight">
              Take Complete Control of Your Income, Spending & Savings.
            </h1>
            <p className="mt-4 text-slate-300 text-sm sm:text-base leading-relaxed">
              Record daily transactions, monitor category budgets with real-time alerts, track savings goals, and generate verifiable CSV & PDF financial statements.
            </p>

            <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-navy-900/90 border border-navy-800">
                <div className="text-blue-400 font-bold text-sm">Fixed-Precision Math</div>
                <p className="text-xs text-slate-300 mt-1">
                  Authoritative Decimal calculations without floating-point rounding errors.
                </p>
              </div>
              <div className="p-4 rounded-xl bg-navy-900/90 border border-navy-800">
                <div className="text-emerald-400 font-bold text-sm">Strict Data Isolation</div>
                <p className="text-xs text-slate-300 mt-1">
                  Bcrypt password hashing, JWT authentication, and per-user ownership checks.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="relative z-10 mt-10 pt-6 border-t border-navy-800 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
          <span>Final-Year Full-Stack Project</span>
          <span className="font-semibold text-blue-300">Developed by Anil Biradar</span>
        </div>
      </div>

      {/* Right Login Form Panel */}
      <div className="lg:w-1/2 flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8">
          <div>
            <h2 className="text-2xl font-bold text-navy-950">Sign in to your account</h2>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Access your personal financial dashboard or launch the live demonstration account.
            </p>
          </div>

          {/* 1-Click Live Demonstration Account Box */}
          <div className="mt-6 p-4 rounded-xl bg-blue-50/80 border border-blue-200">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-1.5 text-xs font-bold text-blue-950">
                  <Sparkles className="w-4 h-4 text-blue-600" />
                  <span>Live Evaluation / College Demo Mode</span>
                </div>
                <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
                  Explore pre-populated fictional transactions, monthly budgets, charts, and reports without registering.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleDemoLogin}
              disabled={demoLoading || submitting}
              className="mt-3 w-full py-2.5 px-4 rounded-xl bg-navy-900 hover:bg-navy-800 text-white font-semibold text-xs flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer disabled:opacity-60"
            >
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>
                {demoLoading
                  ? 'Loading Demonstration Workspace...'
                  : 'Launch 1-Click Fictional Demo Account'}
              </span>
            </button>
          </div>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-3 text-slate-400 font-medium">Or sign in with email</span>
            </div>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 font-medium">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting || demoLoading}
              className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer disabled:opacity-60"
            >
              <span>{submitting ? 'Signing in...' : 'Sign In'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-slate-600">
            Don't have a personal account yet?{' '}
            <Link to="/register" className="text-blue-600 font-semibold hover:underline">
              Create your account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};
