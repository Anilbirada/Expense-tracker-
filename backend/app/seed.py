import calendar
from datetime import date, timedelta
from decimal import Decimal
from sqlalchemy.orm import Session

from app.models import (
    User,
    Category,
    Transaction,
    Budget,
    SavingsGoal,
    RecurringTransaction,
    Notification,
)
from app.security import hash_password
from app.services.finance import ensure_default_categories, sync_user_budget_notifications


DEMO_EMAIL = "demo@expensetracker.com"
DEMO_PASSWORD = "Demo@1234"


def seed_demo_account(db: Session, force_reset: bool = False) -> User:
    """
    Creates or resets the isolated Fictional Demonstration Account (demo@expensetracker.com).
    Never modifies or touches any real user's account.
    """
    existing = db.query(User).filter(User.email == DEMO_EMAIL).first()
    if existing and not force_reset:
        return existing

    if existing and force_reset:
        db.delete(existing)
        db.commit()

    demo_user = User(
        name="Anil Biradar (Demo Account — Fictional Data)",
        email=DEMO_EMAIL,
        password_hash=hash_password(DEMO_PASSWORD),
        user_type="professional",
        currency="INR",
        budget_warning_threshold=75,
        budget_critical_threshold=100,
        is_demo=True,
    )
    db.add(demo_user)
    db.commit()
    db.refresh(demo_user)

    categories = ensure_default_categories(db, demo_user.id)
    cat_by_name = {c.name: c for c in categories}

    today = date.today()
    this_month_start = today.replace(day=1)
    this_month_end = today.replace(day=calendar.monthrange(today.year, today.month)[1])

    # Previous month dates
    prev_month_end = this_month_start - timedelta(days=1)
    prev_month_start = prev_month_end.replace(day=1)

    # Two months ago dates
    two_months_end = prev_month_start - timedelta(days=1)
    two_months_start = two_months_end.replace(day=1)

    def safe_day(base_start: date, day_num: int) -> date:
        max_d = calendar.monthrange(base_start.year, base_start.month)[1]
        return base_start.replace(day=min(day_num, max_d))

    # Fictional transactions across 3 months
    sample_txs = [
        # Two months ago
        ("income", "Salary", "[DEMO] Monthly Software Engineer Salary", Decimal("65000.00"), safe_day(two_months_start, 1), "Bank Transfer", "Fictional demo salary record"),
        ("income", "Freelancing", "[DEMO] Web UI Consultation Project", Decimal("12000.00"), safe_day(two_months_start, 14), "UPI", "Fictional freelance payout"),
        ("expense", "Rent", "[DEMO] Apartment Monthly Rent", Decimal("15000.00"), safe_day(two_months_start, 3), "Bank Transfer", "Fictional rent"),
        ("expense", "Food", "[DEMO] Groceries & Supermart", Decimal("4200.00"), safe_day(two_months_start, 7), "UPI", "Fictional grocery bill"),
        ("expense", "Utilities", "[DEMO] Electricity & Fiber Internet", Decimal("2400.00"), safe_day(two_months_start, 10), "UPI", "Fictional utility bill"),
        ("expense", "Travel", "[DEMO] Metro Pass & Cab Commute", Decimal("2800.00"), safe_day(two_months_start, 16), "UPI", "Fictional commute"),
        ("expense", "Education", "[DEMO] Cloud Certification Course", Decimal("3500.00"), safe_day(two_months_start, 20), "Credit Card", "Fictional course"),
        ("expense", "Shopping", "[DEMO] Home Office Accessories", Decimal("4500.00"), safe_day(two_months_start, 24), "Credit Card", "Fictional shopping"),

        # Previous month
        ("income", "Salary", "[DEMO] Monthly Software Engineer Salary", Decimal("65000.00"), safe_day(prev_month_start, 1), "Bank Transfer", "Fictional demo salary record"),
        ("income", "Freelancing", "[DEMO] Python API Optimization Gig", Decimal("15000.00"), safe_day(prev_month_start, 18), "Bank Transfer", "Fictional freelance income"),
        ("expense", "Rent", "[DEMO] Apartment Monthly Rent", Decimal("15000.00"), safe_day(prev_month_start, 2), "Bank Transfer", "Fictional rent"),
        ("expense", "Food", "[DEMO] Monthly Groceries & Dining", Decimal("4800.00"), safe_day(prev_month_start, 8), "UPI", "Fictional food expense"),
        ("expense", "Travel", "[DEMO] Weekend Intercity Bus & Fuel", Decimal("3100.00"), safe_day(prev_month_start, 12), "UPI", "Fictional travel"),
        ("expense", "Utilities", "[DEMO] Electricity, Water & Broadband", Decimal("2650.00"), safe_day(prev_month_start, 14), "UPI", "Fictional utilities"),
        ("expense", "Healthcare", "[DEMO] Annual Health Checkup & Vitamins", Decimal("2200.00"), safe_day(prev_month_start, 19), "Debit Card", "Fictional healthcare"),
        ("expense", "Entertainment", "[DEMO] Movie Night & Streaming", Decimal("1400.00"), safe_day(prev_month_start, 23), "UPI", "Fictional entertainment"),
        ("expense", "Shopping", "[DEMO] Apparel & Footwear", Decimal("5200.00"), safe_day(prev_month_start, 26), "Credit Card", "Fictional shopping"),

        # Current month (designed to showcase Normal, Approaching Limit, and Exceeded budgets!)
        ("income", "Salary", "[DEMO] Monthly Software Engineer Salary", Decimal("68000.00"), safe_day(this_month_start, 1), "Bank Transfer", "Fictional demo salary record"),
        ("income", "Freelancing", "[DEMO] Full-Stack Dashboard Milestone", Decimal("14500.00"), safe_day(this_month_start, 6), "UPI", "Fictional demo freelance record"),
        ("income", "Scholarship", "[DEMO] Merit Research Stipend", Decimal("5000.00"), safe_day(this_month_start, 9), "Bank Transfer", "Fictional stipend"),
        ("expense", "Rent", "[DEMO] Apartment Monthly Rent", Decimal("15000.00"), safe_day(this_month_start, 2), "Bank Transfer", "Fictional monthly rent"),
        ("expense", "Food", "[DEMO] Organic Groceries & Fresh Produce", Decimal("2600.00"), safe_day(this_month_start, 4), "UPI", "Fictional food expense"),
        ("expense", "Food", "[DEMO] Team Lunch & Restaurant Takeaway", Decimal("1650.00"), safe_day(this_month_start, 8), "UPI", "Fictional dining expense (Food total = 4,250 / 5,000 -> 85% Approaching Limit)"),
        ("expense", "Travel", "[DEMO] Daily Metro & Fuel Refill", Decimal("2100.00"), safe_day(this_month_start, 5), "UPI", "Fictional travel (2,100 / 4,000 -> 52.5% Normal)"),
        ("expense", "Education", "[DEMO] Reference Textbooks & Lab Kit", Decimal("3200.00"), safe_day(this_month_start, 7), "Debit Card", "Fictional education expense"),
        ("expense", "Utilities", "[DEMO] High-Speed Fiber & Electricity Bill", Decimal("2750.00"), safe_day(this_month_start, 9), "UPI", "Fictional utilities"),
        ("expense", "Shopping", "[DEMO] Wireless Mechanical Keyboard & Mouse", Decimal("6400.00"), safe_day(this_month_start, 10), "Credit Card", "Fictional shopping (6,400 / 6,000 -> 106.67% Budget Exceeded)"),
        ("expense", "Subscriptions", "[DEMO] Cloud Hosting & Developer Tools", Decimal("899.00"), safe_day(this_month_start, 11), "Credit Card", "Fictional subscription"),
        ("expense", "Entertainment", "[DEMO] Weekend Badminton Court & Cafe", Decimal("950.00"), safe_day(this_month_start, 12), "UPI", "Fictional entertainment"),
    ]

    for t_type, cat_name, title, amount, tx_date, method, notes in sample_txs:
        cat = cat_by_name.get(cat_name)
        if not cat:
            continue
        db.add(
            Transaction(
                user_id=demo_user.id,
                category_id=cat.id,
                transaction_type=t_type,
                title=title,
                amount=amount,
                transaction_date=tx_date,
                payment_method=method,
                notes=notes,
            )
        )

    # Fictional Monthly Budgets for current month
    demo_budgets = [
        ("Food", Decimal("5000.00"), 75, 100),          # Spent 4,250 -> 85% (Approaching Limit)
        ("Shopping", Decimal("6000.00"), 75, 100),      # Spent 6,400 -> 106.67% (Exceeded)
        ("Travel", Decimal("4000.00"), 75, 100),        # Spent 2,100 -> 52.5% (Normal)
        ("Rent", Decimal("15000.00"), 80, 100),         # Spent 15,000 -> 100% (Exceeded/Full)
        ("Utilities", Decimal("4000.00"), 75, 100),     # Spent 2,750 -> 68.75% (Normal)
        ("Education", Decimal("5000.00"), 75, 100),     # Spent 3,200 -> 64.0% (Normal)
    ]
    for cat_name, b_amount, warn_t, crit_t in demo_budgets:
        cat = cat_by_name.get(cat_name)
        if cat:
            db.add(
                Budget(
                    user_id=demo_user.id,
                    category_id=cat.id,
                    budget_amount=b_amount,
                    period_start=this_month_start,
                    period_end=this_month_end,
                    warning_threshold=warn_t,
                    critical_threshold=crit_t,
                )
            )

    # Fictional Savings Goals
    demo_goals = [
        (
            "[DEMO] Buy a Developer Laptop (MacBook / ThinkPad)",
            Decimal("75000.00"),
            Decimal("45000.00"),
            today + timedelta(days=90),
            "active",
            "Fictional manually tracked goal for workstation upgrade",
        ),
        (
            "[DEMO] Emergency Medical & Rainy-Day Fund",
            Decimal("100000.00"),
            Decimal("68000.00"),
            today + timedelta(days=180),
            "active",
            "Fictional 3-month emergency buffer",
        ),
        (
            "[DEMO] Final Year Project Conference Trip",
            Decimal("15000.00"),
            Decimal("15000.00"),
            today - timedelta(days=10),
            "completed",
            "Fictional completed student travel goal",
        ),
    ]
    for g_title, target, current, t_date, status_val, notes in demo_goals:
        db.add(
            SavingsGoal(
                user_id=demo_user.id,
                title=g_title,
                target_amount=target,
                current_amount=current,
                target_date=t_date,
                status=status_val,
                notes=notes,
            )
        )

    # Fictional Recurring Transactions
    demo_recurring = [
        ("income", "Salary", "[DEMO] Monthly Tech Salary", Decimal("68000.00"), "Bank Transfer", "monthly", today + timedelta(days=18)),
        ("expense", "Rent", "[DEMO] Monthly Apartment Rent", Decimal("15000.00"), "Bank Transfer", "monthly", today + timedelta(days=2)),
        ("expense", "Utilities", "[DEMO] Fiber Broadband Plan", Decimal("999.00"), "UPI", "monthly", today + timedelta(days=1)),
        ("expense", "Subscriptions", "[DEMO] Cloud Server & GitHub Pro", Decimal("899.00"), "Credit Card", "monthly", today + timedelta(days=14)),
    ]
    for r_type, cat_name, r_title, r_amt, method, freq, next_occ in demo_recurring:
        cat = cat_by_name.get(cat_name)
        if cat:
            db.add(
                RecurringTransaction(
                    user_id=demo_user.id,
                    category_id=cat.id,
                    transaction_type=r_type,
                    title=r_title,
                    amount=r_amt,
                    payment_method=method,
                    frequency=freq,
                    next_occurrence=next_occ,
                    is_active=True,
                    auto_create=True,
                    notes="Fictional demonstration recurring schedule",
                )
            )

    db.add(
        Notification(
            user_id=demo_user.id,
            title="Welcome to the Fictional Demo Account",
            message=(
                "All records in this account are labeled [DEMO] and are strictly fictional for college project "
                "demonstration. Register your own account for private personal finance tracking."
            ),
            notification_type="system",
            is_read=False,
            dedup_key="welcome_demo_account",
        )
    )

    db.commit()
    sync_user_budget_notifications(db, demo_user.id)
    return demo_user
