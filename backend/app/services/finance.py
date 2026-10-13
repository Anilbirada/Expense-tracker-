import csv
import io
import calendar
from datetime import date, datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional, Tuple, List, Dict, Any
from sqlalchemy import func
from sqlalchemy.orm import Session
import httpx

from app.config import settings
from app.models import (
    User,
    Category,
    Transaction,
    Budget,
    SavingsGoal,
    RecurringTransaction,
    Notification,
)

TWO_PLACES = Decimal("0.01")


def to_decimal(val: Any) -> Decimal:
    if val is None:
        return Decimal("0.00")
    if isinstance(val, Decimal):
        return val.quantize(TWO_PLACES, rounding=ROUND_HALF_UP)
    return Decimal(str(val)).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)


def to_float(val: Any) -> float:
    return float(to_decimal(val))


DEFAULT_CATEGORIES = [
    # Expense Categories
    {"name": "Food", "category_type": "expense", "icon": "Utensils", "color": "#ef4444"},
    {"name": "Travel", "category_type": "expense", "icon": "Car", "color": "#f97316"},
    {"name": "Education", "category_type": "expense", "icon": "GraduationCap", "color": "#8b5cf6"},
    {"name": "Shopping", "category_type": "expense", "icon": "ShoppingBag", "color": "#ec4899"},
    {"name": "Rent", "category_type": "expense", "icon": "Home", "color": "#6366f1"},
    {"name": "Utilities", "category_type": "expense", "icon": "Zap", "color": "#eab308"},
    {"name": "Healthcare", "category_type": "expense", "icon": "HeartPulse", "color": "#14b8a6"},
    {"name": "Entertainment", "category_type": "expense", "icon": "Film", "color": "#a855f7"},
    {"name": "Subscriptions", "category_type": "expense", "icon": "Repeat", "color": "#06b6d4"},
    {"name": "Other Expenses", "category_type": "expense", "icon": "MoreHorizontal", "color": "#64748b"},
    # Income Categories
    {"name": "Salary", "category_type": "income", "icon": "Briefcase", "color": "#10b981"},
    {"name": "Freelancing", "category_type": "income", "icon": "Laptop", "color": "#059669"},
    {"name": "Business Income", "category_type": "income", "icon": "TrendingUp", "color": "#0d9488"},
    {"name": "Scholarship", "category_type": "income", "icon": "Award", "color": "#2563eb"},
    {"name": "Allowance", "category_type": "income", "icon": "Wallet", "color": "#3b82f6"},
    {"name": "Other Income", "category_type": "income", "icon": "PlusCircle", "color": "#16a34a"},
]


def ensure_default_categories(db: Session, user_id: int) -> List[Category]:
    existing = db.query(Category).filter(Category.user_id == user_id).all()
    if existing:
        return existing

    created = []
    for item in DEFAULT_CATEGORIES:
        cat = Category(
            user_id=user_id,
            name=item["name"],
            category_type=item["category_type"],
            icon=item["icon"],
            color=item["color"],
            is_default=True,
            is_archived=False,
        )
        db.add(cat)
        created.append(cat)
    db.commit()
    for c in created:
        db.refresh(c)
    return created


def resolve_date_range(
    period: Optional[str] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    reference_date: Optional[date] = None,
) -> Tuple[Optional[date], Optional[date], str]:
    today = reference_date or date.today()

    if start_date and end_date:
        return start_date, end_date, f"{start_date.isoformat()} to {end_date.isoformat()}"

    p = (period or "this_month").lower()
    if p == "today":
        return today, today, "Today"
    elif p == "this_week":
        start = today - timedelta(days=today.weekday())
        end = start + timedelta(days=6)
        return start, end, "This Week"
    elif p == "this_month":
        start = today.replace(day=1)
        last_day = calendar.monthrange(today.year, today.month)[1]
        end = today.replace(day=last_day)
        return start, end, today.strftime("%B %Y")
    elif p == "previous_month":
        first_this = today.replace(day=1)
        last_prev = first_this - timedelta(days=1)
        first_prev = last_prev.replace(day=1)
        return first_prev, last_prev, last_prev.strftime("%B %Y")
    elif p == "last_3_months":
        end = today
        start = (today.replace(day=1) - timedelta(days=62)).replace(day=1)
        return start, end, "Last 3 Months"
    elif p == "this_year":
        start = date(today.year, 1, 1)
        end = date(today.year, 12, 31)
        return start, end, f"Year {today.year}"
    elif p == "all_time":
        return None, None, "All Time"

    # Default: this_month
    start = today.replace(day=1)
    last_day = calendar.monthrange(today.year, today.month)[1]
    end = today.replace(day=last_day)
    return start, end, today.strftime("%B %Y")


