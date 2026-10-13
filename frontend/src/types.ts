export interface User {
  id: number;
  name: string;
  email: string;
  user_type: 'individual' | 'student' | 'professional' | string;
  currency: string;
  budget_warning_threshold: number;
  budget_critical_threshold: number;
  is_demo: boolean;
  created_at: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface Category {
  id: number;
  user_id: number;
  name: string;
  category_type: 'income' | 'expense';
  icon: string;
  color: string;
  is_default: boolean;
  is_archived: boolean;
  transaction_count: number;
  created_at: string;
}

export interface Transaction {
  id: number;
  user_id: number;
  category_id: number;
  category_name: string;
  category_icon: string;
  category_color: string;
  transaction_type: 'income' | 'expense';
  title: string;
  amount: number;
  transaction_date: string;
  payment_method: string;
  notes?: string | null;
  recurring_id?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface PaginatedTransactions {
  items: Transaction[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  period_income: number;
  period_expense: number;
  period_net: number;
}

export interface Budget {
  id: number;
  user_id: number;
  category_id: number;
  category_name: string;
  category_icon: string;
  category_color: string;
  budget_amount: number;
  spent_amount: number;
  remaining_amount: number;
  percentage_used: number;
  status: 'Normal' | 'Approaching Limit' | 'Exceeded';
  period_start: string;
  period_end: string;
  warning_threshold: number;
  critical_threshold: number;
  created_at: string;
}

export interface CategoryBreakdownItem {
  category_id: number;
  category_name: string;
  icon: string;
  color: string;
  amount: number;
  percentage: number;
  transaction_count: number;
}

export interface DashboardSummary {
  period_label: string;
  start_date: string | null;
  end_date: string | null;
  total_income: number;
  total_expenses: number;
  net_balance: number;
  monthly_savings: number;
  monthly_income: number;
  monthly_expenses: number;
  savings_rate: number;
  income_transaction_count: number;
  expense_transaction_count: number;
  total_budgeted: number;
  total_budget_spent: number;
  budget_utilization_percentage: number;
  budgets: Budget[];
  budget_warnings: Budget[];
  highest_spending_categories: CategoryBreakdownItem[];
  recent_transactions: Transaction[];
  savings_goals_summary: {
    total_goals: number;
    total_target: number;
    total_saved: number;
  };
  formulas_explanation: {
    total_income: string;
    total_expenses: string;
    net_balance: string;
    monthly_savings: string;
    budget_utilization: string;
  };
}

export interface MonthlyComparisonItem {
  month: string;
  month_key: string;
  income: number;
  expenses: number;
  savings: number;
}

export interface DailyTrendItem {
  date: string;
  label: string;
  income: number;
  expenses: number;
  cumulative_expenses: number;
  net: number;
}

export interface SpendingTrendsResponse {
  monthly_comparison: MonthlyComparisonItem[];
  daily_trend: DailyTrendItem[];
}

export interface SavingsGoal {
  id: number;
  user_id: number;
  title: string;
  target_amount: number;
  current_amount: number;
  remaining_amount: number;
  percentage_completed: number;
  target_date?: string | null;
  status: 'active' | 'completed' | 'paused';
  notes?: string | null;
  created_at: string;
}

export interface RecurringTransaction {
  id: number;
  user_id: number;
  category_id: number;
  category_name: string;
  category_icon: string;
  category_color: string;
  transaction_type: 'income' | 'expense';
  title: string;
  amount: number;
  payment_method: string;
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
  next_occurrence: string;
  last_processed_date?: string | null;
  is_active: boolean;
  auto_create: boolean;
  days_until_due: number;
  notes?: string | null;
  created_at: string;
}

export interface NotificationItem {
  id: number;
  user_id: number;
  title: string;
  message: string;
  notification_type: string;
  is_read: boolean;
  created_at: string;
}

export interface SpendingInsightsResponse {
  provider: string;
  disclaimer: string;
  period_label: string;
  summary_metrics: {
    total_income: number;
    total_expenses: number;
    net_savings: number;
    savings_rate: number;
  };
  insights: Array<{
    type: string;
    title: string;
    description: string;
  }>;
  narrative: string;
}
