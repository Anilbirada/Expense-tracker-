from datetime import date, datetime
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional, List, Literal
from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator, ConfigDict


def quantize_money(val: Decimal | float | int | str) -> Decimal:
    d = Decimal(str(val))
    return d.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


# ==================== AUTH & USER ====================

class UserRegisterRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(..., min_length=6, max_length=128)
    user_type: Literal["individual", "student", "professional"] = "individual"
    currency: str = Field(default="INR", max_length=10)

    @field_validator("name")
    @classmethod
    def clean_name(cls, v: str) -> str:
        cleaned = v.strip()
        if len(cleaned) < 2:
            raise ValueError("Name must be at least 2 characters long")
        return cleaned


class UserLoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1)


class UserProfileUpdateRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=120)
    user_type: Optional[Literal["individual", "student", "professional"]] = None
    currency: Optional[str] = Field(None, max_length=10)
    budget_warning_threshold: Optional[int] = Field(None, ge=10, le=99)
    budget_critical_threshold: Optional[int] = Field(None, ge=50, le=200)

    @model_validator(mode="after")
    def validate_thresholds(self):
        if (
            self.budget_warning_threshold is not None
            and self.budget_critical_threshold is not None
            and self.budget_warning_threshold >= self.budget_critical_threshold
        ):
            raise ValueError("Warning threshold must be lower than critical threshold")
        return self


class PasswordChangeRequest(BaseModel):
    current_password: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=6, max_length=128)


class UserResponse(BaseModel):
    id: int
    name: str
    email: str
    user_type: str
    currency: str
    budget_warning_threshold: int
    budget_critical_threshold: int
    is_demo: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


# ==================== CATEGORIES ====================

class CategoryCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    category_type: Literal["income", "expense"]
    icon: str = Field(default="Tag", max_length=50)
    color: str = Field(default="#2563eb", max_length=20)

    @field_validator("name")
    @classmethod
    def strip_name(cls, v: str) -> str:
        cleaned = v.strip()
        if not cleaned:
            raise ValueError("Category name cannot be empty")
        return cleaned


class CategoryUpdateRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    icon: Optional[str] = Field(None, max_length=50)
    color: Optional[str] = Field(None, max_length=20)
    is_archived: Optional[bool] = None


class CategoryResponse(BaseModel):
    id: int
    user_id: int
    name: str
    category_type: str
    icon: str
    color: str
    is_default: bool
    is_archived: bool
    transaction_count: int = 0
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ==================== TRANSACTIONS ====================

class TransactionCreateRequest(BaseModel):
    category_id: int
    transaction_type: Literal["income", "expense"]
    title: str = Field(..., min_length=1, max_length=200)
    amount: Decimal = Field(..., gt=Decimal("0.00"), le=Decimal("999999999.99"))
    transaction_date: date
    payment_method: str = Field(default="UPI", min_length=1, max_length=50)
    notes: Optional[str] = Field(default=None, max_length=1000)

    @field_validator("title")
    @classmethod
    def validate_title(cls, v: str) -> str:
        cleaned = v.strip()
        if not cleaned:
            raise ValueError("Transaction title cannot be empty")
        return cleaned

    @field_validator("amount")
    @classmethod
    def validate_amount(cls, v: Decimal) -> Decimal:
        q = quantize_money(v)
        if q <= Decimal("0.00"):
            raise ValueError("Amount must be greater than zero")
        return q


class TransactionUpdateRequest(BaseModel):
    category_id: Optional[int] = None
    transaction_type: Optional[Literal["income", "expense"]] = None
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    amount: Optional[Decimal] = Field(None, gt=Decimal("0.00"), le=Decimal("999999999.99"))
    transaction_date: Optional[date] = None
    payment_method: Optional[str] = Field(None, min_length=1, max_length=50)
    notes: Optional[str] = Field(None, max_length=1000)

    @field_validator("amount")
    @classmethod
    def validate_amount(cls, v: Optional[Decimal]) -> Optional[Decimal]:
        if v is None:
            return None
        q = quantize_money(v)
        if q <= Decimal("0.00"):
            raise ValueError("Amount must be greater than zero")
        return q


class TransactionResponse(BaseModel):
    id: int
    user_id: int
    category_id: int
    category_name: str = ""
    category_icon: str = "Tag"
    category_color: str = "#2563eb"
    transaction_type: str
    title: str
    amount: float
    transaction_date: date
    payment_method: str
    notes: Optional[str]
    recurring_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PaginatedTransactionsResponse(BaseModel):
    items: List[TransactionResponse]
    total: int
    page: int
    page_size: int
    total_pages: int
    period_income: float
    period_expense: float
    period_net: float


# ==================== BUDGETS ====================