def calculate_budget_status(
    db: Session,
    budget: Budget,
    create_alerts: bool = True,
) -> Dict[str, Any]:
    spent_raw = (
        db.query(func.coalesce(func.sum(Transaction.amount), 0))
        .filter(
            Transaction.user_id == budget.user_id,
            Transaction.category_id == budget.category_id,
            Transaction.transaction_type == "expense",
            Transaction.transaction_date >= budget.period_start,
            Transaction.transaction_date <= budget.period_end,
        )
        .scalar()
    )
    budget_amt = to_decimal(budget.budget_amount)
    spent_amt = to_decimal(spent_raw)
    remaining_amt = budget_amt - spent_amt

    if budget_amt > Decimal("0.00"):
        pct = ((spent_amt / budget_amt) * Decimal("100")).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)
    else:
        pct = Decimal("0.00")

    warn_thresh = Decimal(str(budget.warning_threshold or 75))
    crit_thresh = Decimal(str(budget.critical_threshold or 100))

    if pct >= crit_thresh:
        status_label = "Exceeded"
    elif pct >= warn_thresh:
        status_label = "Approaching Limit"
    else:
        status_label = "Normal"

    cat_name = budget.category.name if budget.category else "Category"
    cat_icon = budget.category.icon if budget.category else "Tag"
    cat_color = budget.category.color if budget.category else "#2563eb"

    if create_alerts and status_label in ("Approaching Limit", "Exceeded"):
        dedup_key = f"budget_{budget.id}_{status_label}_{budget.period_start.isoformat()}"
        existing_notif = (
            db.query(Notification)
            .filter(
                Notification.user_id == budget.user_id,
                Notification.dedup_key == dedup_key,
            )
            .first()
        )
        if not existing_notif:
            if status_label == "Exceeded":
                title = f"Budget Exceeded: {cat_name}"
                over_by = spent_amt - budget_amt
                msg = (
                    f"Your {cat_name} spending (₹{spent_amt:,.2f}) has reached {pct}% of your "
                    f"₹{budget_amt:,.2f} budget for {budget.period_start.strftime('%b %Y')} "
                    f"(exceeded by ₹{max(Decimal('0.00'), over_by):,.2f})."
                )
                n_type = "budget_exceeded"
            else:
                title = f"Budget Alert: {cat_name} Approaching Limit"
                msg = (
                    f"You have used {pct}% (₹{spent_amt:,.2f} of ₹{budget_amt:,.2f}) of your "
                    f"{cat_name} budget for {budget.period_start.strftime('%b %Y')}. "
                    f"Remaining budget: ₹{max(Decimal('0.00'), remaining_amt):,.2f}."
                )
                n_type = "budget_warning"

            notif = Notification(
                user_id=budget.user_id,
                title=title,
                message=msg,
                notification_type=n_type,
                is_read=False,
                dedup_key=dedup_key,
            )
            db.add(notif)
            db.commit()

    return {
        "id": budget.id,
        "user_id": budget.user_id,
        "category_id": budget.category_id,
        "category_name": cat_name,
        "category_icon": cat_icon,
        "category_color": cat_color,
        "budget_amount": to_float(budget_amt),
        "spent_amount": to_float(spent_amt),
        "remaining_amount": to_float(remaining_amt),
        "percentage_used": to_float(pct),
        "status": status_label,
        "period_start": budget.period_start,
        "period_end": budget.period_end,
        "warning_threshold": budget.warning_threshold,
        "critical_threshold": budget.critical_threshold,
        "created_at": budget.created_at,
    }


def sync_user_budget_notifications(db: Session, user_id: int) -> None:
    budgets = db.query(Budget).filter(Budget.user_id == user_id).all()
    for b in budgets:
        calculate_budget_status(db, b, create_alerts=True)


