import React, { useState, useEffect, useCallback } from 'react';
import {
  PieChart,
  Plus,
  Edit3,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  X,
} from 'lucide-react';
import { apiRequest, formatINR } from '../api';
import { Budget, Category } from '../types';
import { useAuth } from '../context/AuthContext';
import { IconBadge } from '../components/IconBadge';

export const BudgetsPage: React.FC = () => {
  const { user, showToast } = useAuth();

  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Create Modal state
  const [showCreate, setShowCreate] = useState<boolean>(false);
  const [categoryId, setCategoryId] = useState<number>(0);
  const [budgetAmount, setBudgetAmount] = useState<string>('');
  const [periodStart, setPeriodStart] = useState<string>('');
  const [periodEnd, setPeriodEnd] = useState<string>('');
  const [warningThreshold, setWarningThreshold] = useState<number>(
    user?.budget_warning_threshold || 75
  );
  const [criticalThreshold, setCriticalThreshold] = useState<number>(
    user?.budget_critical_threshold || 100
  );
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Edit Modal state
  const [editBudget, setEditBudget] = useState<Budget | null>(null);
  const [editAmount, setEditAmount] = useState<string>('');
  const [editWarning, setEditWarning] = useState<number>(75);
  const [editCritical, setEditCritical] = useState<number>(100);

  // Default current month range helper
  useEffect(() => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)
      .toISOString()
      .split('T')[0];
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      .toISOString()
      .split('T')[0];
    setPeriodStart(firstDay);
    setPeriodEnd(lastDay);
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [bData, cData] = await Promise.all([
        apiRequest<Budget[]>('/api/budgets'),
        apiRequest<Category[]>('/api/categories?category_type=expense'),
      ]);
      setBudgets(bData);
      setCategories(cData);
      if (cData.length > 0 && categoryId === 0) {
        setCategoryId(cData[0].id);
      }
    } catch (err: unknown) {
      showToast(
        err instanceof Error ? err.message : 'Failed to load budgets',
        'error'
      );
    } finally {
      setLoading(false);
    }
  }, [categoryId, showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreateBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmt = Number(budgetAmount);
    if (!categoryId || isNaN(numAmt) || numAmt <= 0) {
      showToast('Please enter a valid positive budget amount.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      await apiRequest<Budget>('/api/budgets', {
        method: 'POST',
        body: JSON.stringify({
          category_id: categoryId,
          budget_amount: numAmt.toFixed(2),
          period_start: periodStart,
          period_end: periodEnd,
          warning_threshold: warningThreshold,
          critical_threshold: criticalThreshold,
        }),
      });
      showToast('Monthly category budget created!', 'success');
      setShowCreate(false);
      setBudgetAmount('');
      loadData();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Failed to create budget', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editBudget) return;
    const numAmt = Number(editAmount);
    if (isNaN(numAmt) || numAmt <= 0) {
      showToast('Please enter a valid positive budget amount.', 'error');
      return;
    }

    try {
      await apiRequest(`/api/budgets/${editBudget.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          budget_amount: numAmt.toFixed(2),
          warning_threshold: editWarning,
          critical_threshold: editCritical,
        }),
      });
      showToast('Budget updated successfully!', 'success');
      setEditBudget(null);
      loadData();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Update failed', 'error');
    }
  };

  const handleDeleteBudget = async (id: number, name: string) => {
    if (!window.confirm(`Delete budget for ${name}?`)) return;
    try {
      await apiRequest(`/api/budgets/${id}`, { method: 'DELETE' });
      showToast('Budget deleted.', 'info');
      loadData();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Delete failed', 'error');
    }
  };

  const totalBudgeted = budgets.reduce((acc, b) => acc + b.budget_amount, 0);
  const totalSpent = budgets.reduce((acc, b) => acc + b.spent_amount, 0);
  const totalRemaining = totalBudgeted - totalSpent;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-navy-950">Monthly Budget Management</h2>
          <p className="text-xs text-slate-500">
            Set category spending limits, configure custom alert thresholds, and monitor real-time utilization.
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Create Monthly Budget</span>
        </button>
      </div>

      {/* Summary Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 uppercase">
            Total Allocated Budgets
          </span>
          <div className="mt-2 text-2xl font-extrabold text-navy-950">
            {formatINR(totalBudgeted)}
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Across {budgets.length} active category budget(s)
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 uppercase">
            Total Spent in Budgets
          </span>
          <div className="mt-2 text-2xl font-extrabold text-blue-600">
            {formatINR(totalSpent)}
          </div>
          <p className="mt-1 text-xs text-slate-400">
            {totalBudgeted > 0
              ? `${((totalSpent / totalBudgeted) * 100).toFixed(1)}% of total allocated budget`
              : 'No budgets allocated'}
          </p>
        </div>

        <div className="bg-navy-950 text-white rounded-2xl border border-navy-800 p-5 shadow-xs">
          <span className="text-xs font-semibold text-blue-300 uppercase">
            Remaining Budget Headroom
          </span>
          <div
            className={`mt-2 text-2xl font-extrabold ${
              totalRemaining >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {formatINR(totalRemaining)}
          </div>
          <p className="mt-1 text-xs text-slate-300">
            {totalRemaining >= 0
              ? 'Within combined budget allowance'
              : 'Combined budget limit exceeded'}
          </p>
        </div>
      </div>

      {/* Budget Cards Grid */}
      {loading ? (
        <div className="p-12 text-center text-xs text-slate-400">Loading budgets...</div>
      ) : budgets.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-3">
          <PieChart className="w-10 h-10 text-slate-300 mx-auto" />
          <div className="text-base font-bold text-navy-950">No Budgets Configured Yet</div>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Create monthly category budgets (e.g., Food: ₹5,000, Travel: ₹3,000) to track spending against limits and receive automatic threshold warnings.
          </p>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Create First Budget</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {budgets.map((b) => {
            const isExceeded = b.status === 'Exceeded';
            const isWarn = b.status === 'Approaching Limit';

            return (
              <div
                key={b.id}
                className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <IconBadge
                        icon={b.category_icon}
                        color={b.category_color}
                        size="md"
                      />
                      <div>
                        <h3 className="font-bold text-sm text-navy-950">
                          {b.category_name}
                        </h3>
                        <p className="text-[11px] text-slate-400">
                          {b.period_start} to {b.period_end}
                        </p>
                      </div>
                    </div>

                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold ${
                        isExceeded
                          ? 'bg-red-100 text-red-700'
                          : isWarn
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-emerald-100 text-emerald-700'
                      }`}
                    >
                      {isExceeded ? (
                        <XCircle className="w-3.5 h-3.5" />
                      ) : isWarn ? (
                        <AlertTriangle className="w-3.5 h-3.5" />
                      ) : (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      )}
                      <span>{b.status}</span>
                    </span>
                  </div>

                  {/* Numbers Breakdown */}
                  <div className="mt-5 grid grid-cols-3 gap-2 p-3 rounded-xl bg-slate-50 text-xs">
                    <div>
                      <span className="text-[10px] text-slate-400 block">Budget</span>
                      <span className="font-bold text-navy-950">
                        {formatINR(b.budget_amount)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block">Spent</span>
                      <span className="font-bold text-blue-600">
                        {formatINR(b.spent_amount)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block">Remaining</span>
                      <span
                        className={`font-bold ${
                          b.remaining_amount >= 0 ? 'text-emerald-600' : 'text-red-600'
                        }`}
                      >
                        {formatINR(b.remaining_amount)}
                      </span>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="mt-4">
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="text-slate-500 font-medium">Utilization</span>
                      <span className="font-bold text-navy-950">
                        {b.percentage_used}%
                      </span>
                    </div>
                    <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          isExceeded
                            ? 'bg-red-600'
                            : isWarn
                            ? 'bg-amber-500'
                            : 'bg-emerald-500'
                        }`}
                        style={{ width: `${Math.min(100, b.percentage_used)}%` }}
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                  <span>
                    Alerts: Warn {b.warning_threshold}% • Limit {b.critical_threshold}%
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        setEditBudget(b);
                        setEditAmount(String(b.budget_amount));
                        setEditWarning(b.warning_threshold);
                        setEditCritical(b.critical_threshold);
                      }}
                      className="p-1.5 rounded-lg text-slate-500 hover:bg-blue-50 hover:text-blue-600 cursor-pointer"
                      title="Edit Budget"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteBudget(b.id, b.category_name)}
                      className="p-1.5 rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-600 cursor-pointer"
                      title="Delete Budget"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Budget Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h3 className="text-base font-bold text-navy-950">Create Monthly Budget</h3>
              <button
                onClick={() => setShowCreate(false)}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateBudget} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Expense Category *
                </label>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(Number(e.target.value))}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Monthly Budget Limit (INR ₹) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="1"
                  required
                  value={budgetAmount}
                  onChange={(e) => setBudgetAmount(e.target.value)}
                  placeholder="e.g., 5000.00"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Period Start *
                  </label>
                  <input
                    type="date"
                    required
                    value={periodStart}
                    onChange={(e) => setPeriodStart(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Period End *
                  </label>
                  <input
                    type="date"
                    required
                    value={periodEnd}
                    onChange={(e) => setPeriodEnd(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Warning Alert (%)
                  </label>
                  <input
                    type="number"
                    min="10"
                    max="99"
                    value={warningThreshold}
                    onChange={(e) => setWarningThreshold(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Exceeded Limit (%)
                  </label>
                  <input
                    type="number"
                    min="50"
                    max="200"
                    value={criticalThreshold}
                    onChange={(e) => setCriticalThreshold(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold cursor-pointer"
                >
                  {submitting ? 'Creating...' : 'Save Budget'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Budget Modal */}
      {editBudget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h3 className="text-base font-bold text-navy-950">
                Edit Budget: {editBudget.category_name}
              </h3>
              <button
                onClick={() => setEditBudget(null)}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateBudget} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Monthly Budget Limit (INR ₹) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="1"
                  required
                  value={editAmount}
                  onChange={(e) => setEditAmount(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Warning Threshold (%)
                  </label>
                  <input
                    type="number"
                    min="10"
                    max="99"
                    value={editWarning}
                    onChange={(e) => setEditWarning(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Exceeded Threshold (%)
                  </label>
                  <input
                    type="number"
                    min="50"
                    max="200"
                    value={editCritical}
                    onChange={(e) => setEditCritical(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditBudget(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold cursor-pointer"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
