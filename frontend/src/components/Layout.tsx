import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  ArrowLeftRight,
  PlusCircle,
  MinusCircle,
  PieChart,
  Tags,
  FileBarChart2,
  Target,
  Settings,
  Bell,
  LogOut,
  Menu,
  X,
  Wallet,
  Sparkles,
  RefreshCw,
  CheckCheck,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../api';
import { NotificationItem } from '../types';

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, logout, resetDemoData } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [resettingDemo, setResettingDemo] = useState(false);

  const fetchNotifications = async () => {
    try {
      const data = await apiRequest<NotificationItem[]>('/api/notifications');
      setNotifications(data);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, [location.pathname]);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const handleMarkRead = async (id: number) => {
    try {
      await apiRequest(`/api/notifications/${id}/read`, { method: 'PATCH' });
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
    } catch {
      // ignore
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await apiRequest('/api/notifications/read-all', { method: 'POST' });
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch {
      // ignore
    }
  };

  const handleResetDemo = async () => {
    setResettingDemo(true);
    try {
      await resetDemoData();
      window.location.reload();
    } finally {
      setResettingDemo(false);
    }
  };

  const navItems = [
    { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/transactions', label: 'Transactions', icon: ArrowLeftRight },
    { to: '/add-income', label: 'Add Income', icon: PlusCircle },
    { to: '/add-expense', label: 'Add Expense', icon: MinusCircle },
    { to: '/budgets', label: 'Budgets', icon: PieChart },
    { to: '/categories', label: 'Categories', icon: Tags },
    { to: '/reports', label: 'Financial Reports', icon: FileBarChart2 },
    { to: '/savings-goals', label: 'Goals & Recurring', icon: Target },
    { to: '/settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      {/* Desktop Navy Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 bg-navy-950 text-white border-r border-navy-800 select-none z-30">
        <div className="flex items-center gap-3 px-6 h-16 border-b border-navy-800/80">
          <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center shadow-inner">
            <Wallet className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="font-bold text-sm tracking-wide text-white leading-tight">
              EXPENSE TRACKER
            </div>
            <div className="text-[11px] text-blue-300 font-medium">
              Smart Personal Finance
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-5 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-300 hover:bg-navy-900 hover:text-white'
                  }`
                }
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="p-4 border-t border-navy-800/80 bg-navy-900/50">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-full bg-blue-600/20 border border-blue-400/30 flex items-center justify-center text-blue-300 font-bold text-sm shrink-0">
              {user?.name?.charAt(0).toUpperCase() || 'U'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-white truncate">{user?.name}</p>
              <p className="text-[11px] text-slate-400 truncate">{user?.email}</p>
            </div>
          </div>
          <button
            onClick={async () => {
              await logout();
              navigate('/login');
            }}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-navy-800 hover:bg-red-600/90 text-slate-200 hover:text-white text-xs font-medium transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
          <div className="mt-3 pt-2 border-t border-navy-800/60 text-center">
            <p className="text-[11px] text-slate-400 font-medium">
              Developed by <span className="text-blue-400 font-semibold">Anil Biradar</span>
            </p>
          </div>
        </div>
      </aside>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative w-72 max-w-xs bg-navy-950 text-white flex flex-col h-full z-10">
            <div className="flex items-center justify-between px-5 h-16 border-b border-navy-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
                  <Wallet className="w-4 h-4 text-white" />
                </div>
                <span className="font-bold text-sm">EXPENSE TRACKER</span>
              </div>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={() => setMobileMenuOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium ${
                        isActive
                          ? 'bg-blue-600 text-white'
                          : 'text-slate-300 hover:bg-navy-900 hover:text-white'
                      }`
                    }
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </NavLink>
                );
              })}
            </nav>
            <div className="p-4 border-t border-navy-800">
              <button
                onClick={async () => {
                  setMobileMenuOpen(false);
                  await logout();
                  navigate('/login');
                }}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-red-600 text-white text-xs font-semibold"
              >
                <LogOut className="w-4 h-4" />
                <span>Sign Out</span>
              </button>
              <p className="mt-2 text-center text-[11px] text-slate-400">
                Developed by Anil Biradar
              </p>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col lg:pl-64 min-w-0">
        {/* Fictional Demo Account Banner */}
        {user?.is_demo && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-xs text-amber-900 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                <strong>Fictional Demonstration Mode:</strong> You are viewing clearly labeled{' '}
                <code className="bg-amber-100 px-1 py-0.5 rounded font-semibold">[DEMO]</code> sample financial records. Real user accounts are strictly isolated.
              </span>
            </div>
            <button
              onClick={handleResetDemo}
              disabled={resettingDemo}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-200/80 hover:bg-amber-300 text-amber-950 font-semibold transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${resettingDemo ? 'animate-spin' : ''}`} />
              <span>{resettingDemo ? 'Resetting...' : 'Reset Demo Data'}</span>
            </button>
          </div>
        )}

        {/* Top Navbar */}
        <header className="sticky top-0 z-20 h-16 bg-white/95 backdrop-blur-xs border-b border-slate-200 px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-base sm:text-lg font-bold text-navy-950">
                Smart Personal Finance Management
              </h1>
              <p className="hidden sm:block text-xs text-slate-500">
                Developed by Anil Biradar • Account Type:{' '}
                <span className="capitalize font-medium text-slate-700">{user?.user_type}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => navigate('/add-income')}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-semibold transition-colors cursor-pointer"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>+ Income</span>
            </button>
            <button
              onClick={() => navigate('/add-expense')}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
            >
              <MinusCircle className="w-3.5 h-3.5" />
              <span>+ Expense</span>
            </button>

            {/* Notifications Bell Dropdown */}
            <div className="relative">
              <button
                onClick={() => setNotifOpen((prev) => !prev)}
                className="relative p-2 rounded-xl text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                aria-label="Notifications"
              >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setNotifOpen(false)}
                  />
                  <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-xl border border-slate-200 z-20 overflow-hidden">
                    <div className="px-4 py-3 bg-navy-950 text-white flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider">
                        Alerts & Notifications ({unreadCount} unread)
                      </span>
                      {unreadCount > 0 && (
                        <button
                          onClick={handleMarkAllRead}
                          className="inline-flex items-center gap-1 text-[11px] text-blue-300 hover:text-white cursor-pointer"
                        >
                          <CheckCheck className="w-3.5 h-3.5" />
                          <span>Mark all read</span>
                        </button>
                      )}
                    </div>
                    <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                      {notifications.length === 0 ? (
                        <div className="p-6 text-center text-xs text-slate-500">
                          No notifications yet. Budget warnings and recurring reminders will appear here.
                        </div>
                      ) : (
                        notifications.map((n) => (
                          <div
                            key={n.id}
                            className={`p-3.5 text-xs transition-colors ${
                              n.is_read ? 'bg-white text-slate-600' : 'bg-blue-50/60 text-slate-900'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <span className="font-semibold text-navy-900">{n.title}</span>
                              {!n.is_read && (
                                <button
                                  onClick={() => handleMarkRead(n.id)}
                                  className="text-[11px] text-blue-600 hover:underline shrink-0 cursor-pointer"
                                >
                                  Mark read
                                </button>
                              )}
                            </div>
                            <p className="mt-1 text-slate-600 leading-relaxed">{n.message}</p>
                            <p className="mt-1.5 text-[10px] text-slate-400">
                              {new Date(n.created_at).toLocaleString()}
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Page Body */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {children}
        </main>

        {/* Footer */}
        <footer className="bg-white border-t border-slate-200 py-4 px-6 text-center sm:flex sm:items-center sm:justify-between text-xs text-slate-500">
          <div>
            <strong>EXPENSE TRACKER</strong> — Smart Personal Finance Management System
          </div>
          <div className="mt-1 sm:mt-0 font-medium text-navy-900">
            Developed by <span className="text-blue-600 font-bold">Anil Biradar</span>
          </div>
        </footer>
      </div>
    </div>
  );
};
