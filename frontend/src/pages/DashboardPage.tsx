import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  PiggyBank,
  AlertTriangle,
  Calendar,
  Info,
  Sparkles,
  PlusCircle,
  MinusCircle,
  ArrowRight,
} from 'lucide-react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  AreaChart,
  Area,
} from 'recharts';
import { apiRequest, formatINR } from '../api';
import {
  DashboardSummary,
  SpendingTrendsResponse,
  SpendingInsightsResponse,
} from '../types';
import { IconBadge } from '../components/IconBadge';

export const DashboardPage: React.FC = () => {
  const [period, setPeriod] = useState<string>('this_month');
  const [customStart, setCustomStart] = useState<string>('');
  const [customEnd, setCustomEnd] = useState<string>('');
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [trends, setTrends] = useState<SpendingTrendsResponse | null>(null);
  const [insights, setInsights] = useState<SpendingInsightsResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [showFormulas, setShowFormulas] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let query = `?period=${period}`;
      let trendQuery = `?months=6`;
      const insightBody: Record<string, string> = {};

      if (period === 'custom' && customStart && customEnd) {
        query = `?start_date=${customStart}&end_date=${customEnd}`;
        trendQuery = `?months=6&start_date=${customStart}&end_date=${customEnd}`;
        insightBody.start_date = customStart;
        insightBody.end_date = customEnd;
      }

      const [sumData, trendData, insightData] = await Promise.all([
        apiRequest<DashboardSummary>(`/api/dashboard/summary${query}`),
        apiRequest<SpendingTrendsResponse>(`/api/dashboard/spending-trends${trendQuery}`),
        apiRequest<SpendingInsightsResponse>('/api/insights/spending', {
          method: 'POST',
          body: JSON.stringify(insightBody),
        }),
      ]);

      setSummary(sumData);
      setTrends(trendData);
      setInsights(insightData);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard data.');
    } finally {
      setLoading(false);
    }
  }, [period, customStart, customEnd]);

  useEffect(() => {
    if (period !== 'custom' || (customStart && customEnd)) {
      loadDashboard();
    }
  }, [period, customStart, customEnd, loadDashboard]);

  const periodOptions = [
    { id: 'today', label: 'Today' },
    { id: 'this_week', label: 'This Week' },
    { id: 'this_month', label: 'This Month' },
    { id: 'previous_month', label: 'Previous Month' },
    { id: 'this_year', label: 'This Year' },
    { id: 'all_time', label: 'All Time' },
    { id: 'custom', label: 'Custom Range' },
  ];

  return (
    <div className="space-y-6">
      {/* Top Filter & Quick Action Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-navy-950">Financial Overview</h2>
            {summary && (
              <span className="px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-xs font-semibold">
                {summary.period_label}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time metrics calculated from your verified database records.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap items-center bg-slate-100 p-1 rounded-xl gap-1">
            {periodOptions.map((opt) => (
              <button
                key={opt.id}
                onClick={() => setPeriod(opt.id)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  period === opt.id
                    ? 'bg-navy-950 text-white shadow-xs'
                    : 'text-slate-600 hover:text-navy-950'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <button
            onClick={() => setShowFormulas((prev) => !prev)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
            title="How each metric is calculated"
          >
            <Info className="w-3.5 h-3.5 text-blue-600" />
            <span>How Metrics Work</span>
          </button>
        </div>
      </div>

      {/* Custom Date Range Picker */}
      {period === 'custom' && (
        <div className="bg-white rounded-2xl border border-blue-200 p-4 flex flex-wrap items-end gap-4 shadow-xs">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Start Date
            </label>
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-300 text-xs"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              End Date
            </label>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-300 text-xs"
            />
          </div>
          <button
            onClick={loadDashboard}
            disabled={!customStart || !customEnd}
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold disabled:opacity-50 cursor-pointer"
          >
            Apply Date Filter
          </button>
        </div>
      )}

      {/* Formula Transparency Callout */}
      {showFormulas && summary && (
        <div className="bg-navy-950 text-white rounded-2xl p-5 border border-navy-800 space-y-3 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-bold text-sm text-blue-300 flex items-center gap-2">
              <Info className="w-4 h-4" />
              Transparent Financial Calculation Formulas
            </span>
            <button
              onClick={() => setShowFormulas(false)}
              className="text-slate-400 hover:text-white"
            >
              ✕
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            <div className="p-3 rounded-xl bg-navy-900 border border-navy-800">
              <strong className="text-emerald-400 block mb-1">Total Income</strong>
              {summary.formulas_explanation.total_income}
            </div>
            <div className="p-3 rounded-xl bg-navy-900 border border-navy-800">
              <strong className="text-rose-400 block mb-1">Total Expenses</strong>
              {summary.formulas_explanation.total_expenses}
            </div>
            <div className="p-3 rounded-xl bg-navy-900 border border-navy-800">
              <strong className="text-blue-300 block mb-1">
                Net Period Balance vs. Bank Balance
              </strong>
              {summary.formulas_explanation.net_balance}
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 font-medium">
          {error}
        </div>
      )}

      {loading || !summary ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((n) => (
            <div
              key={n}
              className="h-32 bg-white rounded-2xl border border-slate-200 p-5 animate-pulse"
            />
          ))}
        </div>
      ) : (
        <>
          {/* 4 Primary KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Total Income */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Total Income
                </span>
                <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-3 text-2xl font-extrabold text-navy-950">
                {formatINR(summary.total_income)}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Across <strong>{summary.income_transaction_count}</strong> income record(s)
              </p>
            </div>

            {/* Total Expenses */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Total Expenses
                </span>
                <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
                  <TrendingDown className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-3 text-2xl font-extrabold text-navy-950">
                {formatINR(summary.total_expenses)}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Across <strong>{summary.expense_transaction_count}</strong> expense record(s)
              </p>
            </div>

            {/* Net Period Balance */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Net Period Balance
                </span>
                <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <Wallet className="w-5 h-5" />
                </div>
              </div>
              <div
                className={`mt-3 text-2xl font-extrabold ${
                  summary.net_balance >= 0 ? 'text-navy-950' : 'text-rose-600'
                }`}
              >
                {formatINR(summary.net_balance)}
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                Income − Expenses (Recorded Net Cashflow)
              </p>
            </div>

            {/* Monthly Savings & Rate */}
            <div className="bg-navy-950 text-white rounded-2xl border border-navy-800 p-5 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-blue-300 uppercase tracking-wider">
                  Monthly Savings
                </span>
                <div className="w-9 h-9 rounded-xl bg-blue-600/30 text-blue-300 flex items-center justify-center">
                  <PiggyBank className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-3 text-2xl font-extrabold text-white">
                {formatINR(summary.monthly_savings)}
              </div>
              <div className="mt-1 flex items-center justify-between text-xs text-slate-300">
                <span>Savings Rate: {summary.savings_rate}%</span>
                <span>Budget Used: {summary.budget_utilization_percentage}%</span>
              </div>
            </div>
          </div>

          {/* Budget Warnings Alert Banner */}
          {summary.budget_warnings.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 sm:p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-amber-950 font-bold text-sm">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  <span>Active Budget Threshold Warnings ({summary.budget_warnings.length})</span>
                </div>
                <Link
                  to="/budgets"
                  className="text-xs font-semibold text-blue-600 hover:underline"
                >
                  Manage Budgets →
                </Link>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {summary.budget_warnings.map((bw) => (
                  <div
                    key={bw.id}
                    className="bg-white rounded-xl p-3.5 border border-amber-200/80 shadow-2xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-navy-950">
                        {bw.category_name}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          bw.status === 'Exceeded'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {bw.status} ({bw.percentage_used}%)
                      </span>
                    </div>
                    <div className="mt-2 text-xs text-slate-600 flex justify-between">
                      <span>Spent: {formatINR(bw.spent_amount)}</span>
                      <span>Budget: {formatINR(bw.budget_amount)}</span>
                    </div>
                    <div className="mt-2 w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          bw.status === 'Exceeded' ? 'bg-red-600' : 'bg-amber-500'
                        }`}
                        style={{ width: `${Math.min(100, bw.percentage_used)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Interactive Charts Row 1: Income vs Expenses Bar Chart & Category Expense Pie Chart */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Monthly Income vs Expenses Bar Chart */}
            <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-bold text-navy-950">
                    Income vs. Expenses & Savings Trend (Last 6 Months)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Month-by-month comparison from verified ledger records
                  </p>
                </div>
              </div>
              <div className="h-72">
                {trends && trends.monthly_comparison.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={trends.monthly_comparison}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip
                        formatter={(value: number) => formatINR(value)}
                        contentStyle={{
                          borderRadius: '12px',
                          borderColor: '#cbd5e1',
                          fontSize: '12px',
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: '12px' }} />
                      <Bar
                        dataKey="income"
                        name="Income"
                        fill="#10b981"
                        radius={[6, 6, 0, 0]}
                      />
                      <Bar
                        dataKey="expenses"
                        name="Expenses"
                        fill="#2563eb"
                        radius={[6, 6, 0, 0]}
                      />
                      <Bar
                        dataKey="savings"
                        name="Net Savings"
                        fill="#0f172a"
                        radius={[6, 6, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-xs text-slate-400">
                    No monthly trend data available yet.
                  </div>
                )}
              </div>
            </div>

            {/* Expense Distribution by Category Pie Chart */}
            <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
              <div className="mb-4">
                <h3 className="text-sm font-bold text-navy-950">
                  Expense Distribution by Category
                </h3>
                <p className="text-xs text-slate-500">
                  Share of total spending for {summary.period_label}
                </p>
              </div>
              <div className="h-72">
                {summary.highest_spending_categories.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={summary.highest_spending_categories}
                        dataKey="amount"
                        nameKey="category_name"
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={88}
                        paddingAngle={2}
                      >
                        {summary.highest_spending_categories.map((entry) => (
                          <Cell key={entry.category_id} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: number) => formatINR(value)}
                        contentStyle={{
                          borderRadius: '12px',
                          borderColor: '#cbd5e1',
                          fontSize: '12px',
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: '11px' }} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center p-4">
                    <p className="text-xs text-slate-500 mb-3">
                      No expenses recorded for this period yet.
                    </p>
                    <Link
                      to="/add-expense"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold"
                    >
                      <MinusCircle className="w-3.5 h-3.5" />
                      <span>Record First Expense</span>
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Interactive Charts Row 2: Daily Spending Trend Line/Area Chart & Budget Progress */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Spending Trend Over Time */}
            <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
              <div className="mb-4">
                <h3 className="text-sm font-bold text-navy-950">
                  Daily Spending & Cumulative Outflow Timeline
                </h3>
                <p className="text-xs text-slate-500">
                  Track daily spending spikes and cumulative outflow progression
                </p>
              </div>
              <div className="h-64">
                {trends && trends.daily_trend.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={trends.daily_trend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip
                        formatter={(value: number) => formatINR(value)}
                        contentStyle={{
                          borderRadius: '12px',
                          borderColor: '#cbd5e1',
                          fontSize: '12px',
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: '12px' }} />
                      <Area
                        type="monotone"
                        dataKey="expenses"
                        name="Daily Expense"
                        stroke="#ef4444"
                        fill="#fee2e2"
                        strokeWidth={2}
                      />
                      <Area
                        type="monotone"
                        dataKey="cumulative_expenses"
                        name="Cumulative Expense"
                        stroke="#2563eb"
                        fill="#dbeafe"
                        strokeWidth={2}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-xs text-slate-400">
                    No daily transactions recorded in this date range.
                  </div>
                )}
              </div>
            </div>

            {/* Highest Spending Categories & Budget Utilization Progress */}
            <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-bold text-navy-950">
                      Highest-Spending Categories
                    </h3>
                    <p className="text-xs text-slate-500">
                      Ranked by total expense amount
                    </p>
                  </div>
                  <Link
                    to="/categories"
                    className="text-xs font-semibold text-blue-600 hover:underline"
                  >
                    Categories →
                  </Link>
                </div>

                {summary.highest_spending_categories.length === 0 ? (
                  <p className="text-xs text-slate-400 py-8 text-center">
                    No expense categories active in this period.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {summary.highest_spending_categories.slice(0, 5).map((cat) => (
                      <div key={cat.category_id} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <IconBadge icon={cat.icon} color={cat.color} size="sm" />
                            <div>
                              <span className="font-semibold text-navy-950">
                                {cat.category_name}
                              </span>
                              <span className="text-[11px] text-slate-400 ml-1.5">
                                ({cat.transaction_count} tx)
                              </span>
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="font-bold text-navy-950">
                              {formatINR(cat.amount)}
                            </span>
                            <span className="text-[11px] text-slate-500 ml-1">
                              ({cat.percentage}%)
                            </span>
                          </div>
                        </div>
                        <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.min(100, cat.percentage)}%`,
                              backgroundColor: cat.color,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                <span className="text-slate-500">Overall Budget Utilization:</span>
                <span className="font-bold text-navy-950">
                  {formatINR(summary.total_budget_spent)} / {formatINR(summary.total_budgeted)} (
                  {summary.budget_utilization_percentage}%)
                </span>
              </div>
            </div>
          </div>

          {/* Bottom Row: AI-Powered Spending Insights & Recent Transactions */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* AI-Powered / Rule-Based Financial Insights Panel */}
            <div className="lg:col-span-5 bg-navy-950 text-white rounded-2xl border border-navy-800 p-5 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center">
                      <Sparkles className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white">
                        Smart Spending Insights
                      </h3>
                      <p className="text-[11px] text-blue-300">
                        Verified against real database summaries
                      </p>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded-md bg-navy-800 text-[10px] text-slate-300 font-medium">
                    {insights?.provider === 'llm_api' ? 'LLM Enhanced' : 'Rule-Based Engine'}
                  </span>
                </div>

                <div className="space-y-2.5 mt-4">
                  {insights?.insights.map((item, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-xl bg-navy-900/90 border border-navy-800 text-xs"
                    >
                      <div className="font-bold text-blue-300 mb-0.5">{item.title}</div>
                      <p className="text-slate-300 leading-relaxed">{item.description}</p>
                    </div>
                  ))}
                </div>
              </div>

              {insights && (
                <p className="mt-4 pt-3 border-t border-navy-800 text-[10px] text-slate-400 leading-relaxed">
                  {insights.disclaimer}
                </p>
              )}
            </div>

            {/* Recent Transactions Table */}
            <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-bold text-navy-950">Recent Transactions</h3>
                  <p className="text-xs text-slate-500">
                    Latest income and expense entries in selected period
                  </p>
                </div>
                <Link
                  to="/transactions"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline"
                >
                  <span>View All</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>

              {summary.recent_transactions.length === 0 ? (
                <div className="py-12 text-center">
                  <Calendar className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-xs text-slate-500">
                    No transactions recorded for this period.
                  </p>
                  <div className="mt-3 flex justify-center gap-2">
                    <Link
                      to="/add-income"
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold"
                    >
                      <PlusCircle className="w-3.5 h-3.5" />
                      <span>Add Income</span>
                    </Link>
                    <Link
                      to="/add-expense"
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold"
                    >
                      <MinusCircle className="w-3.5 h-3.5" />
                      <span>Add Expense</span>
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 text-[11px] font-bold text-slate-400 uppercase">
                        <th className="py-2.5 pr-3">Transaction</th>
                        <th className="py-2.5 px-3">Category</th>
                        <th className="py-2.5 px-3">Date</th>
                        <th className="py-2.5 pl-3 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {summary.recent_transactions.map((tx) => (
                        <tr key={tx.id} className="hover:bg-slate-50/80">
                          <td className="py-3 pr-3">
                            <div className="flex items-center gap-2.5">
                              <IconBadge
                                icon={tx.category_icon}
                                color={tx.category_color}
                                size="sm"
                              />
                              <div>
                                <div className="font-semibold text-navy-950">{tx.title}</div>
                                <div className="text-[11px] text-slate-400">
                                  {tx.payment_method}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-3">
                            <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-medium text-[11px]">
                              {tx.category_name}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-slate-500">{tx.transaction_date}</td>
                          <td
                            className={`py-3 pl-3 text-right font-bold ${
                              tx.transaction_type === 'income'
                                ? 'text-emerald-600'
                                : 'text-navy-950'
                            }`}
                          >
                            {tx.transaction_type === 'income' ? '+' : '-'}
                            {formatINR(tx.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
