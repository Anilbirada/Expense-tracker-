import React, { useState } from 'react';
import { User, Lock, ShieldCheck, Save, RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../api';

export const SettingsPage: React.FC = () => {
  const { user, refreshUser, resetDemoData, showToast } = useAuth();

  const [name, setName] = useState(user?.name || '');
  const [userType, setUserType] = useState(user?.user_type || 'individual');
  const [warningThreshold, setWarningThreshold] = useState(
    user?.budget_warning_threshold || 75
  );
  const [criticalThreshold, setCriticalThreshold] = useState(
    user?.budget_critical_threshold || 100
  );
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (warningThreshold >= criticalThreshold) {
      showToast(
        'Warning threshold must be lower than exceeded limit threshold.',
        'error'
      );
      return;
    }

    setSavingProfile(true);
    try {
      await apiRequest('/api/auth/profile', {
        method: 'PUT',
        body: JSON.stringify({
          name: name.trim(),
          user_type: userType,
          budget_warning_threshold: warningThreshold,
          budget_critical_threshold: criticalThreshold,
        }),
      });
      await refreshUser();
      showToast('Profile and budget alert settings saved!', 'success');
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Save failed', 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      showToast('New password must be at least 6 characters.', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast('New passwords do not match.', 'error');
      return;
    }

    setSavingPassword(true);
    try {
      await apiRequest('/api/auth/password', {
        method: 'PUT',
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      showToast('Password updated successfully!', 'success');
    } catch (err: unknown) {
      showToast(
        err instanceof Error ? err.message : 'Password change failed',
        'error'
      );
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h2 className="text-xl font-bold text-navy-950">
          Account & Application Settings
        </h2>
        <p className="text-xs text-slate-500">
          Manage your profile, default budget notification thresholds, and security credentials.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Profile & Default Thresholds */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
          <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3 mb-4">
            <User className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-bold text-navy-950">
              Profile & Default Budget Thresholds
            </h3>
          </div>

          <form onSubmit={handleSaveProfile} className="space-y-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Full Name *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Email Address (Read-only login identifier)
              </label>
              <input
                type="email"
                disabled
                value={user?.email || ''}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-500 text-sm"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                User Profile Role
              </label>
              <select
                value={userType}
                onChange={(e) => setUserType(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-sm"
              >
                <option value="individual">Individual User</option>
                <option value="student">Student</option>
                <option value="professional">Working Professional</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-2">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Default Warning Level (%)
                </label>
                <input
                  type="number"
                  min="10"
                  max="99"
                  value={warningThreshold}
                  onChange={(e) => setWarningThreshold(Number(e.target.value))}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm"
                />
                <span className="text-[11px] text-slate-400">
                  Triggers "Approaching Limit" (Default: 75%)
                </span>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Default Exceeded Level (%)
                </label>
                <input
                  type="number"
                  min="50"
                  max="200"
                  value={criticalThreshold}
                  onChange={(e) => setCriticalThreshold(Number(e.target.value))}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm"
                />
                <span className="text-[11px] text-slate-400">
                  Triggers "Exceeded" (Default: 100%)
                </span>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={savingProfile}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>{savingProfile ? 'Saving...' : 'Save Preferences'}</span>
              </button>
            </div>
          </form>
        </div>

        {/* Security & Password Change */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
            <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3 mb-4">
              <Lock className="w-4 h-4 text-blue-600" />
              <h3 className="text-sm font-bold text-navy-950">Change Password</h3>
            </div>

            <form onSubmit={handlePasswordChange} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Current Password *
                </label>
                <input
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  New Password (min. 6 chars) *
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Confirm New Password *
                </label>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300"
                />
              </div>
              <button
                type="submit"
                disabled={savingPassword}
                className="w-full py-2.5 rounded-xl bg-navy-950 hover:bg-navy-800 text-white font-semibold text-xs cursor-pointer"
              >
                {savingPassword ? 'Updating...' : 'Update Password'}
              </button>
            </form>
          </div>

          {/* Demo Account Reset or Security Info */}
          <div className="bg-navy-950 text-white rounded-2xl border border-navy-800 p-5 text-xs space-y-3">
            <div className="flex items-center gap-2 text-blue-300 font-bold text-sm">
              <ShieldCheck className="w-4 h-4" />
              <span>Security & Data Integrity</span>
            </div>
            <p className="text-slate-300 leading-relaxed">
              Your financial data is protected by Bcrypt password hashing, JWT authentication, and strict ownership verification on every database query.
            </p>
            {user?.is_demo && (
              <button
                onClick={() => resetDemoData()}
                className="w-full py-2 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-navy-950 font-bold flex items-center justify-center gap-2 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Reset Fictional Demo Dataset</span>
              </button>
            )}
            <div className="pt-2 border-t border-navy-800 text-[11px] text-slate-400">
              Expense Tracker v1.0 • Developed by{' '}
              <strong className="text-white">Anil Biradar</strong>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