class BudgetCreateRequest(BaseModel):
    category_id: int
    budget_amount: Decimal = Field(..., gt=Decimal("0.00"), le=Decimal("999999999.99"))
    period_start: date
    period_end: date
    warning_threshold: int = Field(default=75, ge=10, le=99)
    critical_threshold: int = Field(default=100, ge=50, le=200)

    @field_validator("budget_amount")
    @classmethod
    def validate_budget_amount(cls, v: Decimal) -> Decimal:
        return quantize_money(v)

    @model_validator(mode="after")
    def validate_dates_and_thresholds(self):
        if self.period_end < self.period_start:
            raise ValueError("period_end must be on or after period_start")
        if self.warning_threshold >= self.critical_threshold:
            raise ValueError("warning_threshold must be less than critical_threshold")
        return self


class BudgetUpdateRequest(BaseModel):
    budget_amount: Optional[Decimal] = Field(None, gt=Decimal("0.00"), le=Decimal("999999999.99"))
    period_start: Optional[date] = None
    period_end: Optional[date] = None
    warning_threshold: Optional[int] = Field(None, ge=10, le=99)
    critical_threshold: Optional[int] = Field(None, ge=50, le=200)

    @field_validator("budget_amount")
    @classmethod
    def validate_budget_amount(cls, v: Optional[Decimal]) -> Optional[Decimal]:
        return quantize_money(v) if v is not None else None


class BudgetResponse(BaseModel):
    id: int
    user_id: int
    category_id: int
    category_name: str
    category_icon: str
    category_color: str
    budget_amount: float
    spent_amount: float
    remaining_amount: float
    percentage_used: float
    status: Literal["Normal", "Approaching Limit", "Exceeded"]
    period_start: date
    period_end: date
    warning_threshold: int
    critical_threshold: int
    created_at: datetime


# ==================== SAVINGS GOALS ====================

class SavingsGoalCreateRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    target_amount: Decimal = Field(..., gt=Decimal("0.00"), le=Decimal("999999999.99"))
    current_amount: Decimal = Field(default=Decimal("0.00"), ge=Decimal("0.00"), le=Decimal("999999999.99"))
    target_date: Optional[date] = None
    notes: Optional[str] = Field(None, max_length=1000)

    @field_validator("target_amount", "current_amount")
    @classmethod
    def quantize_fields(cls, v: Decimal) -> Decimal:
        return quantize_money(v)


class SavingsGoalUpdateRequest(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    target_amount: Optional[Decimal] = Field(None, gt=Decimal("0.00"), le=Decimal("999999999.99"))
    current_amount: Optional[Decimal] = Field(None, ge=Decimal("0.00"), le=Decimal("999999999.99"))
    target_date: Optional[date] = None
    status: Optional[Literal["active", "completed", "paused"]] = None
    notes: Optional[str] = Field(None, max_length=1000)


class SavingsGoalContributionRequest(BaseModel):
    amount: Decimal = Field(..., gt=Decimal("0.00"), le=Decimal("999999999.99"))


class SavingsGoalResponse(BaseModel):
    id: int
    user_id: int
    title: str
    target_amount: float
    current_amount: float
    remaining_amount: float
    percentage_completed: float
    target_date: Optional[date]
    status: str
    notes: Optional[str]
    created_at: datetime


# ==================== RECURRING TRANSACTIONS ====================

class RecurringTransactionCreateRequest(BaseModel):
    category_id: int
    transaction_type: Literal["income", "expense"]
    title: str = Field(..., min_length=1, max_length=200)
    amount: Decimal = Field(..., gt=Decimal("0.00"), le=Decimal("999999999.99"))
    payment_method: str = Field(default="Bank Transfer", max_length=50)
    frequency: Literal["daily", "weekly", "monthly", "yearly"]
    next_occurrence: date
    auto_create: bool = True
    notes: Optional[str] = Field(None, max_length=1000)

    @field_validator("amount")
    @classmethod
    def validate_amount(cls, v: Decimal) -> Decimal:
        return quantize_money(v)


class RecurringTransactionUpdateRequest(BaseModel):
    category_id: Optional[int] = None
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    amount: Optional[Decimal] = Field(None, gt=Decimal("0.00"), le=Decimal("999999999.99"))
    payment_method: Optional[str] = Field(None, max_length=50)
    frequency: Optional[Literal["daily", "weekly", "monthly", "yearly"]] = None
    next_occurrence: Optional[date] = None
    is_active: Optional[bool] = None
    auto_create: Optional[bool] = None
    notes: Optional[str] = Field(None, max_length=1000)


class RecurringTransactionResponse(BaseModel):
    id: int
    user_id: int
    category_id: int
    category_name: str
    category_icon: str
    category_color: str
    transaction_type: str
    title: str
    amount: float
    payment_method: str
    frequency: str
    next_occurrence: date
    last_processed_date: Optional[date]
    is_active: bool
    auto_create: bool
    days_until_due: int
    notes: Optional[str]
    created_at: datetime


# ==================== NOTIFICATIONS & INSIGHTS ====================

class NotificationResponse(BaseModel):
    id: int
    user_id: int
    title: str
    message: str
    notification_type: str
    is_read: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class InsightRequest(BaseModel):
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    custom_question: Optional[str] = Field(None, max_length=300)
