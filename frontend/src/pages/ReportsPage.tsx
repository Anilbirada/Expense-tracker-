import React, { useState, useEffect, useCallback } from 'react';
import {
  Download,
  FileSpreadsheet,
  FileText,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { apiRequest, downloadReportFile, formatINR } from '../api';
import {
  DashboardSummary,
  MonthlyComparisonItem,
  CategoryBreakdownItem,
  Budget,
  Transaction,
} from '../types';
import { useAuth } from '../context/AuthContext';
import { IconBadge } from '../components/IconBadge';

interface ReportResponse {
  summary: DashboardSummary;
  monthly_comparisons: MonthlyComparisonItem[];
  expense_breakdown: CategoryBreakdownItem[];
  income_breakdown: CategoryBreakdownItem[];
  budget_performance: Budget[];
  transactions: Transaction[];
}

export const ReportsPage: React.FC = () => {
  const { showToast } = useAuth();

  const [period, setPeriod] = useState<string>('this_month');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [report, setReport] = useState<ReportResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [exportingCsv, setExportingCsv] = useState<boolean>(false);
  const [exportingPdf, setExportingPdf] = useState<boolean>(false);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      let query = `?period=${period}`;
      if (period === 'custom' && startDate && endDate) {
        query = `?start_date=${startDate}&end_date=${endDate}`;
      }
      const data = await apiRequest<ReportResponse>(`/api/reports/summary${query}`);
      setReport(data);
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Failed to load report', 'error');
    } finally {
      setLoading(false);
    }
  }, [period, startDate, endDate, showToast]);

  useEffect(() => {
    if (period !== 'custom' || (startDate && endDate)) {
      fetchReport();
    }
  }, [period, startDate, endDate, fetchReport]);

  const handleExportCsv = async () => {
    setExportingCsv(true);
    try {
      let query = `?period=${period}`;
      if (period === 'custom' && startDate && endDate) {
        query = `?start_date=${startDate}&end_date=${endDate}`;
      }
      await downloadReportFile(
        `/api/reports/export/csv${query}`,
        `expense_tracker_report_${period}.csv`
      );
      showToast('CSV financial report downloaded successfully!', 'success');
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'CSV export failed', 'error');
    } finally {
      setExportingCsv(false);
    }
  };

  const handleExportPdf = async () => {
    setExportingPdf(true);
    try {
      let query = `?period=${period}`;
      if (period === 'custom' && startDate && endDate) {
        query = `?start_date=${startDate}&end_date=${endDate}`;
      }
      await downloadReportFile(
        `/api/reports/export/pdf${query}`,
        `expense_tracker_statement_${period}.pdf`
      );
      showToast('PDF financial statement downloaded successfully!', 'success');
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'PDF export failed', 'error');
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Export Buttons */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-navy-950">
            Financial Statements & Reports
          </h2>
          <p className="text-xs text-slate-500">
            Analyze category-wise spending, monthly comparisons, budget performance, and export verifiable CSV/PDF statements.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold bg-white"
          >
            <option value="this_month">This Month</option>
            <option value="previous_month">Previous Month</option>
            <option value="this_week">This Week</option>
            <option value="this_year">This Year</option>
            <option value="all_time">All Time</option>
            <option value="custom">Custom Date Range</option>
          </select>

          <button
            onClick={handleExportCsv}
            disabled={exportingCsv}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs cursor-pointer disabled:opacity-50"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>{exportingCsv ? 'Exporting CSV...' : 'Export CSV'}</span>
          </button>

          <button
            onClick={handleExportPdf}
            disabled={exportingPdf}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-navy-950 hover:bg-navy-800 text-white text-xs font-semibold shadow-xs cursor-pointer disabled:opacity-50"
          >
            <FileText className="w-4 h-4" />
            <span>{exportingPdf ? 'Generating PDF...' : 'Download PDF Report'}</span>
          </button>
        </div>
      </div>

      {period === 'custom' && (
        <div className="bg-white rounded-2xl border border-blue-200 p-4 flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              From Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-300 text-xs"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              To Date
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-300 text-xs"
            />
          </div>
          <button
            onClick={fetchReport}
            className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold cursor-pointer"
          >
            Generate Report
          </button>
        </div>
      )}

      {loading || !report ? (
        <div className="p-12 text-center text-xs text-slate-400">
          Calculating financial report...
        </div>
      ) : (
        <>
          {/* Executive Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <span className="text-xs font-semibold text-slate-500">
                Period Total Income
              </span>
              <div className="mt-2 text-2xl font-extrabold text-emerald-600">
                {formatINR(report.summary.total_income)}
              </div>
              <p className="mt-1 text-[11px] text-slate-400">
                {report.summary.income_transaction_count} income entries
              </p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <span className="text-xs font-semibold text-slate-500">
                Period Total Expenses
              </span>
              <div className="mt-2 text-2xl font-extrabold text-rose-600">
                {formatINR(report.summary.total_expenses)}
              </div>
              <p className="mt-1 text-[11px] text-slate-400">
                {report.summary.expense_transaction_count} expense entries
              </p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <span className="text-xs font-semibold text-slate-500">Net Savings</span>
              <div className="mt-2 text-2xl font-extrabold text-navy-950">
                {formatINR(report.summary.net_balance)}
              </div>
              <p className="mt-1 text-[11px] text-slate-400">
                Income minus Expenses
              </p>
            </div>

            <div className="bg-navy-950 text-white rounded-2xl border border-navy-800 p-5">
              <span className="text-xs font-semibold text-blue-300">
                Savings Efficiency Rate
              </span>
              <div className="mt-2 text-2xl font-extrabold text-white">
                {report.summary.savings_rate}%
              </div>
              <p className="mt-1 text-[11px] text-slate-300">
                Period: {report.summary.period_label}
              </p>
            </div>
          </div>

          {/* Category-Wise Breakdown & Monthly Comparison */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Category Breakdown Table */}
            <div className="lg:col-span-6 bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
              <h3 className="text-sm font-bold text-navy-950 mb-1">
                Category-Wise Expense Breakdown
              </h3>
              <p className="text-xs text-slate-500 mb-4">
                Exact spending share per category for {report.summary.period_label}
              </p>

              {report.expense_breakdown.length === 0 ? (
                <p className="text-xs text-slate-400 py-8 text-center">
                  No expenses recorded in this period.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-[11px] font-bold text-slate-400 uppercase">
                        <th className="py-2.5">Category</th>
                        <th className="py-2.5 text-center">Tx Count</th>
                        <th className="py-2.5 text-right">Amount</th>
                        <th className="py-2.5 text-right">Share</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {report.expense_breakdown.map((c) => (
                        <tr key={c.category_id}>
                          <td className="py-2.5 flex items-center gap-2">
                            <IconBadge icon={c.icon} color={c.color} size="sm" />
                            <span className="font-semibold text-navy-950">
                              {c.category_name}
                            </span>
                          </td>
                          <td className="py-2.5 text-center text-slate-500">
                            {c.transaction_count}
                          </td>
                          <td className="py-2.5 text-right font-bold text-navy-950">
                            {formatINR(c.amount)}
                          </td>
                          <td className="py-2.5 text-right font-semibold text-blue-600">
                            {c.percentage}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Monthly Comparison Chart */}
            <div className="lg:col-span-6 bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
              <h3 className="text-sm font-bold text-navy-950 mb-1">
                6-Month Income vs. Expense Comparison
              </h3>
              <p className="text-xs text-slate-500 mb-4">
                Historical monthly performance and net savings
              </p>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={report.monthly_comparisons}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(value: number) => formatINR(value)} />
                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                    <Bar
                      dataKey="income"
                      name="Income"
                      fill="#10b981"
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      dataKey="expenses"
                      name="Expenses"
                      fill="#ef4444"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Budget Performance Table */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
            <h3 className="text-sm font-bold text-navy-950 mb-1">
              Budget Performance Audit
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Comparison of budgeted limits against actual category expenditure
            </p>
            {report.budget_performance.length === 0 ? (
              <p className="text-xs text-slate-400 py-4">
                No active budgets configured for this period.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase">
                      <th className="py-3 px-4">Category</th>
                      <th className="py-3 px-4">Period</th>
                      <th className="py-3 px-4 text-right">Allocated Budget</th>
                      <th className="py-3 px-4 text-right">Actual Spent</th>
                      <th className="py-3 px-4 text-right">Variance / Remaining</th>
                      <th className="py-3 px-4 text-center">Utilization</th>
                      <th className="py-3 px-4 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {report.budget_performance.map((b) => (
                      <tr key={b.id}>
                        <td className="py-3 px-4 font-bold text-navy-950">
                          {b.category_name}
                        </td>
                        <td className="py-3 px-4 text-slate-500">
                          {b.period_start} to {b.period_end}
                        </td>
                        <td className="py-3 px-4 text-right font-semibold">
                          {formatINR(b.budget_amount)}
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-blue-600">
                          {formatINR(b.spent_amount)}
                        </td>
                        <td
                          className={`py-3 px-4 text-right font-bold ${
                            b.remaining_amount >= 0 ? 'text-emerald-600' : 'text-red-600'
                          }`}
                        >
                          {formatINR(b.remaining_amount)}
                        </td>
                        <td className="py-3 px-4 text-center font-bold">
                          {b.percentage_used}%
                        </td>
                        <td className="py-3 px-4 text-right">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                              b.status === 'Exceeded'
                                ? 'bg-red-100 text-red-700'
                                : b.status === 'Approaching Limit'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-emerald-100 text-emerald-700'
                            }`}
                          >
                            {b.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
