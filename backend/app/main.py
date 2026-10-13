from contextlib import asynccontextmanager
from datetime import date
from decimal import Decimal
import logging
import math
from typing import Optional, List

from fastapi import FastAPI, Depends, HTTPException, Query, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.config import settings
from app.database import Base, engine, SessionLocal, get_db
from app.models import (
    User,
    Category,
    Transaction,
    Budget,
    SavingsGoal,
    RecurringTransaction,
    Notification,
)
from app.schemas import (
    UserRegisterRequest,
    UserLoginRequest,
    UserProfileUpdateRequest,
    PasswordChangeRequest,
    UserResponse,
    AuthResponse,
    CategoryCreateRequest,
    CategoryUpdateRequest,
    CategoryResponse,
    TransactionCreateRequest,
    TransactionUpdateRequest,
    TransactionResponse,
    PaginatedTransactionsResponse,
    BudgetCreateRequest,
    BudgetUpdateRequest,
    BudgetResponse,
    SavingsGoalCreateRequest,
    SavingsGoalUpdateRequest,
    SavingsGoalContributionRequest,
    SavingsGoalResponse,
    RecurringTransactionCreateRequest,
    RecurringTransactionUpdateRequest,
    RecurringTransactionResponse,
    NotificationResponse,
    InsightRequest,
    quantize_money,
)
from app.security import (
    hash_password,
    verify_password,
    create_access_token,
    revoke_token,
    get_current_user,
    security_scheme,
)
from app.services.finance import (
    to_decimal,
    to_float,
    ensure_default_categories,
    resolve_date_range,
    calculate_budget_status,
    sync_user_budget_notifications,
    process_due_recurring_transactions,
    get_dashboard_summary_data,
    get_spending_trends_data,
    get_category_breakdown_data,
    generate_spending_insights,
    generate_csv_report,
    generate_pdf_report,
)
from app.seed import seed_demo_account

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("expense_tracker")


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        seed_demo_account(db, force_reset=False)
    except Exception as exc:
        logger.warning(f"Demo seed skipped or encountered issue: {exc}")
    finally:
        db.close()
    yield


