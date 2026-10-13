import calendar
from datetime import date, timedelta
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app


# Use an isolated in-memory SQLite database for automated testing
SQLALCHEMY_TEST_DATABASE_URL = "sqlite://"

test_engine = create_engine(
    SQLALCHEMY_TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)


@event.listens_for(test_engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db


@pytest.fixture(autouse=True)
def setup_and_teardown_db():
    Base.metadata.drop_all(bind=test_engine)
    Base.metadata.create_all(bind=test_engine)
    yield
    Base.metadata.drop_all(bind=test_engine)


@pytest.fixture
def client():
    return TestClient(app)


def register_and_get_headers(client: TestClient, email="anil@example.com", name="Anil Biradar", password="Password123"):
    resp = client.post(
        "/api/auth/register",
        json={
            "name": name,
            "email": email,
            "password": password,
            "user_type": "professional",
            "currency": "INR",
        },
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()
    token = data["access_token"]
    return {"Authorization": f"Bearer {token}"}, data["user"]


def get_cat_id(client: TestClient, headers: dict, name: str, cat_type: str) -> int:
    cats = client.get(f"/api/categories?category_type={cat_type}", headers=headers).json()
    for c in cats:
        if c["name"].lower() == name.lower():
            return c["id"]
    raise ValueError(f"Category {name} ({cat_type}) not found")


# ==================== 1. AUTHENTICATION & SECURITY TESTS ====================

def test_user_registration_login_and_logout(client: TestClient):
    # Register
    reg_resp = client.post(
        "/api/auth/register",
        json={
            "name": "Anil Biradar",
            "email": "anil.test@college.edu",
            "password": "SecurePass123",
            "user_type": "student",
        },
    )
    assert reg_resp.status_code == 201
    reg_data = reg_resp.json()
    assert reg_data["user"]["email"] == "anil.test@college.edu"
    assert "password_hash" not in reg_data["user"]

    # Duplicate registration prevented
    dup_resp = client.post(
        "/api/auth/register",
        json={
            "name": "Duplicate",
            "email": "anil.test@college.edu",
            "password": "SecurePass123",
        },
    )
    assert dup_resp.status_code == 400

    # Login
    login_resp = client.post(
        "/api/auth/login",
        json={"email": "anil.test@college.edu", "password": "SecurePass123"},
    )
    assert login_resp.status_code == 200
    token = login_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Verify /api/auth/me works
    me_resp = client.get("/api/auth/me", headers=headers)
    assert me_resp.status_code == 200
    assert me_resp.json()["name"] == "Anil Biradar"

    # Logout revokes token
    logout_resp = client.post("/api/auth/logout", headers=headers)
    assert logout_resp.status_code == 200

    # Subsequent request with logged-out token fails with 401
    after_logout = client.get("/api/auth/me", headers=headers)
    assert after_logout.status_code == 401


def test_authentication_requirements_and_invalid_login(client: TestClient):
    # Unauthenticated access to protected endpoints is rejected
    for endpoint in [
        "/api/dashboard/summary",
        "/api/transactions",
        "/api/categories",
        "/api/budgets",
        "/api/savings-goals",
        "/api/reports/summary",
    ]:
        resp = client.get(endpoint)
        assert resp.status_code == 401

    # Invalid password rejected
    register_and_get_headers(client, email="valid@user.com", password="CorrectPassword")
    bad_login = client.post(
        "/api/auth/login",
        json={"email": "valid@user.com", "password": "WrongPassword"},
    )
    assert bad_login.status_code == 401


# ==================== 2. EXACT FINANCIAL CALCULATION VERIFICATION ====================

def test_exact_sample_financial_calculations(client: TestClient):
    """
    Verifies the exact requirement from Section 10:
    Income:
      Salary = ₹20,000
      Freelance = ₹5,000
    Expenses:
      Food = ₹3,000
      Travel = ₹2,000
      Rent = ₹6,000
    Expected:
      Total Income = ₹25,000
      Total Expenses = ₹11,000
      Net Savings = ₹14,000
    """
    headers, _ = register_and_get_headers(client, email="calc@test.com")
    today = date.today().isoformat()

    salary_cat = get_cat_id(client, headers, "Salary", "income")
    freelance_cat = get_cat_id(client, headers, "Freelancing", "income")
    food_cat = get_cat_id(client, headers, "Food", "expense")
    travel_cat = get_cat_id(client, headers, "Travel", "expense")
    rent_cat = get_cat_id(client, headers, "Rent", "expense")

    # Add Income
    assert client.post(
        "/api/transactions",
        headers=headers,
        json={
            "category_id": salary_cat,
            "transaction_type": "income",
            "title": "Monthly Salary",
            "amount": "20000.00",
            "transaction_date": today,
            "payment_method": "Bank Transfer",
        },
    ).status_code == 201

    assert client.post(
        "/api/transactions",
        headers=headers,
        json={
            "category_id": freelance_cat,
            "transaction_type": "income",
            "title": "Freelance Project",
            "amount": "5000.00",
            "transaction_date": today,
            "payment_method": "UPI",
        },
    ).status_code == 201

    # Add Expenses
    for cat_id, title, amt in [
        (food_cat, "Groceries & Dining", "3000.00"),
        (travel_cat, "City Commute", "2000.00"),
        (rent_cat, "Monthly House Rent", "6000.00"),
    ]:
        resp = client.post(
            "/api/transactions",
            headers=headers,
            json={
                "category_id": cat_id,
                "transaction_type": "expense",
                "title": title,
                "amount": amt,
                "transaction_date": today,
                "payment_method": "UPI",
            },
        )
        assert resp.status_code == 201

    # Check Dashboard Summary
    dash_resp = client.get("/api/dashboard/summary?period=this_month", headers=headers)
    assert dash_resp.status_code == 200
    summary = dash_resp.json()

    assert summary["total_income"] == 25000.0
    assert summary["total_expenses"] == 11000.0
    assert summary["net_balance"] == 14000.0
    assert summary["monthly_savings"] == 14000.0
    assert summary["savings_rate"] == 56.0  # (14000 / 25000) * 100

    # Check Monthly Report Summary matches
    rep_resp = client.get("/api/reports/summary?period=this_month", headers=headers)
    assert rep_resp.status_code == 200
    rep_data = rep_resp.json()
    assert rep_data["summary"]["total_income"] == 25000.0
    assert rep_data["summary"]["total_expenses"] == 11000.0
    assert rep_data["summary"]["net_balance"] == 14000.0


# ==================== 3. TRANSACTION CRUD, FILTERS & VALIDATION ====================

def test_transaction_edit_delete_and_filters(client: TestClient):
    headers, _ = register_and_get_headers(client, email="txcrud@test.com")
    today = date.today().isoformat()
    food_cat = get_cat_id(client, headers, "Food", "expense")
    travel_cat = get_cat_id(client, headers, "Travel", "expense")

    # Create transaction
    create_resp = client.post(
        "/api/transactions",
        headers=headers,
        json={
            "category_id": food_cat,
            "transaction_type": "expense",
            "title": "Coffee & Snacks",
            "amount": 250.50,
            "transaction_date": today,
            "payment_method": "UPI",
            "notes": "Evening cafe visit",
        },
    )
    assert create_resp.status_code == 201
    tx_id = create_resp.json()["id"]

    # Create second transaction
    client.post(
        "/api/transactions",
        headers=headers,
        json={
            "category_id": travel_cat,
            "transaction_type": "expense",
            "title": "Airport Taxi",
            "amount": 1200.00,
            "transaction_date": today,
            "payment_method": "Credit Card",
        },
    )

    # Filter by search
    search_resp = client.get("/api/transactions?search=Airport", headers=headers)
    assert search_resp.status_code == 200
    assert search_resp.json()["total"] == 1
    assert search_resp.json()["items"][0]["title"] == "Airport Taxi"

    # Filter by payment method
    pm_resp = client.get("/api/transactions?payment_method=Credit Card", headers=headers)
    assert pm_resp.json()["total"] == 1

    # Edit first transaction
    edit_resp = client.put(
        f"/api/transactions/{tx_id}",
        headers=headers,
        json={"title": "Updated Coffee & Lunch", "amount": 400.00},
    )
    assert edit_resp.status_code == 200
    assert edit_resp.json()["amount"] == 400.0

    # Verify dashboard updates immediately
    dash = client.get("/api/dashboard/summary?period=this_month", headers=headers).json()
    assert dash["total_expenses"] == 1600.0

    # Delete first transaction
    del_resp = client.delete(f"/api/transactions/{tx_id}", headers=headers)
    assert del_resp.status_code == 200

    dash_after = client.get("/api/dashboard/summary?period=this_month", headers=headers).json()
    assert dash_after["total_expenses"] == 1200.0


def test_invalid_amounts_and_mismatched_category_types(client: TestClient):
    headers, _ = register_and_get_headers(client, email="validation@test.com")
    today = date.today().isoformat()
    food_cat = get_cat_id(client, headers, "Food", "expense")

    # Negative amount rejected
    neg_resp = client.post(
        "/api/transactions",
        headers=headers,
        json={
            "category_id": food_cat,
            "transaction_type": "expense",
            "title": "Invalid Negative",
            "amount": -500,
            "transaction_date": today,
            "payment_method": "Cash",
        },
    )
    assert neg_resp.status_code == 422

    # Zero amount rejected
    zero_resp = client.post(
        "/api/transactions",
        headers=headers,
        json={
            "category_id": food_cat,
            "transaction_type": "expense",
            "title": "Invalid Zero",
            "amount": 0,
            "transaction_date": today,
            "payment_method": "Cash",
        },
    )
    assert zero_resp.status_code == 422

    # Using an expense category for an income transaction is rejected
    mismatch_resp = client.post(
        "/api/transactions",
        headers=headers,
        json={
            "category_id": food_cat,
            "transaction_type": "income",
            "title": "Mismatched Type",
            "amount": 1000,
            "transaction_date": today,
            "payment_method": "Cash",
        },
    )
    assert mismatch_resp.status_code == 400


# ==================== 4. CATEGORY MANAGEMENT & SAFE DELETION ====================

def test_category_creation_and_safe_deletion(client: TestClient):
    headers, _ = register_and_get_headers(client, email="cats@test.com")
    today = date.today().isoformat()

    # Create custom category
    custom_resp = client.post(
        "/api/categories",
        headers=headers,
        json={
            "name": "Gym & Fitness",
            "category_type": "expense",
            "icon": "HeartPulse",
            "color": "#10b981",
        },
    )
    assert custom_resp.status_code == 201
    gym_cat_id = custom_resp.json()["id"]

    # Add a transaction under Gym & Fitness
    client.post(
        "/api/transactions",
        headers=headers,
        json={
            "category_id": gym_cat_id,
            "transaction_type": "expense",
            "title": "Monthly Gym Membership",
            "amount": 1500,
            "transaction_date": today,
            "payment_method": "UPI",
        },
    )

    # Attempt to delete category without reassignment or archival must fail (prevents orphaned/invalid transactions)
    unsafe_del = client.delete(f"/api/categories/{gym_cat_id}", headers=headers)
    assert unsafe_del.status_code == 400

    # Safe deletion with reassignment to Healthcare succeeds
    healthcare_id = get_cat_id(client, headers, "Healthcare", "expense")
    safe_del = client.delete(
        f"/api/categories/{gym_cat_id}?reassign_to_category_id={healthcare_id}",
        headers=headers,
    )
    assert safe_del.status_code == 200

    # Verify transaction still exists and now points to Healthcare
    txs = client.get("/api/transactions", headers=headers).json()["items"]
    assert len(txs) == 1
    assert txs[0]["category_id"] == healthcare_id


# ==================== 5. BUDGETS & THRESHOLD NOTIFICATIONS ====================

def test_budget_calculations_duplicates_and_notifications(client: TestClient):
    headers, _ = register_and_get_headers(client, email="budgets@test.com")
    today = date.today()
    start_m = today.replace(day=1).isoformat()
    end_m = today.replace(day=calendar.monthrange(today.year, today.month)[1]).isoformat()
    food_cat = get_cat_id(client, headers, "Food", "expense")

    # Create Monthly Food Budget = ₹5,000
    b_resp = client.post(
        "/api/budgets",
        headers=headers,
        json={
            "category_id": food_cat,
            "budget_amount": "5000.00",
            "period_start": start_m,
            "period_end": end_m,
            "warning_threshold": 75,
            "critical_threshold": 100,
        },
    )
    assert b_resp.status_code == 201
    budget_id = b_resp.json()["id"]

    # Prevent duplicate budget for same user, category, and period
    dup_resp = client.post(
        "/api/budgets",
        headers=headers,
        json={
            "category_id": food_cat,
            "budget_amount": "6000.00",
            "period_start": start_m,
            "period_end": end_m,
        },
    )
    assert dup_resp.status_code == 400

    # Spend ₹3,200 (64% -> Normal)
    client.post(
        "/api/transactions",
        headers=headers,
        json={
            "category_id": food_cat,
            "transaction_type": "expense",
            "title": "Groceries",
            "amount": "3200.00",
            "transaction_date": today.isoformat(),
            "payment_method": "UPI",
        },
    )
    b_list = client.get("/api/budgets", headers=headers).json()
    assert b_list[0]["spent_amount"] == 3200.0
    assert b_list[0]["remaining_amount"] == 1800.0
    assert b_list[0]["percentage_used"] == 64.0
    assert b_list[0]["status"] == "Normal"

    # Spend another ₹800 -> Total ₹4,000 (80% -> Approaching Limit)
    client.post(
        "/api/transactions",
        headers=headers,
        json={
            "category_id": food_cat,
            "transaction_type": "expense",
            "title": "Restaurant Dinner",
            "amount": "800.00",
            "transaction_date": today.isoformat(),
            "payment_method": "UPI",
        },
    )
    b_list_warn = client.get("/api/budgets", headers=headers).json()
    assert b_list_warn[0]["spent_amount"] == 4000.0
    assert b_list_warn[0]["percentage_used"] == 80.0
    assert b_list_warn[0]["status"] == "Approaching Limit"

    # Verify in-app notification was created for Approaching Limit
    notifs = client.get("/api/notifications", headers=headers).json()
    assert any(n["notification_type"] == "budget_warning" for n in notifs)

    # Spend another ₹1,500 -> Total ₹5,500 (110% -> Exceeded)
    client.post(
        "/api/transactions",
        headers=headers,
        json={
            "category_id": food_cat,
            "transaction_type": "expense",
            "title": "Party Catering",
            "amount": "1500.00",
            "transaction_date": today.isoformat(),
            "payment_method": "Credit Card",
        },
    )
    b_list_exceeded = client.get("/api/budgets", headers=headers).json()
    assert b_list_exceeded[0]["spent_amount"] == 5500.0
    assert b_list_exceeded[0]["remaining_amount"] == -500.0
    assert b_list_exceeded[0]["percentage_used"] == 110.0
    assert b_list_exceeded[0]["status"] == "Exceeded"

    notifs_after = client.get("/api/notifications", headers=headers).json()
    assert any(n["notification_type"] == "budget_exceeded" for n in notifs_after)


# ==================== 6. SAVINGS GOALS, RECURRING, EXPORTS & ISOLATION ====================

def test_savings_goals_and_recurring_idempotency(client: TestClient):
    headers, _ = register_and_get_headers(client, email="goals@test.com")
    today = date.today()

    # Create Savings Goal: Buy a Laptop (Target: ₹50,000, Current: ₹15,000)
    goal_resp = client.post(
        "/api/savings-goals",
        headers=headers,
        json={
            "title": "Buy a Laptop",
            "target_amount": "50000.00",
            "current_amount": "15000.00",
            "target_date": (today + timedelta(days=60)).isoformat(),
        },
    )
    assert goal_resp.status_code == 201
    goal_data = goal_resp.json()
    assert goal_data["remaining_amount"] == 35000.0
    assert goal_data["percentage_completed"] == 30.0

    # Contribute ₹5,000 to goal -> Current: ₹20,000 (40%)
    contrib_resp = client.post(
        f"/api/savings-goals/{goal_data['id']}/contribute",
        headers=headers,
        json={"amount": "5000.00"},
    )
    assert contrib_resp.status_code == 200
    assert contrib_resp.json()["current_amount"] == 20000.0
    assert contrib_resp.json()["percentage_completed"] == 40.0

    # Recurring transaction due today
    rent_cat = get_cat_id(client, headers, "Rent", "expense")
    rec_resp = client.post(
        "/api/recurring-transactions",
        headers=headers,
        json={
            "category_id": rent_cat,
            "transaction_type": "expense",
            "title": "Monthly Hostel Rent",
            "amount": "8000.00",
            "payment_method": "Bank Transfer",
            "frequency": "monthly",
            "next_occurrence": today.isoformat(),
            "auto_create": True,
        },
    )
    assert rec_resp.status_code == 201

    # Trigger recurring processor again — idempotency must prevent duplicate creation!
    proc_again = client.post("/api/recurring-transactions/process", headers=headers)
    assert proc_again.status_code == 200
    assert proc_again.json()["processed_count"] == 0

    txs = client.get("/api/transactions", headers=headers).json()
    assert txs["total"] == 1
    assert txs["items"][0]["amount"] == 8000.0


def test_csv_pdf_export_and_ai_fallback(client: TestClient):
    headers, _ = register_and_get_headers(client, email="export@test.com")
    today = date.today().isoformat()
    food_cat = get_cat_id(client, headers, "Food", "expense")

    client.post(
        "/api/transactions",
        headers=headers,
        json={
            "category_id": food_cat,
            "transaction_type": "expense",
            "title": "Export Test Meal",
            "amount": "450.00",
            "transaction_date": today,
            "payment_method": "UPI",
        },
    )

    # CSV Export
    csv_resp = client.get("/api/reports/export/csv", headers=headers)
    assert csv_resp.status_code == 200
    assert "text/csv" in csv_resp.headers["content-type"]
    assert "Export Test Meal" in csv_resp.text
    assert "450.00" in csv_resp.text

    # PDF Export
    pdf_resp = client.get("/api/reports/export/pdf", headers=headers)
    assert pdf_resp.status_code == 200
    assert pdf_resp.headers["content-type"] == "application/pdf"
    assert pdf_resp.content.startswith(b"%PDF")

    # AI Spending Insights (Rule-based fallback works without API key)
    ins_resp = client.post("/api/insights/spending", headers=headers, json={})
    assert ins_resp.status_code == 200
    ins_data = ins_resp.json()
    assert ins_data["provider"] in ("rule_based_fallback", "llm_api")
    assert len(ins_data["insights"]) >= 1
    assert ins_data["summary_metrics"]["total_expenses"] == 450.0


def test_strict_cross_user_data_isolation(client: TestClient):
    headers_a, _ = register_and_get_headers(client, email="userA@private.com", name="User A")
    headers_b, _ = register_and_get_headers(client, email="userB@private.com", name="User B")
    today = date.today().isoformat()

    cat_a = get_cat_id(client, headers_a, "Salary", "income")
    tx_a = client.post(
        "/api/transactions",
        headers=headers_a,
        json={
            "category_id": cat_a,
            "transaction_type": "income",
            "title": "User A Private Salary",
            "amount": "95000.00",
            "transaction_date": today,
            "payment_method": "Bank Transfer",
        },
    ).json()

    # User B cannot view User A's transaction by ID
    assert client.get(f"/api/transactions/{tx_a['id']}", headers=headers_b).status_code == 404

    # User B cannot edit User A's transaction
    assert (
        client.put(
            f"/api/transactions/{tx_a['id']}",
            headers=headers_b,
            json={"title": "Hacked Title", "amount": 1},
        ).status_code
        == 404
    )

    # User B cannot delete User A's transaction
    assert client.delete(f"/api/transactions/{tx_a['id']}", headers=headers_b).status_code == 404

    # User B's dashboard shows 0 income, completely isolated from User A
    dash_b = client.get("/api/dashboard/summary", headers=headers_b).json()
    assert dash_b["total_income"] == 0.0