def advance_date_by_frequency(current_date: date, frequency: str) -> date:
    if frequency == "daily":
        return current_date + timedelta(days=1)
    elif frequency == "weekly":
        return current_date + timedelta(days=7)
    elif frequency == "monthly":
        year = current_date.year + (current_date.month // 12)
        month = (current_date.month % 12) + 1
        last_day = calendar.monthrange(year, month)[1]
        day = min(current_date.day, last_day)
        return date(year, month, day)
    elif frequency == "yearly":
        try:
            return current_date.replace(year=current_date.year + 1)
        except ValueError:
            # Handle Feb 29 -> Feb 28
            return date(current_date.year + 1, 2, 28)
    return current_date + timedelta(days=30)


def process_due_recurring_transactions(
    db: Session,
    user_id: int,
    reference_date: Optional[date] = None,
) -> Dict[str, Any]:
    """
    Idempotently processes active recurring transactions due on or before reference_date,
    and generates upcoming reminders for items due within 3 days.
    """
    today = reference_date or date.today()
    recurring_items = (
        db.query(RecurringTransaction)
        .filter(
            RecurringTransaction.user_id == user_id,
            RecurringTransaction.is_active == True,
        )
        .all()
    )

    created_transactions: List[int] = []
    upcoming_alerts: int = 0

    for item in recurring_items:
        # 1. Process due occurrences if auto_create is enabled
        safety_counter = 0
        while item.auto_create and item.next_occurrence <= today and safety_counter < 24:
            safety_counter += 1
            occ_date = item.next_occurrence

            # Idempotency check: ensure we haven't already generated a transaction for this recurring_id & date
            existing_tx = (
                db.query(Transaction)
                .filter(
                    Transaction.user_id == user_id,
                    Transaction.recurring_id == item.id,
                    Transaction.transaction_date == occ_date,
                )
                .first()
            )
            if not existing_tx:
                new_tx = Transaction(
                    user_id=user_id,
                    category_id=item.category_id,
                    transaction_type=item.transaction_type,
                    title=f"{item.title} (Recurring)",
                    amount=to_decimal(item.amount),
                    transaction_date=occ_date,
                    payment_method=item.payment_method,
                    notes=item.notes or f"Auto-recorded {item.frequency} recurring {item.transaction_type}",
                    recurring_id=item.id,
                )
                db.add(new_tx)
                db.flush()
                created_transactions.append(new_tx.id)

                dedup_key = f"recurring_processed_{item.id}_{occ_date.isoformat()}"
                if not db.query(Notification).filter_by(user_id=user_id, dedup_key=dedup_key).first():
                    db.add(
                        Notification(
                            user_id=user_id,
                            title=f"Recurring {item.transaction_type.capitalize()} Recorded: {item.title}",
                            message=(
                                f"₹{to_decimal(item.amount):,.2f} for '{item.title}' was automatically "
                                f"recorded on {occ_date.isoformat()}."
                            ),
                            notification_type="recurring_due",
                            is_read=False,
                            dedup_key=dedup_key,
                        )
                    )

            item.last_processed_date = occ_date
            item.next_occurrence = advance_date_by_frequency(occ_date, item.frequency)

        # 2. Check if next occurrence is approaching within 3 days
        days_until = (item.next_occurrence - today).days
        if 0 <= days_until <= 3:
            dedup_key = f"recurring_upcoming_{item.id}_{item.next_occurrence.isoformat()}"
            if not db.query(Notification).filter_by(user_id=user_id, dedup_key=dedup_key).first():
                when_str = "today" if days_until == 0 else f"in {days_until} day(s) ({item.next_occurrence.isoformat()})"
                db.add(
                    Notification(
                        user_id=user_id,
                        title=f"Upcoming Recurring {item.transaction_type.capitalize()}: {item.title}",
                        message=(
                            f"Your {item.frequency} {item.transaction_type} '{item.title}' of "
                            f"₹{to_decimal(item.amount):,.2f} is scheduled {when_str}."
                        ),
                        notification_type="recurring_due",
                        is_read=False,
                        dedup_key=dedup_key,
                    )
                )
                upcoming_alerts += 1

    db.commit()
    if created_transactions:
        sync_user_budget_notifications(db, user_id)

    return {
        "processed_count": len(created_transactions),
        "created_transaction_ids": created_transactions,
        "upcoming_alerts_created": upcoming_alerts,
    }


def get_dashboard_summary_data(
    db: Session,
    user: User,
    period: Optional[str] = "this_month",
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
) -> Dict[str, Any]:
    p_start, p_end, period_label = resolve_date_range(period, start_date, end_date)

    tx_query = db.query(Transaction).filter(Transaction.user_id == user.id)
    if p_start:
        tx_query = tx_query.filter(Transaction.transaction_date >= p_start)
    if p_end:
        tx_query = tx_query.filter(Transaction.transaction_date <= p_end)

    transactions = tx_query.order_by(Transaction.transaction_date.desc(), Transaction.id.desc()).all()

    total_income = Decimal("0.00")
    total_expense = Decimal("0.00")
    income_count = 0
    expense_count = 0

    for t in transactions:
        amt = to_decimal(t.amount)
        if t.transaction_type == "income":
            total_income += amt
            income_count += 1
        else:
            total_expense += amt
            expense_count += 1

    net_balance = total_income - total_expense
    savings_rate = (
        ((net_balance / total_income) * Decimal("100")).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)
        if total_income > Decimal("0.00")
        else Decimal("0.00")
    )

    # Current calendar month savings (explicitly calculated for the selected/current month)
    today = date.today()
    month_start = (p_start if p_start else today.replace(day=1)).replace(day=1)
    month_last_day = calendar.monthrange(month_start.year, month_start.month)[1]
    month_end = month_start.replace(day=month_last_day)

    m_income_raw = (
        db.query(func.coalesce(func.sum(Transaction.amount), 0))
        .filter(
            Transaction.user_id == user.id,
            Transaction.transaction_type == "income",
            Transaction.transaction_date >= month_start,
            Transaction.transaction_date <= month_end,
        )
        .scalar()
    )
    m_expense_raw = (
        db.query(func.coalesce(func.sum(Transaction.amount), 0))
        .filter(
            Transaction.user_id == user.id,
            Transaction.transaction_type == "expense",
            Transaction.transaction_date >= month_start,
            Transaction.transaction_date <= month_end,
        )
        .scalar()
    )
    monthly_income = to_decimal(m_income_raw)
    monthly_expense = to_decimal(m_expense_raw)
    monthly_savings = monthly_income - monthly_expense

    # Budgets overlapping selected period or current month
    budget_query = db.query(Budget).filter(Budget.user_id == user.id)
    if p_start and p_end:
        budget_query = budget_query.filter(Budget.period_start <= p_end, Budget.period_end >= p_start)
    budgets = budget_query.all()

    budget_summaries = [calculate_budget_status(db, b, create_alerts=True) for b in budgets]
    total_budgeted = sum((to_decimal(b["budget_amount"]) for b in budget_summaries), Decimal("0.00"))
    total_budget_spent = sum((to_decimal(b["spent_amount"]) for b in budget_summaries), Decimal("0.00"))
    overall_budget_utilization = (
        ((total_budget_spent / total_budgeted) * Decimal("100")).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)
        if total_budgeted > Decimal("0.00")
        else Decimal("0.00")
    )

    budget_warnings = [
        b for b in budget_summaries if b["status"] in ("Approaching Limit", "Exceeded")
    ]

    # Category breakdown for highest-spending categories
    category_map: Dict[int, Dict[str, Any]] = {}
    for t in transactions:
        if t.transaction_type != "expense":
            continue
        cid = t.category_id
        if cid not in category_map:
            category_map[cid] = {
                "category_id": cid,
                "category_name": t.category.name if t.category else "Uncategorized",
                "icon": t.category.icon if t.category else "Tag",
                "color": t.category.color if t.category else "#2563eb",
                "amount": Decimal("0.00"),
                "transaction_count": 0,
            }
        category_map[cid]["amount"] += to_decimal(t.amount)
        category_map[cid]["transaction_count"] += 1

    highest_spending_categories = []
    for item in sorted(category_map.values(), key=lambda x: x["amount"], reverse=True):
        pct = (
            ((item["amount"] / total_expense) * Decimal("100")).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)
            if total_expense > Decimal("0.00")
            else Decimal("0.00")
        )
        highest_spending_categories.append(
            {
                "category_id": item["category_id"],
                "category_name": item["category_name"],
                "icon": item["icon"],
                "color": item["color"],
                "amount": to_float(item["amount"]),
                "percentage": to_float(pct),
                "transaction_count": item["transaction_count"],
            }
        )

    recent_tx = []
    for t in transactions[:8]:
        recent_tx.append(
            {
                "id": t.id,
                "user_id": t.user_id,
                "category_id": t.category_id,
                "category_name": t.category.name if t.category else "Category",
                "category_icon": t.category.icon if t.category else "Tag",
                "category_color": t.category.color if t.category else "#2563eb",
                "transaction_type": t.transaction_type,
                "title": t.title,
                "amount": to_float(t.amount),
                "transaction_date": t.transaction_date.isoformat(),
                "payment_method": t.payment_method,
                "notes": t.notes,
            }
        )

    # Savings goals summary
    goals = db.query(SavingsGoal).filter(SavingsGoal.user_id == user.id).all()
    total_goals_target = sum((to_decimal(g.target_amount) for g in goals), Decimal("0.00"))
    total_goals_saved = sum((to_decimal(g.current_amount) for g in goals), Decimal("0.00"))

    return {
        "period_label": period_label,
        "start_date": p_start.isoformat() if p_start else None,
        "end_date": p_end.isoformat() if p_end else None,
        "total_income": to_float(total_income),
        "total_expenses": to_float(total_expense),
        "net_balance": to_float(net_balance),
        "monthly_savings": to_float(monthly_savings),
        "monthly_income": to_float(monthly_income),
        "monthly_expenses": to_float(monthly_expense),
        "savings_rate": to_float(savings_rate),
        "income_transaction_count": income_count,
        "expense_transaction_count": expense_count,
        "total_budgeted": to_float(total_budgeted),
        "total_budget_spent": to_float(total_budget_spent),
        "budget_utilization_percentage": to_float(overall_budget_utilization),
        "budgets": budget_summaries,
        "budget_warnings": budget_warnings,
        "highest_spending_categories": highest_spending_categories,
        "recent_transactions": recent_tx,
        "savings_goals_summary": {
            "total_goals": len(goals),
            "total_target": to_float(total_goals_target),
            "total_saved": to_float(total_goals_saved),
        },
        "formulas_explanation": {
            "total_income": "Sum of all recorded income transactions within the selected date range.",
            "total_expenses": "Sum of all recorded expense transactions within the selected date range.",
            "net_balance": "Total Income minus Total Expenses for the selected period (represents net cashflow recorded in the app, not an external bank account balance).",
            "monthly_savings": f"Income minus Expenses specifically for {month_start.strftime('%B %Y')}.",
            "budget_utilization": "Total spent in budgeted categories divided by total allocated budget amount.",
        },
    }


