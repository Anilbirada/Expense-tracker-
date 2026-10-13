import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PlusCircle, MinusCircle, Check, ArrowLeft, Plus } from 'lucide-react';
import { apiRequest, formatINR } from '../api';
import { Category, Transaction } from '../types';
import { useAuth } from '../context/AuthContext';
import { IconBadge } from '../components/IconBadge';

interface AddTransactionPageProps {
  mode: 'income' | 'expense';
}

const PAYMENT_METHODS = [
  'UPI',
  'Bank Transfer',
  'Debit Card',
  'Credit Card',
  'Cash',
  'Cheque',
  'Net Banking',
];

export const AddTransactionPage: React.FC<AddTransactionPageProps> = ({ mode }) => {
  const navigate = useNavigate();
  const { showToast } = useAuth();

  const today = new Date().toISOString().split('T')[0];

  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState<number>(0);
  const [title, setTitle] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [transactionDate, setTransactionDate] = useState<string>(today);
  const [paymentMethod, setPaymentMethod] = useState<string>(
    mode === 'income' ? 'Bank Transfer' : 'UPI'
  );
  const [notes, setNotes] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Quick inline custom category creation
  const [showNewCat, setShowNewCat] = useState<boolean>(false);
  const [newCatName, setNewCatName] = useState<string>('');
  const [creatingCat, setCreatingCat] = useState<boolean>(false);

  useEffect(() => {
    setPaymentMethod(mode === 'income' ? 'Bank Transfer' : 'UPI');
    setTitle('');
    setAmount('');
    setNotes('');
    setError(null);

    apiRequest<Category[]>(`/api/categories?category_type=${mode}`)
      .then((data) => {
        setCategories(data);
        if (data.length > 0) {
          setCategoryId(data[0].id);
        }
      })
      .catch(() => {
        setError('Could not load categories.');
      });
  }, [mode]);

  const handleQuickCreateCategory = async () => {
    if (!newCatName.trim()) return;
    setCreatingCat(true);
    try {
      const created = await apiRequest<Category>('/api/categories', {
        method: 'POST',
        body: JSON.stringify({
          name: newCatName.trim(),
          category_type: mode,
          icon: mode === 'income' ? 'Wallet' : 'Tag',
          color: mode === 'income' ? '#10b981' : '#2563eb',
        }),
      });
      setCategories((prev) => [...prev, created]);
      setCategoryId(created.id);
      setNewCatName('');
      setShowNewCat(false);
      showToast(`Created custom ${mode} category '${created.name}'`, 'success');
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Failed to create category', 'error');
    } finally {
      setCreatingCat(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const numAmt = Number(amount);
    if (!title.trim()) {
      setError(`Please enter a ${mode === 'income' ? 'source / title' : 'title'} for this transaction.`);
      return;
    }
    if (!amount || isNaN(numAmt) || numAmt <= 0) {
      setError('Please enter a valid positive amount greater than ₹0.');
      return;
    }
    if (!categoryId) {
      setError('Please select a category.');
      return;
    }

    setSubmitting(true);
    try {
      await apiRequest<Transaction>('/api/transactions', {
        method: 'POST',
        body: JSON.stringify({
          category_id: categoryId,
          transaction_type: mode,
          title: title.trim(),
          amount: numAmt.toFixed(2),
          transaction_date: transactionDate,
          payment_method: paymentMethod,
          notes: notes.trim() || null,
        }),
      });
      showToast(
        `${mode === 'income' ? 'Income' : 'Expense'} of ${formatINR(numAmt)} recorded successfully!`,
        'success'
      );
      navigate('/transactions');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save transaction.');
    } finally {
      setSubmitting(false);
    }
  };

  const quickAmounts =
    mode === 'income'
      ? [1000, 5000, 15000, 25000, 50000]
      : [100, 250, 500, 1000, 2500, 5000];

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className={`w-11 h-11 rounded-2xl flex items-center justify-center ${
              mode === 'income'
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-blue-100 text-blue-700'
            }`}
          >
            {mode === 'income' ? (
              <PlusCircle className="w-6 h-6" />
            ) : (
              <MinusCircle className="w-6 h-6" />
            )}
          </div>
          <div>
            <h2 className="text-xl font-bold text-navy-950">
              {mode === 'income' ? 'Record New Income' : 'Record New Expense'}
            </h2>
            <p className="text-xs text-slate-500">
              {mode === 'income'
                ? 'Log salary, freelance payouts, scholarships, allowances, or business income.'
                : 'Log daily purchases, food, travel, rent, utilities, or educational expenses.'}
            </p>
          </div>
        </div>
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-white text-xs font-semibold text-slate-600 cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back</span>
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs">
        {error && (
          <div className="mb-5 p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Amount Input + Quick Chips */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Amount (INR ₹) *
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-bold text-slate-400">
                ₹
              </span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full pl-9 pr-4 py-3 rounded-xl border border-slate-300 text-lg font-bold text-navy-950 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-slate-400 mr-1">Quick select:</span>
              {quickAmounts.map((q) => (
                <button
                  type="button"
                  key={q}
                  onClick={() => setAmount(String(q))}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
                >
                  +₹{q.toLocaleString('en-IN')}
                </button>
              ))}
            </div>
          </div>

          {/* Title / Income Source */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              {mode === 'income' ? 'Income Source / Description *' : 'Expense Title *'}
            </label>
            <input
              type="text"
              required
              maxLength={200}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={
                mode === 'income'
                  ? 'e.g., Monthly Software Salary, Freelance Web Project, Scholarship'
                  : 'e.g., Supermarket Groceries, Metro Pass, Electricity Bill'
              }
              className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          {/* Category Selector Grid */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-semibold text-slate-700">
                {mode === 'income' ? 'Income Category *' : 'Expense Category *'}
              </label>
              <button
                type="button"
                onClick={() => setShowNewCat((prev) => !prev)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Custom Category</span>
              </button>
            </div>

            {showNewCat && (
              <div className="mb-3 p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center gap-2">
                <input
                  type="text"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  placeholder={`New ${mode} category name...`}
                  className="flex-1 px-3 py-1.5 rounded-lg border border-slate-300 text-xs"
                />
                <button
                  type="button"
                  onClick={handleQuickCreateCategory}
                  disabled={creatingCat}
                  className="px-3 py-1.5 rounded-lg bg-navy-950 text-white text-xs font-semibold cursor-pointer"
                >
                  {creatingCat ? 'Saving...' : 'Add'}
                </button>
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {categories.map((cat) => {
                const selected = categoryId === cat.id;
                return (
                  <button
                    type="button"
                    key={cat.id}
                    onClick={() => setCategoryId(cat.id)}
                    className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                      selected
                        ? 'bg-blue-50/80 border-blue-600 ring-1 ring-blue-600'
                        : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <IconBadge icon={cat.icon} color={cat.color} size="sm" />
                    <span className="text-xs font-semibold text-navy-950 truncate">
                      {cat.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Date & Payment Method */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Transaction Date *
              </label>
              <input
                type="date"
                required
                value={transactionDate}
                onChange={(e) => setTransactionDate(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Payment Method *
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                {PAYMENT_METHODS.map((pm) => (
                  <option key={pm} value={pm}>
                    {pm}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Optional Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Notes / Reference (Optional)
            </label>
            <textarea
              rows={3}
              maxLength={1000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any receipt details, vendor name, or personal remarks..."
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => navigate('/transactions')}
              className="px-4 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-600 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className={`inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-white font-semibold text-sm shadow-xs transition-colors cursor-pointer disabled:opacity-60 ${
                mode === 'income'
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              <Check className="w-4 h-4" />
              <span>
                {submitting
                  ? 'Saving Record...'
                  : mode === 'income'
                  ? 'Save Income Record'
                  : 'Save Expense Record'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
