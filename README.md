# EXPENSE TRACKER — SMART PERSONAL FINANCE MANAGEMENT SYSTEM

[![Repository](https://img.shields.io/badge/GitHub-Anilbirada%2FExpense--tracker---102a43?logo=github)](https://github.com/Anilbirada/Expense-tracker-)
[![Backend](https://img.shields.io/badge/Backend-FastAPI%20%7C%20Python%203.12-059669?logo=fastapi)](https://fastapi.tiangolo.com/)
[![Frontend](https://img.shields.io/badge/Frontend-React%2018%20%7C%20TypeScript%20%7C%20Tailwind-2563eb?logo=react)](https://react.dev/)
[![Tests](https://img.shields.io/badge/Tests-Pytest%20Passing-10b981?logo=pytest)](./backend/tests/test_app.py)

**Developer Credit:** Developed by **Anil Biradar**  
**GitHub Repository:** [https://github.com/Anilbirada/Expense-tracker-](https://github.com/Anilbirada/Expense-tracker-)

> **Repository Description (GitHub About):**  
> *Full-Stack Smart Personal Finance Management System built with React, TypeScript, Tailwind CSS, Python FastAPI, and SQLAlchemy. Features fixed-precision monetary calculations, interactive Recharts dashboards, monthly category budgets with threshold alerts, savings goals, recurring transactions, AI/rule-based spending insights, and CSV/PDF financial statement exports. Developed by Anil Biradar.*

---

## 1. Project Overview

**Expense Tracker — Smart Personal Finance Management System** is a full-stack personal finance web application designed for individuals, college students, and working professionals. It enables users to record daily income and expenses, organize spending into customizable categories, set monthly category budgets with configurable alert thresholds, monitor savings goals, automate recurring transactions, visualize financial habits through interactive charts, and export verifiable CSV and PDF financial statements.

### How the Frontend, Backend, and Database Communicate (Beginner-Friendly Explanation)
1. **Frontend (React + TypeScript + Tailwind CSS):** Runs in the user's browser (`http://localhost:5173`). When a user logs in, records an expense, or changes a date filter, the frontend sends an HTTP JSON request (with a secure `Bearer` JWT token) to the backend API.
2. **Backend (Python + FastAPI + SQLAlchemy + Pydantic):** Runs on `http://localhost:8000`. It validates every incoming request, checks that the logged-in user owns the requested data, performs authoritative fixed-precision `Decimal` monetary calculations, and queries or updates the database.
3. **Database (SQLite / PostgreSQL):** Stores structured relational tables (`users`, `categories`, `transactions`, `budgets`, `savings_goals`, `recurring_transactions`, and `notifications`) with foreign-key constraints and indexes.

---

## 2. Problem Statement

Many individuals and students find it difficult to track daily expenses and understand where their money goes. Recording transactions in notebooks or ad-hoc spreadsheets often leads to forgotten purchases, exceeded monthly budgets, and inaccurate savings calculations. Without organized financial records, identifying unnecessary spending and planning for future goals becomes challenging.

---

## 3. Proposed Solution

A centralized, privacy-first web application that provides:
- **Authoritative Monetary Math:** Fixed-precision `Decimal(12, 2)` calculations (never floating-point guesses).
- **Real-Time Dashboard & Date Filtering:** Instant calculation of Total Income, Total Expenses, Net Period Balance, Monthly Savings, and Budget Utilization across Today, This Week, This Month, Previous Month, This Year, All Time, or Custom Date Ranges.
- **Proactive Budget Governance:** Configurable warning (default `75%`) and critical/exceeded (`100%`) thresholds with automatic in-app notifications.
- **Isolated Fictional Demo Mode:** A dedicated 1-click demonstration account (`demo@expensetracker.com`) pre-loaded with clearly labeled `[DEMO]` fictional records for live project evaluation—strictly isolated from real users' private accounts.

---

## 4. Core Features

1. **Secure Authentication & Authorization:** Bcrypt password hashing, JWT session tokens, token revocation on logout, and strict per-user ownership checks.
2. **Interactive Financial Dashboard:** KPI cards, transparent formula explanations, Category Expense Pie Chart, 6-Month Income vs. Expense Bar Chart, Daily & Cumulative Spending Area Chart, Budget Warnings, and Recent Transactions.
3. **Income & Expense Recording:** Dedicated `/add-income` and `/add-expense` workflows with quick amount chips, payment method selection (`UPI`, `Bank Transfer`, `Debit Card`, `Credit Card`, `Cash`, etc.), and inline custom category creation.
4. **Full Transaction Management:** Search by title/notes, filter by type, category, payment method, and date range, sort by date/amount/title, pagination, details modal, edit modal, and confirmation before deletion.
5. **Monthly Budget Management:** Category-level monthly budgets with real-time spent/remaining calculation, progress bars, duplicate prevention, and configurable threshold alerts (`Normal`, `Approaching Limit`, `Exceeded`).
6. **Category Management with Data Integrity Protection:** Custom icons and color swatches; prevents deleting categories linked to existing transactions unless safely reassigned or archived.
7. **Financial Reports & Exports:** Executive summary, category breakdowns, budget performance audit table, **CSV Export**, and **PDF Financial Statement Export** (powered by ReportLab).
8. **Savings Goals & Recurring Transactions:** Track manual savings targets (clearly distinguished from bank balances) and automate recurring salary/rent/bills with idempotent duplicate prevention.
9. **Smart Spending Insights (AI + Rule-Based Fallback):** Generates beginner-friendly month-over-month spending comparisons and savings rate analysis using actual backend database summaries. Works 100% without an external API key via its built-in deterministic rule engine, and optionally supports OpenAI-compatible LLM keys on the backend.

---

## 5. Technology Stack

| Layer | Technologies Used |
| :--- | :--- |
| **Frontend** | React 18, TypeScript, Vite 5, Tailwind CSS 3, Recharts, Lucide React Icons, React Router v6 |
| **Backend** | Python 3.12, FastAPI, Pydantic v2, SQLAlchemy 2.0, Uvicorn |
| **Security** | Bcrypt (`bcrypt`), JSON Web Tokens (`PyJWT`), CORS Middleware |
| **Reporting** | Python `csv` module, `ReportLab` (PDF statement generation) |
| **Database** | SQLite (Local Development) / PostgreSQL-ready via `DATABASE_URL` |
| **Testing** | Pytest, FastAPI `TestClient`, `httpx` |

---

## 6. Database Schema

- **`users`**: `id`, `name`, `email` (Unique), `password_hash`, `user_type`, `currency`, `budget_warning_threshold`, `budget_critical_threshold`, `is_demo`, `created_at`, `updated_at`
- **`categories`**: `id`, `user_id` (FK), `name`, `category_type` (`income`|`expense`), `icon`, `color`, `is_default`, `is_archived`, `created_at`
- **`transactions`**: `id`, `user_id` (FK), `category_id` (FK), `transaction_type` (`income`|`expense`), `title`, `amount` (`Numeric(12,2)`), `transaction_date`, `payment_method`, `notes`, `recurring_id` (FK), `created_at`, `updated_at`
- **`budgets`**: `id`, `user_id` (FK), `category_id` (FK), `budget_amount` (`Numeric(12,2)`), `period_start`, `period_end`, `warning_threshold`, `critical_threshold`, `created_at`
- **`savings_goals`**: `id`, `user_id` (FK), `title`, `target_amount` (`Numeric(12,2)`), `current_amount` (`Numeric(12,2)`), `target_date`, `status`, `notes`, `created_at`
- **`recurring_transactions`**: `id`, `user_id` (FK), `category_id` (FK), `transaction_type`, `title`, `amount` (`Numeric(12,2)`), `payment_method`, `frequency`, `next_occurrence`, `last_processed_date`, `is_active`, `auto_create`, `notes`, `created_at`
- **`notifications`**: `id`, `user_id` (FK), `title`, `message`, `notification_type`, `is_read`, `dedup_key`, `created_at`

---

## 7. REST API Documentation

Interactive Swagger UI documentation is automatically available at `http://localhost:8000/docs` when the backend is running.

- **Auth:** `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/demo-login`, `POST /api/auth/demo-reset`, `POST /api/auth/logout`, `GET /api/auth/me`, `PUT /api/auth/profile`, `PUT /api/auth/password`
- **Dashboard:** `GET /api/dashboard/summary`, `GET /api/dashboard/spending-trends`, `GET /api/dashboard/category-breakdown`
- **Transactions:** `GET /api/transactions`, `POST /api/transactions`, `GET /api/transactions/{id}`, `PUT /api/transactions/{id}`, `DELETE /api/transactions/{id}`
- **Categories:** `GET /api/categories`, `POST /api/categories`, `PUT /api/categories/{id}`, `DELETE /api/categories/{id}`
- **Budgets:** `GET /api/budgets`, `POST /api/budgets`, `PUT /api/budgets/{id}`, `DELETE /api/budgets/{id}`
- **Reports:** `GET /api/reports/summary`, `GET /api/reports/export/csv`, `GET /api/reports/export/pdf`
- **Savings Goals:** `GET /api/savings-goals`, `POST /api/savings-goals`, `PUT /api/savings-goals/{id}`, `POST /api/savings-goals/{id}/contribute`, `DELETE /api/savings-goals/{id}`
- **Recurring Transactions:** `GET /api/recurring-transactions`, `POST /api/recurring-transactions`, `PUT /api/recurring-transactions/{id}`, `DELETE /api/recurring-transactions/{id}`, `POST /api/recurring-transactions/process`
- **Notifications & Insights:** `GET /api/notifications`, `PATCH /api/notifications/{id}/read`, `POST /api/notifications/read-all`, `POST /api/insights/spending`

---

## 8. Installation, Setup & Running Instructions

### Option A: 1-Click Windows Launcher
Double-click **`start_app.bat`** in the project root folder to launch both Backend and Frontend servers and open the browser automatically.

### Option B: Manual Terminal Setup
#### Step 1: Backend Setup
```powershell
cd backend
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

#### Step 2: Frontend Setup
Open a second terminal:
```powershell
cd frontend
npm.cmd install
npm.cmd run dev
```
Then open **`http://localhost:5173`** in your browser.

#### Step 3: Running Automated Tests
```powershell
cd backend
python -m pytest -v
```

---

## 9. Known Limitations & Future Enhancements

- **Known Limitations:**
  - The application tracks transactions recorded by the user and does not connect directly to live bank APIs (to protect user privacy and avoid collecting sensitive banking credentials).
  - In-app notifications are enabled by default; external email delivery requires SMTP credentials in production.
- **Future Enhancements:**
  - Multi-currency exchange rate conversion.
  - OCR receipt image scanning for automatic expense entry.
  - Shared household/family budget workspaces.

---

**FINAL DEVELOPER CREDIT:**  
**Developed by Anil Biradar**