def get_spending_trends_data(
    db: Session,
    user: User,
    months: int = 6,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
) -> Dict[str, Any]:
    today = end_date or date.today()

    # Build monthly buckets for the last `months` months
    monthly_buckets: List[Dict[str, Any]] = []
    for i in range(months - 1, -1, -1):
        # Calculate year and month i months ago
        total_months = (today.year * 12 + (today.month - 1)) - i
        y = total_months // 12
        m = (total_months % 12) + 1
        m_start = date(y, m, 1)
        m_end = date(y, m, calendar.monthrange(y, m)[1])

        inc = (
            db.query(func.coalesce(func.sum(Transaction.amount), 0))
            .filter(
                Transaction.user_id == user.id,
                Transaction.transaction_type == "income",
                Transaction.transaction_date >= m_start,
                Transaction.transaction_date <= m_end,
            )
            .scalar()
        )
        exp = (
            db.query(func.coalesce(func.sum(Transaction.amount), 0))
            .filter(
                Transaction.user_id == user.id,
                Transaction.transaction_type == "expense",
                Transaction.transaction_date >= m_start,
                Transaction.transaction_date <= m_end,
            )
            .scalar()
        )
        inc_d = to_decimal(inc)
        exp_d = to_decimal(exp)
        sav_d = inc_d - exp_d

        monthly_buckets.append(
            {
                "month": m_start.strftime("%b %Y"),
                "month_key": m_start.strftime("%Y-%m"),
                "income": to_float(inc_d),
                "expenses": to_float(exp_d),
                "savings": to_float(sav_d),
            }
        )

    # Also build daily/timeline trend for the selected date range (or current month)
    p_start = start_date or today.replace(day=1)
    p_end = end_date or today

    txs = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == user.id,
            Transaction.transaction_date >= p_start,
            Transaction.transaction_date <= p_end,
        )
        .order_by(Transaction.transaction_date.asc())
        .all()
    )

    daily_map: Dict[str, Dict[str, Decimal]] = {}
    for t in txs:
        d_key = t.transaction_date.isoformat()
        if d_key not in daily_map:
            daily_map[d_key] = {"income": Decimal("0.00"), "expenses": Decimal("0.00")}
        if t.transaction_type == "income":
            daily_map[d_key]["income"] += to_decimal(t.amount)
        else:
            daily_map[d_key]["expenses"] += to_decimal(t.amount)

    daily_trend = []
    cumulative_expense = Decimal("0.00")
    for d_key in sorted(daily_map.keys()):
        inc_d = daily_map[d_key]["income"]
        exp_d = daily_map[d_key]["expenses"]
        cumulative_expense += exp_d
        daily_trend.append(
            {
                "date": d_key,
                "label": datetime.strptime(d_key, "%Y-%m-%d").strftime("%d %b"),
                "income": to_float(inc_d),
                "expenses": to_float(exp_d),
                "cumulative_expenses": to_float(cumulative_expense),
                "net": to_float(inc_d - exp_d),
            }
        )

    return {
        "monthly_comparison": monthly_buckets,
        "daily_trend": daily_trend,
    }