app = FastAPI(
    title=settings.APP_NAME,
    description=(
        "Complete Smart Personal Finance Management System with Fixed-Precision Monetary Calculations, "
        "Budgets, Interactive Analytics, Recurring Transactions, Savings Goals, Reports, and Insights. "
        "Developed by Anil Biradar."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

origins = [o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health", tags=["System"])
def health_check():
    return {
        "status": "healthy",
        "application": settings.APP_NAME,
        "developer": settings.DEVELOPER_CREDIT,
        "version": "1.0.0",
    }


# ==================== AUTHENTICATION ENDPOINTS ====================

@app.post("/api/auth/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED, tags=["Authentication"])
def register_user(payload: UserRegisterRequest, db: Session = Depends(get_db)):
    normalized_email = payload.email.lower().strip()
    existing = db.query(User).filter(func.lower(User.email) == normalized_email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account with this email address already exists.",
        )

    user = User(
        name=payload.name,
        email=normalized_email,
        password_hash=hash_password(payload.password),
        user_type=payload.user_type,
        currency=payload.currency or "INR",
        budget_warning_threshold=75,
        budget_critical_threshold=100,
        is_demo=False,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    ensure_default_categories(db, user.id)

    db.add(
        Notification(
            user_id=user.id,
            title="Welcome to Expense Tracker!",
            message=(
                f"Hi {user.name}, your personal finance workspace is ready. "
                "Start by recording your income, setting monthly budgets, or adding a savings goal."
            ),
            notification_type="system",
            is_read=False,
            dedup_key=f"welcome_user_{user.id}",
        )
    )
    db.commit()

    token = create_access_token(user.id, user.email)
    return {"access_token": token, "token_type": "bearer", "user": user}


@app.post("/api/auth/login", response_model=AuthResponse, tags=["Authentication"])
def login_user(payload: UserLoginRequest, db: Session = Depends(get_db)):
    normalized_email = payload.email.lower().strip()
    user = db.query(User).filter(func.lower(User.email) == normalized_email).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )

    ensure_default_categories(db, user.id)
    process_due_recurring_transactions(db, user.id)

    token = create_access_token(user.id, user.email)
    return {"access_token": token, "token_type": "bearer", "user": user}


@app.post("/api/auth/demo-login", response_model=AuthResponse, tags=["Authentication"])
def login_demo_account(db: Session = Depends(get_db)):
    demo_user = seed_demo_account(db, force_reset=False)
    process_due_recurring_transactions(db, demo_user.id)
    token = create_access_token(demo_user.id, demo_user.email)
    return {"access_token": token, "token_type": "bearer", "user": demo_user}


@app.post("/api/auth/demo-reset", response_model=AuthResponse, tags=["Authentication"])
def reset_demo_account(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not current_user.is_demo:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Demo reset is only allowed on the dedicated fictional demonstration account.",
        )
    demo_user = seed_demo_account(db, force_reset=True)
    token = create_access_token(demo_user.id, demo_user.email)
    return {"access_token": token, "token_type": "bearer", "user": demo_user}


@app.post("/api/auth/logout", tags=["Authentication"])
def logout_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_scheme),
    current_user: User = Depends(get_current_user),
):
    if credentials and credentials.credentials:
        revoke_token(credentials.credentials)
    return {"message": "Successfully logged out."}


@app.get("/api/auth/me", response_model=UserResponse, tags=["Authentication"])
def get_me(current_user: User = Depends(get_current_user)):
    return current_user


@app.put("/api/auth/profile", response_model=UserResponse, tags=["Authentication"])
def update_profile(
    payload: UserProfileUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if payload.name is not None:
        current_user.name = payload.name.strip()
    if payload.user_type is not None:
        current_user.user_type = payload.user_type
    if payload.currency is not None:
        current_user.currency = payload.currency.strip().upper()
    if payload.budget_warning_threshold is not None:
        current_user.budget_warning_threshold = payload.budget_warning_threshold
    if payload.budget_critical_threshold is not None:
        current_user.budget_critical_threshold = payload.budget_critical_threshold

    if current_user.budget_warning_threshold >= current_user.budget_critical_threshold:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Warning threshold must be lower than critical threshold.",
        )

    db.commit()
    db.refresh(current_user)
    return current_user


@app.put("/api/auth/password", tags=["Authentication"])
def update_password(
    payload: PasswordChangeRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(payload.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect.",
        )
    current_user.password_hash = hash_password(payload.new_password)
    db.commit()
    return {"message": "Password updated successfully."}


# ==================== DASHBOARD ENDPOINTS ====================

@app.get("/api/dashboard/summary", tags=["Dashboard"])
def dashboard_summary(
    period: Optional[str] = Query(default="this_month"),
    start_date: Optional[date] = Query(default=None),
    end_date: Optional[date] = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if start_date and end_date and end_date < start_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="end_date cannot be earlier than start_date.",
        )
    process_due_recurring_transactions(db, current_user.id)
    return get_dashboard_summary_data(db, current_user, period=period, start_date=start_date, end_date=end_date)


@app.get("/api/dashboard/spending-trends", tags=["Dashboard"])
def dashboard_spending_trends(
    months: int = Query(default=6, ge=1, le=24),
    start_date: Optional[date] = Query(default=None),
    end_date: Optional[date] = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return get_spending_trends_data(db, current_user, months=months, start_date=start_date, end_date=end_date)


@app.get("/api/dashboard/category-breakdown", tags=["Dashboard"])
def dashboard_category_breakdown(
    transaction_type: str = Query(default="expense", pattern="^(income|expense)$"),
    period: Optional[str] = Query(default="this_month"),
    start_date: Optional[date] = Query(default=None),
    end_date: Optional[date] = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return get_category_breakdown_data(
        db,
        current_user,
        transaction_type=transaction_type,
        period=period,
        start_date=start_date,
        end_date=end_date,
    )


# ==================== CATEGORIES ENDPOINTS ====================

@app.get("/api/categories", response_model=List[CategoryResponse], tags=["Categories"])
def list_categories(
    category_type: Optional[str] = Query(default=None, pattern="^(income|expense)$"),
    include_archived: bool = Query(default=False),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ensure_default_categories(db, current_user.id)
    query = db.query(Category).filter(Category.user_id == current_user.id)
    if category_type:
        query = query.filter(Category.category_type == category_type)
    if not include_archived:
        query = query.filter(Category.is_archived == False)

    cats = query.order_by(Category.category_type.asc(), Category.name.asc()).all()

    # Count transactions per category
    counts = dict(
        db.query(Transaction.category_id, func.count(Transaction.id))
        .filter(Transaction.user_id == current_user.id)
        .group_by(Transaction.category_id)
        .all()
    )

    result = []
    for c in cats:
        result.append(
            CategoryResponse(
                id=c.id,
                user_id=c.user_id,
                name=c.name,
                category_type=c.category_type,
                icon=c.icon,
                color=c.color,
                is_default=c.is_default,
                is_archived=c.is_archived,
                transaction_count=counts.get(c.id, 0),
                created_at=c.created_at,
            )
        )
    return result


@app.post("/api/categories", response_model=CategoryResponse, status_code=status.HTTP_201_CREATED, tags=["Categories"])
def create_category(
    payload: CategoryCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    existing = (
        db.query(Category)
        .filter(
            Category.user_id == current_user.id,
            func.lower(Category.name) == payload.name.lower(),
            Category.category_type == payload.category_type,
        )
        .first()
    )
    if existing:
        if existing.is_archived:
            existing.is_archived = False
            existing.icon = payload.icon
            existing.color = payload.color
            db.commit()
            db.refresh(existing)
            return CategoryResponse(
                id=existing.id,
                user_id=existing.user_id,
                name=existing.name,
                category_type=existing.category_type,
                icon=existing.icon,
                color=existing.color,
                is_default=existing.is_default,
                is_archived=existing.is_archived,
                transaction_count=0,
                created_at=existing.created_at,
            )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"A {payload.category_type} category named '{payload.name}' already exists.",
        )

    cat = Category(
        user_id=current_user.id,
        name=payload.name,
        category_type=payload.category_type,
        icon=payload.icon,
        color=payload.color,
        is_default=False,
        is_archived=False,
    )
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return CategoryResponse(
        id=cat.id,
        user_id=cat.user_id,
        name=cat.name,
        category_type=cat.category_type,
        icon=cat.icon,
        color=cat.color,
        is_default=cat.is_default,
        is_archived=cat.is_archived,
        transaction_count=0,
        created_at=cat.created_at,
    )


@app.put("/api/categories/{category_id}", response_model=CategoryResponse, tags=["Categories"])
def update_category(
    category_id: int,
    payload: CategoryUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    cat = db.query(Category).filter(Category.id == category_id, Category.user_id == current_user.id).first()
    if not cat:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found.")

    if payload.name is not None:
        clean_name = payload.name.strip()
        if not clean_name:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Category name cannot be empty.")
        dup = (
            db.query(Category)
            .filter(
                Category.user_id == current_user.id,
                func.lower(Category.name) == clean_name.lower(),
                Category.category_type == cat.category_type,
                Category.id != cat.id,
            )
            .first()
        )
        if dup:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Another category with this name already exists.")
        cat.name = clean_name

    if payload.icon is not None:
        cat.icon = payload.icon
    if payload.color is not None:
        cat.color = payload.color
    if payload.is_archived is not None:
        cat.is_archived = payload.is_archived

    db.commit()
    db.refresh(cat)
    tx_count = db.query(func.count(Transaction.id)).filter(Transaction.category_id == cat.id).scalar() or 0
    return CategoryResponse(
        id=cat.id,
        user_id=cat.user_id,
        name=cat.name,
        category_type=cat.category_type,
        icon=cat.icon,
        color=cat.color,
        is_default=cat.is_default,
        is_archived=cat.is_archived,
        transaction_count=tx_count,
        created_at=cat.created_at,
    )


@app.delete("/api/categories/{category_id}", tags=["Categories"])
def delete_category(
    category_id: int,
    reassign_to_category_id: Optional[int] = Query(default=None),
    archive_instead: bool = Query(default=False),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    cat = db.query(Category).filter(Category.id == category_id, Category.user_id == current_user.id).first()
    if not cat:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found.")

    tx_count = db.query(func.count(Transaction.id)).filter(Transaction.category_id == cat.id).scalar() or 0
    rec_count = db.query(func.count(RecurringTransaction.id)).filter(RecurringTransaction.category_id == cat.id).scalar() or 0

    if (tx_count > 0 or rec_count > 0) and not reassign_to_category_id and not archive_instead:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Cannot delete category '{cat.name}' because it is linked to {tx_count} transaction(s) "
                f"and {rec_count} recurring rule(s). Please specify reassign_to_category_id to safely "
                f"reassign existing records, or set archive_instead=true."
            ),
        )

    if archive_instead:
        cat.is_archived = True
        db.commit()
        return {"message": f"Category '{cat.name}' has been safely archived.", "archived": True}

    if reassign_to_category_id is not None:
        if reassign_to_category_id == cat.id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot reassign to the same category.")
        target_cat = (
            db.query(Category)
            .filter(
                Category.id == reassign_to_category_id,
                Category.user_id == current_user.id,
                Category.category_type == cat.category_type,
            )
            .first()
        )
        if not target_cat:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Target reassignment category not found or has a different type.",
            )
        db.query(Transaction).filter(
            Transaction.user_id == current_user.id,
            Transaction.category_id == cat.id,
        ).update({Transaction.category_id: target_cat.id})
        db.query(RecurringTransaction).filter(
            RecurringTransaction.user_id == current_user.id,
            RecurringTransaction.category_id == cat.id,
        ).update({RecurringTransaction.category_id: target_cat.id})

    db.delete(cat)
    db.commit()
    return {"message": f"Category '{cat.name}' deleted successfully.", "deleted": True}


# ==================== TRANSACTIONS ENDPOINTS ====================

def serialize_transaction(t: Transaction) -> TransactionResponse:
    return TransactionResponse(
        id=t.id,
        user_id=t.user_id,
        category_id=t.category_id,
        category_name=t.category.name if t.category else "Uncategorized",
        category_icon=t.category.icon if t.category else "Tag",
        category_color=t.category.color if t.category else "#2563eb",
        transaction_type=t.transaction_type,
        title=t.title,
        amount=to_float(t.amount),
        transaction_date=t.transaction_date,
        payment_method=t.payment_method,
        notes=t.notes,
        recurring_id=t.recurring_id,
        created_at=t.created_at,
        updated_at=t.updated_at,
    )


@app.get("/api/transactions", response_model=PaginatedTransactionsResponse, tags=["Transactions"])
def list_transactions(
    search: Optional[str] = Query(default=None),
    category_id: Optional[int] = Query(default=None),
    transaction_type: Optional[str] = Query(default=None, pattern="^(income|expense)$"),
    payment_method: Optional[str] = Query(default=None),
    start_date: Optional[date] = Query(default=None),
    end_date: Optional[date] = Query(default=None),
    sort_by: str = Query(default="date", pattern="^(date|amount|title)$"),
    sort_order: str = Query(default="desc", pattern="^(asc|desc)$"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=15, ge=1, le=200),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(Transaction).filter(Transaction.user_id == current_user.id)

    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.filter(or_(Transaction.title.ilike(term), Transaction.notes.ilike(term)))
    if category_id is not None:
        query = query.filter(Transaction.category_id == category_id)
    if transaction_type:
        query = query.filter(Transaction.transaction_type == transaction_type)
    if payment_method and payment_method.strip():
        query = query.filter(Transaction.payment_method == payment_method.strip())
    if start_date:
        query = query.filter(Transaction.transaction_date >= start_date)
    if end_date:
        query = query.filter(Transaction.transaction_date <= end_date)

    # Calculate filtered totals using Decimal
    all_matching = query.all()
    p_inc = sum((to_decimal(t.amount) for t in all_matching if t.transaction_type == "income"), Decimal("0.00"))
    p_exp = sum((to_decimal(t.amount) for t in all_matching if t.transaction_type == "expense"), Decimal("0.00"))
    total_count = len(all_matching)

    # Sorting
    if sort_by == "amount":
        order_col = Transaction.amount.asc() if sort_order == "asc" else Transaction.amount.desc()
        query = query.order_by(order_col, Transaction.transaction_date.desc())
    elif sort_by == "title":
        order_col = Transaction.title.asc() if sort_order == "asc" else Transaction.title.desc()
        query = query.order_by(order_col, Transaction.transaction_date.desc())
    else:
        if sort_order == "asc":
            query = query.order_by(Transaction.transaction_date.asc(), Transaction.id.asc())
        else:
            query = query.order_by(Transaction.transaction_date.desc(), Transaction.id.desc())

    total_pages = max(1, math.ceil(total_count / page_size))
    offset = (page - 1) * page_size
    items = query.offset(offset).limit(page_size).all()

    return PaginatedTransactionsResponse(
        items=[serialize_transaction(t) for t in items],
        total=total_count,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
        period_income=to_float(p_inc),
        period_expense=to_float(p_exp),
        period_net=to_float(p_inc - p_exp),
    )


@app.post("/api/transactions", response_model=TransactionResponse, status_code=status.HTTP_201_CREATED, tags=["Transactions"])
def create_transaction(
    payload: TransactionCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    category = (
        db.query(Category)
        .filter(Category.id == payload.category_id, Category.user_id == current_user.id)
        .first()
    )
    if not category:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Selected category does not exist or does not belong to your account.",
        )
    if category.category_type != payload.transaction_type:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Category '{category.name}' is of type '{category.category_type}', which does not match transaction type '{payload.transaction_type}'.",
        )

    tx = Transaction(
        user_id=current_user.id,
        category_id=category.id,
        transaction_type=payload.transaction_type,
        title=payload.title,
        amount=quantize_money(payload.amount),
        transaction_date=payload.transaction_date,
        payment_method=payload.payment_method.strip(),
        notes=payload.notes.strip() if payload.notes else None,
    )
    db.add(tx)
    db.commit()
    db.refresh(tx)

    if tx.transaction_type == "expense":
        sync_user_budget_notifications(db, current_user.id)

    return serialize_transaction(tx)


@app.get("/api/transactions/{transaction_id}", response_model=TransactionResponse, tags=["Transactions"])
def get_transaction(
    transaction_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    tx = (
        db.query(Transaction)
        .filter(Transaction.id == transaction_id, Transaction.user_id == current_user.id)
        .first()
    )
    if not tx:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transaction not found.")
    return serialize_transaction(tx)


@app.put("/api/transactions/{transaction_id}", response_model=TransactionResponse, tags=["Transactions"])
def update_transaction(
    transaction_id: int,
    payload: TransactionUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    tx = (
        db.query(Transaction)
        .filter(Transaction.id == transaction_id, Transaction.user_id == current_user.id)
        .first()
    )
    if not tx:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transaction not found.")

    new_type = payload.transaction_type or tx.transaction_type
    new_cat_id = payload.category_id or tx.category_id

    category = (
        db.query(Category)
        .filter(Category.id == new_cat_id, Category.user_id == current_user.id)
        .first()
    )
    if not category:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found.")
    if category.category_type != new_type:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Category '{category.name}' is for '{category.category_type}', cannot use with '{new_type}'.",
        )

    tx.category_id = new_cat_id
    tx.transaction_type = new_type
    if payload.title is not None:
        clean_title = payload.title.strip()
        if not clean_title:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Title cannot be empty.")
        tx.title = clean_title
    if payload.amount is not None:
        tx.amount = quantize_money(payload.amount)
    if payload.transaction_date is not None:
        tx.transaction_date = payload.transaction_date
    if payload.payment_method is not None:
        tx.payment_method = payload.payment_method.strip()
    if payload.notes is not None:
        tx.notes = payload.notes.strip() if payload.notes else None

    db.commit()
    db.refresh(tx)
    sync_user_budget_notifications(db, current_user.id)
    return serialize_transaction(tx)


@app.delete("/api/transactions/{transaction_id}", tags=["Transactions"])
def delete_transaction(
    transaction_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    tx = (
        db.query(Transaction)
        .filter(Transaction.id == transaction_id, Transaction.user_id == current_user.id)
        .first()
    )
    if not tx:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transaction not found.")

    db.delete(tx)
    db.commit()
    return {"message": "Transaction deleted successfully.", "deleted_id": transaction_id}


# ==================== BUDGETS ENDPOINTS ====================

@app.get("/api/budgets", response_model=List[BudgetResponse], tags=["Budgets"])
def list_budgets(
    start_date: Optional[date] = Query(default=None),
    end_date: Optional[date] = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(Budget).filter(Budget.user_id == current_user.id)
    if start_date and end_date:
        query = query.filter(Budget.period_start <= end_date, Budget.period_end >= start_date)
    budgets = query.order_by(Budget.period_start.desc(), Budget.id.desc()).all()
    return [calculate_budget_status(db, b, create_alerts=True) for b in budgets]


@app.post("/api/budgets", response_model=BudgetResponse, status_code=status.HTTP_201_CREATED, tags=["Budgets"])
def create_budget(
    payload: BudgetCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    cat = (
        db.query(Category)
        .filter(Category.id == payload.category_id, Category.user_id == current_user.id)
        .first()
    )
    if not cat:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found.")
    if cat.category_type != "expense":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Budgets can only be created for expense categories.",
        )

    # Check for duplicate budget in the same period for the same category
    duplicate = (
        db.query(Budget)
        .filter(
            Budget.user_id == current_user.id,
            Budget.category_id == payload.category_id,
            Budget.period_start == payload.period_start,
            Budget.period_end == payload.period_end,
        )
        .first()
    )
    if duplicate:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"A budget for '{cat.name}' already exists for the period {payload.period_start} to {payload.period_end}.",
        )

    budget = Budget(
        user_id=current_user.id,
        category_id=cat.id,
        budget_amount=quantize_money(payload.budget_amount),
        period_start=payload.period_start,
        period_end=payload.period_end,
        warning_threshold=payload.warning_threshold,
        critical_threshold=payload.critical_threshold,
    )
    db.add(budget)
    db.commit()
    db.refresh(budget)

    return calculate_budget_status(db, budget, create_alerts=True)


@app.put("/api/budgets/{budget_id}", response_model=BudgetResponse, tags=["Budgets"])
def update_budget(
    budget_id: int,
    payload: BudgetUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    budget = (
        db.query(Budget)
        .filter(Budget.id == budget_id, Budget.user_id == current_user.id)
        .first()
    )
    if not budget:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Budget not found.")

    if payload.budget_amount is not None:
        budget.budget_amount = quantize_money(payload.budget_amount)
    if payload.period_start is not None:
        budget.period_start = payload.period_start
    if payload.period_end is not None:
        budget.period_end = payload.period_end
    if payload.warning_threshold is not None:
        budget.warning_threshold = payload.warning_threshold
    if payload.critical_threshold is not None:
        budget.critical_threshold = payload.critical_threshold

    if budget.period_end < budget.period_start:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="period_end must be >= period_start.")
    if budget.warning_threshold >= budget.critical_threshold:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="warning_threshold must be less than critical_threshold.",
        )

    db.commit()
    db.refresh(budget)
    return calculate_budget_status(db, budget, create_alerts=True)


@app.delete("/api/budgets/{budget_id}", tags=["Budgets"])
def delete_budget(
    budget_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    budget = (
        db.query(Budget)
        .filter(Budget.id == budget_id, Budget.user_id == current_user.id)
        .first()
    )
    if not budget:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Budget not found.")

    db.delete(budget)
    db.commit()
    return {"message": "Budget deleted successfully.", "deleted_id": budget_id}


# ==================== REPORTS ENDPOINTS ====================

@app.get("/api/reports/summary", tags=["Reports"])
def reports_summary(
    period: Optional[str] = Query(default="this_month"),
    start_date: Optional[date] = Query(default=None),
    end_date: Optional[date] = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    p_start, p_end, _ = resolve_date_range(period, start_date, end_date)
    summary = get_dashboard_summary_data(db, current_user, period=period, start_date=p_start, end_date=p_end)
    trends = get_spending_trends_data(db, current_user, months=6, start_date=p_start, end_date=p_end)
    income_breakdown = get_category_breakdown_data(
        db, current_user, transaction_type="income", period=period, start_date=p_start, end_date=p_end
    )

    tx_query = db.query(Transaction).filter(Transaction.user_id == current_user.id)
    if p_start:
        tx_query = tx_query.filter(Transaction.transaction_date >= p_start)
    if p_end:
        tx_query = tx_query.filter(Transaction.transaction_date <= p_end)
    transactions = tx_query.order_by(Transaction.transaction_date.desc(), Transaction.id.desc()).all()

    return {
        "summary": summary,
        "monthly_comparisons": trends["monthly_comparison"],
        "daily_trend": trends["daily_trend"],
        "expense_breakdown": summary["highest_spending_categories"],
        "income_breakdown": income_breakdown["categories"],
        "budget_performance": summary["budgets"],
        "transactions": [serialize_transaction(t) for t in transactions],
    }


@app.get("/api/reports/export/csv", tags=["Reports"])
def export_csv_report(
    period: Optional[str] = Query(default="all_time"),
    start_date: Optional[date] = Query(default=None),
    end_date: Optional[date] = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    p_start, p_end, _ = resolve_date_range(period, start_date, end_date)
    csv_data = generate_csv_report(db, current_user, start_date=p_start, end_date=p_end)
    filename = f"expense_tracker_report_{date.today().isoformat()}.csv"
    return Response(
        content=csv_data,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.get("/api/reports/export/pdf", tags=["Reports"])
def export_pdf_report(
    period: Optional[str] = Query(default="this_month"),
    start_date: Optional[date] = Query(default=None),
    end_date: Optional[date] = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    p_start, p_end, _ = resolve_date_range(period, start_date, end_date)
    pdf_bytes = generate_pdf_report(db, current_user, start_date=p_start, end_date=p_end)
    filename = f"expense_tracker_report_{date.today().isoformat()}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ==================== SAVINGS GOALS ENDPOINTS ====================

def serialize_savings_goal(g: SavingsGoal) -> SavingsGoalResponse:
    target = to_decimal(g.target_amount)
    current = to_decimal(g.current_amount)
    remaining = max(Decimal("0.00"), target - current)
    pct = (
        ((current / target) * Decimal("100")).quantize(Decimal("0.01"))
        if target > Decimal("0.00")
        else Decimal("0.00")
    )
    return SavingsGoalResponse(
        id=g.id,
        user_id=g.user_id,
        title=g.title,
        target_amount=to_float(target),
        current_amount=to_float(current),
        remaining_amount=to_float(remaining),
        percentage_completed=to_float(pct),
        target_date=g.target_date,
        status=g.status,
        notes=g.notes,
        created_at=g.created_at,
    )


@app.get("/api/savings-goals", response_model=List[SavingsGoalResponse], tags=["Savings Goals"])
def list_savings_goals(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    goals = (
        db.query(SavingsGoal)
        .filter(SavingsGoal.user_id == current_user.id)
        .order_by(SavingsGoal.created_at.desc())
        .all()
    )
    return [serialize_savings_goal(g) for g in goals]


@app.post("/api/savings-goals", response_model=SavingsGoalResponse, status_code=status.HTTP_201_CREATED, tags=["Savings Goals"])
def create_savings_goal(
    payload: SavingsGoalCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    status_val = "completed" if payload.current_amount >= payload.target_amount else "active"
    goal = SavingsGoal(
        user_id=current_user.id,
        title=payload.title.strip(),
        target_amount=quantize_money(payload.target_amount),
        current_amount=quantize_money(payload.current_amount),
        target_date=payload.target_date,
        status=status_val,
        notes=payload.notes.strip() if payload.notes else None,
    )
    db.add(goal)
    db.commit()
    db.refresh(goal)
    return serialize_savings_goal(goal)


@app.put("/api/savings-goals/{goal_id}", response_model=SavingsGoalResponse, tags=["Savings Goals"])
def update_savings_goal(
    goal_id: int,
    payload: SavingsGoalUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    goal = (
        db.query(SavingsGoal)
        .filter(SavingsGoal.id == goal_id, SavingsGoal.user_id == current_user.id)
        .first()
    )
    if not goal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Savings goal not found.")

    if payload.title is not None:
        goal.title = payload.title.strip()
    if payload.target_amount is not None:
        goal.target_amount = quantize_money(payload.target_amount)
    if payload.current_amount is not None:
        goal.current_amount = quantize_money(payload.current_amount)
    if payload.target_date is not None:
        goal.target_date = payload.target_date
    if payload.notes is not None:
        goal.notes = payload.notes.strip() if payload.notes else None

    if payload.status is not None:
        goal.status = payload.status
    elif to_decimal(goal.current_amount) >= to_decimal(goal.target_amount):
        goal.status = "completed"

    db.commit()
    db.refresh(goal)
    return serialize_savings_goal(goal)


@app.post("/api/savings-goals/{goal_id}/contribute", response_model=SavingsGoalResponse, tags=["Savings Goals"])
def contribute_to_savings_goal(
    goal_id: int,
    payload: SavingsGoalContributionRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    goal = (
        db.query(SavingsGoal)
        .filter(SavingsGoal.id == goal_id, SavingsGoal.user_id == current_user.id)
        .first()
    )
    if not goal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Savings goal not found.")

    new_amt = to_decimal(goal.current_amount) + quantize_money(payload.amount)
    goal.current_amount = new_amt
    if new_amt >= to_decimal(goal.target_amount):
        goal.status = "completed"
        db.add(
            Notification(
                user_id=current_user.id,
                title=f"Savings Goal Completed: {goal.title}!",
                message=f"Congratulations! Your manually tracked savings goal '{goal.title}' has reached ₹{new_amt:,.2f}.",
                notification_type="goal_milestone",
                is_read=False,
                dedup_key=f"goal_completed_{goal.id}",
            )
        )

    db.commit()
    db.refresh(goal)
    return serialize_savings_goal(goal)


@app.delete("/api/savings-goals/{goal_id}", tags=["Savings Goals"])
def delete_savings_goal(
    goal_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    goal = (
        db.query(SavingsGoal)
        .filter(SavingsGoal.id == goal_id, SavingsGoal.user_id == current_user.id)
        .first()
    )
    if not goal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Savings goal not found.")

    db.delete(goal)
    db.commit()
    return {"message": "Savings goal deleted successfully.", "deleted_id": goal_id}


# ==================== RECURRING TRANSACTIONS ENDPOINTS ====================

def serialize_recurring(r: RecurringTransaction) -> RecurringTransactionResponse:
    days_until = (r.next_occurrence - date.today()).days
    return RecurringTransactionResponse(
        id=r.id,
        user_id=r.user_id,
        category_id=r.category_id,
        category_name=r.category.name if r.category else "Category",
        category_icon=r.category.icon if r.category else "Tag",
        category_color=r.category.color if r.category else "#2563eb",
        transaction_type=r.transaction_type,
        title=r.title,
        amount=to_float(r.amount),
        payment_method=r.payment_method,
        frequency=r.frequency,
        next_occurrence=r.next_occurrence,
        last_processed_date=r.last_processed_date,
        is_active=r.is_active,
        auto_create=r.auto_create,
        days_until_due=days_until,
        notes=r.notes,
        created_at=r.created_at,
    )


@app.get("/api/recurring-transactions", response_model=List[RecurringTransactionResponse], tags=["Recurring Transactions"])
def list_recurring_transactions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    items = (
        db.query(RecurringTransaction)
        .filter(RecurringTransaction.user_id == current_user.id)
        .order_by(RecurringTransaction.next_occurrence.asc())
        .all()
    )
    return [serialize_recurring(r) for r in items]


@app.post("/api/recurring-transactions", response_model=RecurringTransactionResponse, status_code=status.HTTP_201_CREATED, tags=["Recurring Transactions"])
def create_recurring_transaction(
    payload: RecurringTransactionCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    cat = (
        db.query(Category)
        .filter(Category.id == payload.category_id, Category.user_id == current_user.id)
        .first()
    )
    if not cat:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found.")
    if cat.category_type != payload.transaction_type:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Category '{cat.name}' is for '{cat.category_type}', cannot use with '{payload.transaction_type}'.",
        )

    rec = RecurringTransaction(
        user_id=current_user.id,
        category_id=cat.id,
        transaction_type=payload.transaction_type,
        title=payload.title.strip(),
        amount=quantize_money(payload.amount),
        payment_method=payload.payment_method.strip(),
        frequency=payload.frequency,
        next_occurrence=payload.next_occurrence,
        is_active=True,
        auto_create=payload.auto_create,
        notes=payload.notes.strip() if payload.notes else None,
    )
    db.add(rec)
    db.commit()
    db.refresh(rec)

    process_due_recurring_transactions(db, current_user.id)
    db.refresh(rec)
    return serialize_recurring(rec)


@app.put("/api/recurring-transactions/{recurring_id}", response_model=RecurringTransactionResponse, tags=["Recurring Transactions"])
def update_recurring_transaction(
    recurring_id: int,
    payload: RecurringTransactionUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rec = (
        db.query(RecurringTransaction)
        .filter(RecurringTransaction.id == recurring_id, RecurringTransaction.user_id == current_user.id)
        .first()
    )
    if not rec:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recurring transaction not found.")

    if payload.category_id is not None:
        cat = (
            db.query(Category)
            .filter(Category.id == payload.category_id, Category.user_id == current_user.id)
            .first()
        )
        if not cat or cat.category_type != rec.transaction_type:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid category for this recurring transaction.")
        rec.category_id = cat.id
    if payload.title is not None:
        rec.title = payload.title.strip()
    if payload.amount is not None:
        rec.amount = quantize_money(payload.amount)
    if payload.payment_method is not None:
        rec.payment_method = payload.payment_method.strip()
    if payload.frequency is not None:
        rec.frequency = payload.frequency
    if payload.next_occurrence is not None:
        rec.next_occurrence = payload.next_occurrence
    if payload.is_active is not None:
        rec.is_active = payload.is_active
    if payload.auto_create is not None:
        rec.auto_create = payload.auto_create
    if payload.notes is not None:
        rec.notes = payload.notes.strip() if payload.notes else None

    db.commit()
    db.refresh(rec)
    return serialize_recurring(rec)


@app.delete("/api/recurring-transactions/{recurring_id}", tags=["Recurring Transactions"])
def delete_recurring_transaction(
    recurring_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rec = (
        db.query(RecurringTransaction)
        .filter(RecurringTransaction.id == recurring_id, RecurringTransaction.user_id == current_user.id)
        .first()
    )
    if not rec:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recurring transaction not found.")

    db.delete(rec)
    db.commit()
    return {"message": "Recurring transaction deleted successfully.", "deleted_id": recurring_id}


@app.post("/api/recurring-transactions/process", tags=["Recurring Transactions"])
def trigger_recurring_processing(
    reference_date: Optional[date] = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    result = process_due_recurring_transactions(db, current_user.id, reference_date=reference_date)
    return result


# ==================== NOTIFICATIONS ENDPOINTS ====================

@app.get("/api/notifications", response_model=List[NotificationResponse], tags=["Notifications"])
def list_notifications(
    unread_only: bool = Query(default=False),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(Notification).filter(Notification.user_id == current_user.id)
    if unread_only:
        query = query.filter(Notification.is_read == False)
    return query.order_by(Notification.created_at.desc(), Notification.id.desc()).limit(50).all()


@app.patch("/api/notifications/{notification_id}/read", response_model=NotificationResponse, tags=["Notifications"])
def mark_notification_read(
    notification_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    notif = (
        db.query(Notification)
        .filter(Notification.id == notification_id, Notification.user_id == current_user.id)
        .first()
    )
    if not notif:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found.")
    notif.is_read = True
    db.commit()
    db.refresh(notif)
    return notif


@app.post("/api/notifications/read-all", tags=["Notifications"])
def mark_all_notifications_read(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    db.query(Notification).filter(
        Notification.user_id == current_user.id,
        Notification.is_read == False,
    ).update({Notification.is_read: True})
    db.commit()
    return {"message": "All notifications marked as read."}


# ==================== AI SPENDING INSIGHTS ENDPOINT ====================

@app.post("/api/insights/spending", tags=["AI Insights"])
def get_spending_insights(
    payload: InsightRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return generate_spending_insights(
        db,
        current_user,
        start_date=payload.start_date,
        end_date=payload.end_date,
        custom_question=payload.custom_question,
    )


# ==================== SPA FRONTEND STATIC SERVING ====================
import os
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

FRONTEND_DIST = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist")
)

if os.path.isdir(FRONTEND_DIST):
    assets_dir = os.path.join(FRONTEND_DIST, "assets")
    if os.path.isdir(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def serve_spa(full_path: str):
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="API endpoint not found")
        index_file = os.path.join(FRONTEND_DIST, "index.html")
        if os.path.isfile(index_file):
            return FileResponse(index_file)
        raise HTTPException(status_code=404, detail="Frontend build not found")

