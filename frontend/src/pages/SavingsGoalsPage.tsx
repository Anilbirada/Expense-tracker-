import React, { useState, useEffect, useCallback } from 'react';
import {
  Target,
  Plus,
  Trash2,
  Repeat,
  Play,
  Info,
  X,
  PlusCircle,
} from 'lucide-react';
import { apiRequest, formatINR } from '../api';
import { SavingsGoal, RecurringTransaction, Category } from '../types';
import { useAuth } from '../context/AuthContext';
import { IconBadge } from '../components/IconBadge';

export const SavingsGoalsPage: React.FC = () => {
  const { showToast } = useAuth();

  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  const [recurring, setRecurring] = useState<RecurringTransaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Create Goal Modal
  const [showCreateGoal, setShowCreateGoal] = useState(false);
  const [goalTitle, setGoalTitle] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [currentAmount, setCurrentAmount] = useState('0');
  const [targetDate, setTargetDate] = useState('');
  const [goalNotes, setGoalNotes] = useState('');

  // Contribute to Goal Modal
  const [contribGoal, setContribGoal] = useState<SavingsGoal | null>(null);
  const [contribAmount, setContribAmount] = useState('');

  // Create Recurring Modal
  const [showCreateRec, setShowCreateRec] = useState(false);
  const [recType, setRecType] = useState<'expense' | 'income'>('expense');
  const [recCategoryId, setRecCategoryId] = useState<number>(0);
  const [recTitle, setRecTitle] = useState('');
  const [recAmount, setRecAmount] = useState('');
  const [recFrequency, setRecFrequency] = useState<'daily' | 'weekly' | 'monthly' | 'yearly'>('monthly');
  const [recNextDate, setRecNextDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [recMethod, setRecMethod] = useState('Bank Transfer');

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [gData, rData, cData] = await Promise.all([
        apiRequest<SavingsGoal[]>('/api/savings-goals'),
        apiRequest<RecurringTransaction[]>('/api/recurring-transactions'),
        apiRequest<Category[]>('/api/categories'),
      ]);
      setGoals(gData);
      setRecurring(rData);
      setCategories(cData);
      const firstExp = cData.find((c) => c.category_type === 'expense');
      if (firstExp) setRecCategoryId(firstExp.id);
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Failed to load data', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleCreateGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    const tAmt = Number(targetAmount);
    const cAmt = Number(currentAmount || 0);
    if (!goalTitle.trim() || isNaN(tAmt) || tAmt <= 0 || cAmt < 0) {
      showToast('Please enter valid goal details.', 'error');
      return;
    }

    try {
      await apiRequest('/api/savings-goals', {
        method: 'POST',
        body: JSON.stringify({
          title: goalTitle.trim(),
          target_amount: tAmt.toFixed(2),
          current_amount: cAmt.toFixed(2),
          target_date: targetDate || null,
          notes: goalNotes.trim() || null,
        }),
      });
      showToast('Savings goal created!', 'success');
      setShowCreateGoal(false);
      setGoalTitle('');
      setTargetAmount('');
      setCurrentAmount('0');
      setTargetDate('');
      setGoalNotes('');
      loadAll();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Failed to create goal', 'error');
    }
  };

  const handleContribute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contribGoal) return;
    const amt = Number(contribAmount);
    if (isNaN(amt) || amt <= 0) {
      showToast('Enter a positive contribution amount.', 'error');
      return;
    }

    try {
      await apiRequest(`/api/savings-goals/${contribGoal.id}/contribute`, {
        method: 'POST',
        body: JSON.stringify({ amount: amt.toFixed(2) }),
      });
      showToast(`Added ${formatINR(amt)} to '${contribGoal.title}'!`, 'success');
      setContribGoal(null);
      setContribAmount('');
      loadAll();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Contribution failed', 'error');
    }
  };

  const handleDeleteGoal = async (id: number, title: string) => {
    if (!window.confirm(`Delete savings goal '${title}'?`)) return;
    try {
      await apiRequest(`/api/savings-goals/${id}`, { method: 'DELETE' });
      showToast('Savings goal deleted.', 'info');
      loadAll();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Delete failed', 'error');
    }
  };

  const handleCreateRecurring = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(recAmount);
    if (!recTitle.trim() || isNaN(amt) || amt <= 0 || !recCategoryId) {
      showToast('Please complete all recurring transaction fields.', 'error');
      return;
    }

    try {
      await apiRequest('/api/recurring-transactions', {
        method: 'POST',
        body: JSON.stringify({
          category_id: recCategoryId,
          transaction_type: recType,
          title: recTitle.trim(),
          amount: amt.toFixed(2),
          payment_method: recMethod,
          frequency: recFrequency,
          next_occurrence: recNextDate,
          auto_create: true,
        }),
      });
      showToast('Recurring schedule created!', 'success');
      setShowCreateRec(false);
      setRecTitle('');
      setRecAmount('');
      loadAll();
    } catch (err: unknown) {
      showToast(
        err instanceof Error ? err.message : 'Failed to create recurring transaction',
        'error'
      );
    }
  };

  const handleProcessDue = async () => {
    try {
      const res = await apiRequest<{ processed_count: number }>(
        '/api/recurring-transactions/process',
        { method: 'POST' }
      );
      showToast(
        res.processed_count > 0
          ? `Processed ${res.processed_count} due recurring transaction(s).`
          : 'All due recurring transactions are already up to date (no duplicates created).',
        'info'
      );
      loadAll();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Processing failed', 'error');
    }
  };

  const handleDeleteRecurring = async (id: number, title: string) => {
    if (!window.confirm(`Delete recurring rule '${title}'?`)) return;
    try {
      await apiRequest(`/api/recurring-transactions/${id}`, { method: 'DELETE' });
      showToast('Recurring transaction removed.', 'info');
      loadAll();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Delete failed', 'error');
    }
  };

  return (
    <div className="space-y-8">
      {/* SECTION 1: SAVINGS GOALS */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-navy-950">Savings Goals</h2>
            <p className="text-xs text-slate-500">
              Set financial targets (e.g., Buy a Laptop, Emergency Fund) and track manual progress toward completion.
            </p>
          </div>
          <button
            onClick={() => setShowCreateGoal(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>New Savings Goal</span>
          </button>
        </div>

        {/* Important Transparency Note */}
        <div className="p-3.5 rounded-xl bg-blue-50/80 border border-blue-200 flex items-start gap-2.5 text-xs text-blue-950">
          <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
          <span>
            <strong>Note on Manually Tracked Goals:</strong> Savings goals represent your personal target allocations tracked inside this application and are separate from funds held in an external bank account.
          </span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-xs text-slate-400">
            Loading savings goals...
          </div>
        ) : goals.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center space-y-2">
            <Target className="w-8 h-8 text-slate-300 mx-auto" />
            <div className="text-sm font-bold text-navy-950">No Savings Goals Yet</div>
            <p className="text-xs text-slate-500">
              Create your first savings goal to start tracking your progress.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {goals.map((g) => (
              <div
                key={g.id}
                className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-bold text-sm text-navy-950">{g.title}</h3>
                      {g.target_date && (
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Target Date: {g.target_date}
                        </p>
                      )}
                    </div>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                        g.status === 'completed'
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-blue-100 text-blue-700'
                      }`}
                    >
                      {g.status}
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-2 p-3 rounded-xl bg-slate-50 text-xs">
                    <div>
                      <span className="text-[10px] text-slate-400 block">Target</span>
                      <span className="font-bold text-navy-950">
                        {formatINR(g.target_amount)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block">Saved</span>
                      <span className="font-bold text-emerald-600">
                        {formatINR(g.current_amount)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block">Remaining</span>
                      <span className="font-bold text-blue-600">
                        {formatINR(g.remaining_amount)}
                      </span>
                    </div>
                  </div>

                  <div className="mt-4">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-500">Completion</span>
                      <span className="font-bold text-navy-950">
                        {g.percentage_completed}%
                      </span>
                    </div>
                    <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full"
                        style={{
                          width: `${Math.min(100, g.percentage_completed)}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                  <button
                    onClick={() => {
                      setContribGoal(g);
                      setContribAmount('');
                    }}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-semibold cursor-pointer"
                  >
                    <PlusCircle className="w-3.5 h-3.5" />
                    <span>+ Add Savings</span>
                  </button>
                  <button
                    onClick={() => handleDeleteGoal(g.id, g.title)}
                    className="p-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 cursor-pointer"
                    title="Delete Goal"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* SECTION 2: RECURRING TRANSACTIONS */}
      <div className="space-y-4 pt-4 border-t border-slate-200">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-navy-950">
              Recurring Income & Subscriptions
            </h2>
            <p className="text-xs text-slate-500">
              Automate monthly salary, rent, internet bills, and subscriptions with idempotent duplicate protection.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={handleProcessDue}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-navy-950 cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 text-blue-600" />
              <span>Process Due Occurrences</span>
            </button>
            <button
              onClick={() => setShowCreateRec(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-navy-950 hover:bg-navy-800 text-white text-xs font-semibold cursor-pointer"
            >
              <Repeat className="w-3.5 h-3.5" />
              <span>Add Recurring Rule</span>
            </button>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          {recurring.length === 0 ? (
            <div className="p-10 text-center text-xs text-slate-400">
              No recurring transactions configured yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase">
                    <th className="py-3 px-4">Title</th>
                    <th className="py-3 px-4">Category</th>
                    <th className="py-3 px-4">Frequency</th>
                    <th className="py-3 px-4">Next Occurrence</th>
                    <th className="py-3 px-4 text-right">Amount</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recurring.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/80">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <IconBadge
                            icon={r.category_icon}
                            color={r.category_color}
                            size="sm"
                          />
                          <div>
                            <div className="font-bold text-navy-950">{r.title}</div>
                            <div className="text-[11px] text-slate-400">
                              {r.payment_method}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4">{r.category_name}</td>
                      <td className="py-3 px-4 capitalize font-medium">{r.frequency}</td>
                      <td className="py-3 px-4">
                        <span className="font-semibold text-navy-950">
                          {r.next_occurrence}
                        </span>
                        <span className="ml-2 text-[11px] text-slate-400">
                          ({r.days_until_due >= 0 ? `in ${r.days_until_due}d` : 'due'})
                        </span>
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-bold ${
                          r.transaction_type === 'income'
                            ? 'text-emerald-600'
                            : 'text-navy-950'
                        }`}
                      >
                        {r.transaction_type === 'income' ? '+' : '-'}
                        {formatINR(r.amount)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => handleDeleteRecurring(r.id, r.title)}
                          className="p-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Create Goal Modal */}
      {showCreateGoal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h3 className="text-base font-bold text-navy-950">Create Savings Goal</h3>
              <button
                onClick={() => setShowCreateGoal(false)}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateGoal} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Goal Name *
                </label>
                <input
                  type="text"
                  required
                  value={goalTitle}
                  onChange={(e) => setGoalTitle(e.target.value)}
                  placeholder="e.g., Buy a Laptop"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Target Amount (₹) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    required
                    value={targetAmount}
                    onChange={(e) => setTargetAmount(e.target.value)}
                    placeholder="50000"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Current Saved (₹)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={currentAmount}
                    onChange={(e) => setCurrentAmount(e.target.value)}
                    placeholder="15000"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Target Date (Optional)
                </label>
                <input
                  type="date"
                  value={targetDate}
                  onChange={(e) => setTargetDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300"
                />
              </div>
              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateGoal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-blue-600 text-white font-semibold cursor-pointer"
                >
                  Create Goal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Contribution Modal */}
      {contribGoal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl border border-slate-200">
            <h3 className="text-base font-bold text-navy-950 mb-1">
              Add Savings to "{contribGoal.title}"
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Current Saved: {formatINR(contribGoal.current_amount)} /{' '}
              {formatINR(contribGoal.target_amount)}
            </p>
            <form onSubmit={handleContribute} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Contribution Amount (INR ₹) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="1"
                  required
                  value={contribAmount}
                  onChange={(e) => setContribAmount(e.target.value)}
                  placeholder="e.g., 5000"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-bold"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setContribGoal(null)}
                  className="px-3.5 py-2 rounded-xl border border-slate-200 text-slate-600 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-semibold cursor-pointer"
                >
                  Add Contribution
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Recurring Modal */}
      {showCreateRec && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h3 className="text-base font-bold text-navy-950">
                New Recurring Transaction
              </h3>
              <button
                onClick={() => setShowCreateRec(false)}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateRecurring} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Type *
                  </label>
                  <select
                    value={recType}
                    onChange={(e) => {
                      const t = e.target.value as 'expense' | 'income';
                      setRecType(t);
                      const first = categories.find((c) => c.category_type === t);
                      if (first) setRecCategoryId(first.id);
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white"
                  >
                    <option value="expense">Expense</option>
                    <option value="income">Income</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Category *
                  </label>
                  <select
                    value={recCategoryId}
                    onChange={(e) => setRecCategoryId(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white"
                  >
                    {categories
                      .filter((c) => c.category_type === recType)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Title *
                </label>
                <input
                  type="text"
                  required
                  value={recTitle}
                  onChange={(e) => setRecTitle(e.target.value)}
                  placeholder="e.g., Monthly Rent, Salary, Broadband Plan"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Amount (INR ₹) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    required
                    value={recAmount}
                    onChange={(e) => setRecAmount(e.target.value)}
                    placeholder="15000"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Frequency *
                  </label>
                  <select
                    value={recFrequency}
                    onChange={(e) =>
                      setRecFrequency(
                        e.target.value as 'daily' | 'weekly' | 'monthly' | 'yearly'
                      )
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white"
                  >
                    <option value="monthly">Monthly</option>
                    <option value="weekly">Weekly</option>
                    <option value="daily">Daily</option>
                    <option value="yearly">Yearly</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Next Occurrence Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={recNextDate}
                    onChange={(e) => setRecNextDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Payment Method
                  </label>
                  <input
                    type="text"
                    value={recMethod}
                    onChange={(e) => setRecMethod(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateRec(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-navy-950 text-white font-semibold cursor-pointer"
                >
                  Save Schedule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