def get_category_breakdown_data(
    db: Session,
    user: User,
    transaction_type: str = "expense",
    period: Optional[str] = "this_month",
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
) -> Dict[str, Any]:
    p_start, p_end, period_label = resolve_date_range(period, start_date, end_date)

    query = db.query(Transaction).filter(
        Transaction.user_id == user.id,
        Transaction.transaction_type == transaction_type,
    )
    if p_start:
        query = query.filter(Transaction.transaction_date >= p_start)
    if p_end:
        query = query.filter(Transaction.transaction_date <= p_end)

    txs = query.all()
    total_amount = sum((to_decimal(t.amount) for t in txs), Decimal("0.00"))

    grouped: Dict[int, Dict[str, Any]] = {}
    for t in txs:
        cid = t.category_id
        if cid not in grouped:
            grouped[cid] = {
                "category_id": cid,
                "category_name": t.category.name if t.category else "Uncategorized",
                "icon": t.category.icon if t.category else "Tag",
                "color": t.category.color if t.category else "#2563eb",
                "amount": Decimal("0.00"),
                "count": 0,
            }
        grouped[cid]["amount"] += to_decimal(t.amount)
        grouped[cid]["count"] += 1

    categories_list = []
    for item in sorted(grouped.values(), key=lambda x: x["amount"], reverse=True):
        pct = (
            ((item["amount"] / total_amount) * Decimal("100")).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)
            if total_amount > Decimal("0.00")
            else Decimal("0.00")
        )
        categories_list.append(
            {
                "category_id": item["category_id"],
                "category_name": item["category_name"],
                "icon": item["icon"],
                "color": item["color"],
                "amount": to_float(item["amount"]),
                "percentage": to_float(pct),
                "transaction_count": item["count"],
            }
        )

    return {
        "transaction_type": transaction_type,
        "period_label": period_label,
        "start_date": p_start.isoformat() if p_start else None,
        "end_date": p_end.isoformat() if p_end else None,
        "total_amount": to_float(total_amount),
        "categories": categories_list,
    }


def generate_spending_insights(
    db: Session,
    user: User,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    custom_question: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Generates beginner-friendly spending insights strictly grounded in real database records.
    Uses external LLM API if AI_API_KEY is configured; otherwise provides deterministic
    rule-based financial analysis fallback.
    """
    today = date.today()
    this_month_start = today.replace(day=1)
    this_month_end = today.replace(day=calendar.monthrange(today.year, today.month)[1])
    prev_month_end = this_month_start - timedelta(days=1)
    prev_month_start = prev_month_end.replace(day=1)

    p_start = start_date or this_month_start
    p_end = end_date or this_month_end

    # Current period summary
    current_summary = get_dashboard_summary_data(db, user, start_date=p_start, end_date=p_end)

    # Previous month category expenses for month-over-month comparison
    prev_txs = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == user.id,
            Transaction.transaction_type == "expense",
            Transaction.transaction_date >= prev_month_start,
            Transaction.transaction_date <= prev_month_end,
        )
        .all()
    )
    prev_cat_totals: Dict[str, Decimal] = {}
    prev_total_expense = Decimal("0.00")
    for t in prev_txs:
        cname = t.category.name if t.category else "Other"
        amt = to_decimal(t.amount)
        prev_cat_totals[cname] = prev_cat_totals.get(cname, Decimal("0.00")) + amt
        prev_total_expense += amt

    # Current month category expenses
    curr_txs = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == user.id,
            Transaction.transaction_type == "expense",
            Transaction.transaction_date >= this_month_start,
            Transaction.transaction_date <= this_month_end,
        )
        .all()
    )
    curr_cat_totals: Dict[str, Decimal] = {}
    for t in curr_txs:
        cname = t.category.name if t.category else "Other"
        curr_cat_totals[cname] = curr_cat_totals.get(cname, Decimal("0.00")) + to_decimal(t.amount)

    insights: List[Dict[str, str]] = []

    total_inc = to_decimal(current_summary["total_income"])
    total_exp = to_decimal(current_summary["total_expenses"])
    net_sav = to_decimal(current_summary["net_balance"])
    sav_rate = to_decimal(current_summary["savings_rate"])

    # 1. Overall Savings & Cashflow Insight
    if total_inc == Decimal("0.00") and total_exp == Decimal("0.00"):
        insights.append(
            {
                "type": "info",
                "title": "No Transactions in Selected Period",
                "description": "Start recording your daily income and expenses to unlock personalized spending comparisons and savings insights.",
            }
        )
    elif net_sav > Decimal("0.00"):
        insights.append(
            {
                "type": "positive",
                "title": f"Positive Savings Rate ({sav_rate}%)",
                "description": (
                    f"You earned ₹{total_inc:,.2f} and spent ₹{total_exp:,.2f} during this period, "
                    f"retaining ₹{net_sav:,.2f} ({sav_rate}% of income). Financial planners generally recommend saving at least 20% of monthly income."
                ),
            }
        )
    else:
        deficit = abs(net_sav)
        insights.append(
            {
                "type": "warning",
                "title": "Expenses Exceed Recorded Income",
                "description": (
                    f"Your recorded expenses (₹{total_exp:,.2f}) exceeded your recorded income (₹{total_inc:,.2f}) "
                    f"by ₹{deficit:,.2f}. Review your highest-spending categories below to identify non-essential purchases."
                ),
            }
        )

    # 2. Month-over-Month Category Comparison
    for cname, curr_amt in sorted(curr_cat_totals.items(), key=lambda x: x[1], reverse=True):
        prev_amt = prev_cat_totals.get(cname, Decimal("0.00"))
        diff = curr_amt - prev_amt
        if prev_amt > Decimal("0.00") and diff > Decimal("0.00"):
            pct_increase = ((diff / prev_amt) * Decimal("100")).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)
            insights.append(
                {
                    "type": "comparison",
                    "title": f"{cname} Spending Increased by ₹{diff:,.2f}",
                    "description": (
                        f"You spent ₹{diff:,.2f} ({pct_increase}%) more on {cname} this month (₹{curr_amt:,.2f}) "
                        f"compared to last month (₹{prev_amt:,.2f}). Review recent {cname.lower()} transactions to spot possible savings."
                    ),
                }
            )
            break
        elif prev_amt > Decimal("0.00") and diff < Decimal("0.00"):
            saved_diff = abs(diff)
            insights.append(
                {
                    "type": "positive",
                    "title": f"Reduced {cname} Spending by ₹{saved_diff:,.2f}",
                    "description": (
                        f"Great discipline! Your {cname} expenses dropped from ₹{prev_amt:,.2f} last month "
                        f"to ₹{curr_amt:,.2f} this month, saving ₹{saved_diff:,.2f}."
                    ),
                }
            )
            break

    # 3. Top Expense Category Concentration
    top_cats = current_summary["highest_spending_categories"]
    if top_cats:
        top = top_cats[0]
        insights.append(
            {
                "type": "category",
                "title": f"Highest Expense Category: {top['category_name']} ({top['percentage']}%)",
                "description": (
                    f"{top['category_name']} accounts for ₹{top['amount']:,.2f} ({top['percentage']}% of total spending) "
                    f"across {top['transaction_count']} transaction(s) in this period."
                ),
            }
        )

    # 4. Budget Warnings Insight
    warnings = current_summary["budget_warnings"]
    if warnings:
        for w in warnings[:2]:
            insights.append(
                {
                    "type": "warning" if w["status"] == "Approaching Limit" else "danger",
                    "title": f"Budget {w['status']}: {w['category_name']} ({w['percentage_used']}%)",
                    "description": (
                        f"You have spent ₹{w['spent_amount']:,.2f} out of your ₹{w['budget_amount']:,.2f} "
                        f"monthly {w['category_name']} budget."
                    ),
                }
            )

    ai_provider_used = "rule_based_fallback"
    ai_narrative = None

    # Optional external LLM call if AI_API_KEY is configured
    if settings.AI_API_KEY and settings.AI_API_KEY.strip():
        try:
            prompt_summary = {
                "period": current_summary["period_label"],
                "total_income_inr": current_summary["total_income"],
                "total_expenses_inr": current_summary["total_expenses"],
                "net_savings_inr": current_summary["net_balance"],
                "top_categories": top_cats[:5],
                "budget_alerts": [
                    {
                        "category": w["category_name"],
                        "budget": w["budget_amount"],
                        "spent": w["spent_amount"],
                        "status": w["status"],
                    }
                    for w in warnings
                ],
                "user_question": custom_question or "Provide 3 concise, practical personal finance tips based on these exact numbers.",
            }
            resp = httpx.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.AI_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": settings.AI_MODEL,
                    "messages": [
                        {
                            "role": "system",
                            "content": (
                                "You are a helpful financial literacy assistant inside Expense Tracker (Developed by Anil Biradar). "
                                "Use ONLY the exact numbers provided in the JSON summary. Never invent transactions or amounts. "
                                "Keep advice informational and beginner-friendly in Indian Rupees (₹)."
                            ),
                        },
                        {"role": "user", "content": str(prompt_summary)},
                    ],
                    "temperature": 0.2,
                    "max_tokens": 300,
                },
                timeout=8.0,
            )
            if resp.status_code == 200:
                data = resp.json()
                ai_narrative = data["choices"][0]["message"]["content"]
                ai_provider_used = "llm_api"
        except Exception:
            ai_provider_used = "rule_based_fallback"

    if not ai_narrative:
        bullet_lines = [f"• {item['title']}: {item['description']}" for item in insights]
        if custom_question:
            bullet_lines.append(
                f"• Regarding your question ('{custom_question}'): Based on your recorded net balance of ₹{net_sav:,.2f} and savings rate of {sav_rate}%, prioritizing high-utilization budgets first will yield the fastest monthly savings improvement."
            )
        ai_narrative = "\n".join(bullet_lines)

    return {
        "provider": ai_provider_used,
        "disclaimer": (
            "Informational Insight Only: These observations are calculated directly from your recorded transactions "
            "and budgets. They are for educational awareness and do not constitute formal financial or investment advice."
        ),
        "period_label": current_summary["period_label"],
        "summary_metrics": {
            "total_income": current_summary["total_income"],
            "total_expenses": current_summary["total_expenses"],
            "net_savings": current_summary["net_balance"],
            "savings_rate": current_summary["savings_rate"],
        },
        "insights": insights,
        "narrative": ai_narrative,
    }


def generate_csv_report(db: Session, user: User, start_date: Optional[date] = None, end_date: Optional[date] = None) -> str:
    query = db.query(Transaction).filter(Transaction.user_id == user.id)
    if start_date:
        query = query.filter(Transaction.transaction_date >= start_date)
    if end_date:
        query = query.filter(Transaction.transaction_date <= end_date)
    txs = query.order_by(Transaction.transaction_date.desc(), Transaction.id.desc()).all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(
        [
            "Transaction ID",
            "Date",
            "Type",
            "Title",
            "Category",
            "Amount (INR)",
            "Payment Method",
            "Notes",
        ]
    )

    total_income = Decimal("0.00")
    total_expense = Decimal("0.00")

    for t in txs:
        amt = to_decimal(t.amount)
        if t.transaction_type == "income":
            total_income += amt
        else:
            total_expense += amt
        writer.writerow(
            [
                t.id,
                t.transaction_date.isoformat(),
                t.transaction_type.upper(),
                t.title,
                t.category.name if t.category else "Uncategorized",
                f"{amt:.2f}",
                t.payment_method,
                t.notes or "",
            ]
        )

    writer.writerow([])
    writer.writerow(["SUMMARY", "", "", "", "", "", "", ""])
    writer.writerow(["Total Income (INR)", f"{total_income:.2f}"])
    writer.writerow(["Total Expenses (INR)", f"{total_expense:.2f}"])
    writer.writerow(["Net Savings (INR)", f"{(total_income - total_expense):.2f}"])
    writer.writerow(["Generated By", "Expense Tracker — Developed by Anil Biradar"])

    return output.getvalue()


def generate_pdf_report(
    db: Session,
    user: User,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
) -> bytes:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle

    summary = get_dashboard_summary_data(db, user, period="custom" if (start_date and end_date) else "this_month", start_date=start_date, end_date=end_date)

    query = db.query(Transaction).filter(Transaction.user_id == user.id)
    if start_date:
        query = query.filter(Transaction.transaction_date >= start_date)
    if end_date:
        query = query.filter(Transaction.transaction_date <= end_date)
    txs = query.order_by(Transaction.transaction_date.desc(), Transaction.id.desc()).limit(100).all()

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, rightMargin=36, leftMargin=36, topMargin=36, bottomMargin=36)
    styles = getSampleStyleSheet()

    title_style = ParagraphStyle(
        "DocTitle",
        parent=styles["Heading1"],
        fontSize=16,
        textColor=colors.HexColor("#102a43"),
        spaceAfter=4,
    )
    sub_style = ParagraphStyle(
        "DocSub",
        parent=styles["Normal"],
        fontSize=9,
        textColor=colors.HexColor("#486581"),
        spaceAfter=14,
    )
    section_style = ParagraphStyle(
        "SectionTitle",
        parent=styles["Heading2"],
        fontSize=12,
        textColor=colors.HexColor("#102a43"),
        spaceBefore=12,
        spaceAfter=6,
    )

    elements = []
    elements.append(Paragraph("EXPENSE TRACKER — SMART PERSONAL FINANCE MANAGEMENT SYSTEM", title_style))
    elements.append(
        Paragraph(
            f"Financial Statement for {user.name} ({user.email}) | Period: {summary['period_label']} | Developed by Anil Biradar",
            sub_style,
        )
    )

    elements.append(Paragraph("1. Executive Financial Summary", section_style))
    summary_data = [
        ["Metric", "Amount (INR)", "Calculation Basis"],
        ["Total Income", f"INR {summary['total_income']:,.2f}", "Sum of recorded income transactions"],
        ["Total Expenses", f"INR {summary['total_expenses']:,.2f}", "Sum of recorded expense transactions"],
        ["Net Savings / Balance", f"INR {summary['net_balance']:,.2f}", "Total Income minus Total Expenses"],
        ["Savings Rate", f"{summary['savings_rate']:.2f}%", "(Net Savings / Total Income) x 100"],
    ]
    t_sum = Table(summary_data, colWidths=[150, 130, 230])
    t_sum.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#102a43")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
            ]
        )
    )
    elements.append(t_sum)
    elements.append(Spacer(1, 10))

    if summary["highest_spending_categories"]:
        elements.append(Paragraph("2. Category-Wise Expense Breakdown", section_style))
        cat_rows = [["Category", "Transactions", "Amount (INR)", "Share (%)"]]
        for c in summary["highest_spending_categories"]:
            cat_rows.append(
                [
                    c["category_name"],
                    str(c["transaction_count"]),
                    f"INR {c['amount']:,.2f}",
                    f"{c['percentage']:.2f}%",
                ]
            )
        t_cat = Table(cat_rows, colWidths=[180, 100, 130, 100])
        t_cat.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#2563eb")),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, -1), 9),
                    ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
                    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
                ]
            )
        )
        elements.append(t_cat)
        elements.append(Spacer(1, 10))

    elements.append(Paragraph("3. Recorded Transactions", section_style))
    tx_rows = [["Date", "Type", "Title", "Category", "Method", "Amount (INR)"]]
    for tx in txs:
        tx_rows.append(
            [
                tx.transaction_date.isoformat(),
                tx.transaction_type.upper(),
                tx.title[:32],
                (tx.category.name if tx.category else "Other")[:18],
                tx.payment_method[:14],
                f"INR {to_float(tx.amount):,.2f}",
            ]
        )
    if len(tx_rows) == 1:
        tx_rows.append(["-", "-", "No transactions in period", "-", "-", "INR 0.00"])

    t_tx = Table(tx_rows, colWidths=[65, 50, 155, 85, 70, 85])
    t_tx.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#102a43")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
            ]
        )
    )
    elements.append(t_tx)

    doc.build(elements)
    return buffer.getvalue()
