import os
import json
import contextlib
from contextlib import asynccontextmanager
from datetime import date, datetime
from typing import Any, Optional
from collections import defaultdict

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.pool import NullPool
from sqlmodel import Field, Session, SQLModel, create_engine, select
from dateutil.relativedelta import relativedelta

load_dotenv()

# ---------------------------------------------------------------------------
# Database setup
# ---------------------------------------------------------------------------

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL environment variable is not set")

engine = create_engine(DATABASE_URL, poolclass=NullPool)


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

EXPENSE_CATEGORIES = [
    "Housing", "Food & Groceries", "Transport", "Health",
    "Entertainment", "Shopping", "Utilities", "Subscriptions", "Travel", "Music", "Fuel", "Bizum", "Gambling", "Common", "Other",
]
INCOME_CATEGORIES = ["Salary", "Investment", "Gift", "Refund", "Bizum", "Gambling", "Common", "Other"]
INVESTMENT_TYPES = ["Fund", "ETF", "Stock", "Pension", "Crypto", "Other"]

DEFAULT_ACCOUNTS = [
    {"id": 1, "name": "Personal", "icon": "👤", "color": "#22c55e"},
    {"id": 3, "name": "Savings",  "icon": "🏦", "color": "#f59e0b"},
]


class Account(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    icon: str = "💳"
    color: str = "#22c55e"
    initial_balance: float = Field(default=0.0)


class Transaction(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    date: date
    description: str
    amount: float
    type: str  # "income" | "expense"
    category: str
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    account_id: int = Field(default=1)


class Transfer(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    from_account_id: int
    to_account_id: int
    amount: float
    date: date
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Investment(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    date: date                           # Date of purchase
    name: str                            # Asset name (e.g. "Vanguard Global Stock Index")
    ticker: Optional[str] = None         # Ticker or ISIN
    type: str = "Fund"                   # Fund | ETF | Stock | Pension | Crypto | Other
    units: float                         # Number of units / shares
    purchase_price: float                # Price per unit at purchase (€)
    current_price: float                 # Latest known price per unit (€), updated manually
    broker: str = "MyInvestor"
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class AppStore(SQLModel, table=True):
    __tablename__ = "app_store"
    key: str = Field(primary_key=True)
    value: Optional[str] = None  # JSON-encoded value


def create_db():
    # --- Phase 1: Schema migrations (before create_all) ---
    with engine.connect() as conn:
        # Add account_id to transaction table if missing
        with contextlib.suppress(Exception):
            conn.execute(text('ALTER TABLE "transaction" ADD COLUMN account_id INTEGER NOT NULL DEFAULT 1'))
            conn.commit()

        # Add initial_balance to account table if missing
        with contextlib.suppress(Exception):
            conn.execute(text("ALTER TABLE account ADD COLUMN initial_balance REAL NOT NULL DEFAULT 0.0"))
            conn.commit()

        # Remove Common account (id=2): migrate its data to Personal (id=1)
        with contextlib.suppress(Exception):
            conn.execute(text('UPDATE "transaction" SET account_id = 1 WHERE account_id = 2'))
            conn.execute(text("DELETE FROM transfer WHERE from_account_id = 2 OR to_account_id = 2"))
            conn.execute(text("DELETE FROM account WHERE id = 2"))
            conn.commit()

    # --- Phase 2: Create all tables ---
    SQLModel.metadata.create_all(engine)

    # --- Phase 3: Seed default accounts ---
    with Session(engine) as session:
        if not session.exec(select(Account)).first():
            for acc_data in DEFAULT_ACCOUNTS:
                session.add(Account(**acc_data))
            session.commit()


# ---------------------------------------------------------------------------
# Pydantic request/response schemas
# ---------------------------------------------------------------------------

class AccountUpdate(BaseModel):
    initial_balance: Optional[float] = None


class TransactionCreate(BaseModel):
    date: date
    description: str
    amount: float
    type: str
    category: str
    notes: Optional[str] = None
    account_id: int = 1


class TransactionUpdate(BaseModel):
    date: Optional[date] = None
    description: Optional[str] = None
    amount: Optional[float] = None
    type: Optional[str] = None
    category: Optional[str] = None
    notes: Optional[str] = None
    account_id: Optional[int] = None


class TransferCreate(BaseModel):
    from_account_id: int
    to_account_id: int
    amount: float
    date: date
    notes: Optional[str] = None


class InvestmentCreate(BaseModel):
    date: date
    name: str
    ticker: Optional[str] = None
    type: str = "Fund"
    units: float
    purchase_price: float
    current_price: float
    broker: str = "MyInvestor"
    notes: Optional[str] = None


class InvestmentUpdate(BaseModel):
    date: Optional[str] = None  # accepts "YYYY-MM-DD" strings, converted in endpoint
    name: Optional[str] = None
    ticker: Optional[str] = None
    type: Optional[str] = None
    units: Optional[float] = None
    purchase_price: Optional[float] = None
    current_price: Optional[float] = None
    broker: Optional[str] = None
    notes: Optional[str] = None


class StoreBody(BaseModel):
    value: Any


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    create_db()
    yield


app = FastAPI(title="RR Finance API", version="0.1.0", lifespan=lifespan)

origins = [
    os.getenv("FRONTEND_URL", "http://localhost:5173"),
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Meta
# ---------------------------------------------------------------------------

@app.get("/health")
def health_check():
    return {"status": "ok", "service": "rr-finance"}


@app.get("/categories")
def get_categories():
    return {"income": INCOME_CATEGORIES, "expense": EXPENSE_CATEGORIES}


@app.get("/investment-types")
def get_investment_types():
    return INVESTMENT_TYPES


# ---------------------------------------------------------------------------
# Accounts
# ---------------------------------------------------------------------------

@app.get("/accounts", response_model=list[Account])
def list_accounts():
    with Session(engine) as session:
        return session.exec(select(Account)).all()


@app.patch("/accounts/{account_id}", response_model=Account)
def update_account(account_id: int, data: AccountUpdate):
    with Session(engine) as session:
        account = session.get(Account, account_id)
        if not account:
            raise HTTPException(status_code=404, detail="Account not found")
        for field, value in data.model_dump(exclude_none=True).items():
            setattr(account, field, value)
        session.add(account)
        session.commit()
        session.refresh(account)
        return account


# ---------------------------------------------------------------------------
# Transactions
# ---------------------------------------------------------------------------

@app.post("/transactions", response_model=Transaction)
def create_transaction(data: TransactionCreate):
    with Session(engine) as session:
        tx = Transaction(**data.model_dump())
        session.add(tx)
        session.commit()
        session.refresh(tx)
        return tx


@app.get("/transactions", response_model=list[Transaction])
def list_transactions(
    year: Optional[int] = Query(None),
    month: Optional[int] = Query(None),
    type: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    account_id: Optional[int] = Query(None),
):
    with Session(engine) as session:
        results = session.exec(select(Transaction)).all()

        if account_id is not None:
            results = [t for t in results if t.account_id == account_id]
        if year is not None:
            results = [t for t in results if t.date.year == year]
        if month is not None:
            results = [t for t in results if t.date.month == month]
        if type is not None:
            results = [t for t in results if t.type == type]
        if category is not None:
            results = [t for t in results if t.category == category]
        if search:
            q = search.lower()
            results = [t for t in results if q in t.description.lower()]

        return sorted(results, key=lambda t: t.date, reverse=True)


@app.patch("/transactions/{tx_id}", response_model=Transaction)
def update_transaction(tx_id: int, data: TransactionUpdate):
    with Session(engine) as session:
        tx = session.get(Transaction, tx_id)
        if not tx:
            raise HTTPException(status_code=404, detail="Transaction not found")
        for field, value in data.model_dump(exclude_none=True).items():
            setattr(tx, field, value)
        session.add(tx)
        session.commit()
        session.refresh(tx)
        return tx


@app.delete("/transactions/{tx_id}")
def delete_transaction(tx_id: int):
    with Session(engine) as session:
        tx = session.get(Transaction, tx_id)
        if not tx:
            raise HTTPException(status_code=404, detail="Transaction not found")
        session.delete(tx)
        session.commit()
        return {"ok": True}


# ---------------------------------------------------------------------------
# Transfers
# ---------------------------------------------------------------------------

@app.post("/transfers", response_model=Transfer)
def create_transfer(data: TransferCreate):
    with Session(engine) as session:
        transfer = Transfer(**data.model_dump())
        session.add(transfer)
        session.commit()
        session.refresh(transfer)
        return transfer


@app.get("/transfers", response_model=list[Transfer])
def list_transfers(account_id: Optional[int] = Query(None)):
    with Session(engine) as session:
        results = session.exec(select(Transfer)).all()
        if account_id is not None:
            results = [t for t in results if t.from_account_id == account_id or t.to_account_id == account_id]
        return sorted(results, key=lambda t: t.date, reverse=True)


@app.delete("/transfers/{transfer_id}")
def delete_transfer(transfer_id: int):
    with Session(engine) as session:
        transfer = session.get(Transfer, transfer_id)
        if not transfer:
            raise HTTPException(status_code=404, detail="Transfer not found")
        session.delete(transfer)
        session.commit()
        return {"ok": True}


# ---------------------------------------------------------------------------
# Metrics
# ---------------------------------------------------------------------------

@app.get("/summary")
def get_summary(
    year: int = Query(...),
    month: int = Query(...),
    account_id: Optional[int] = Query(None),
):
    with Session(engine) as session:
        all_txs = session.exec(select(Transaction)).all()
        if account_id is not None:
            all_txs = [t for t in all_txs if t.account_id == account_id]

        # Monthly stats
        txs = [t for t in all_txs if t.date.year == year and t.date.month == month]
        income = sum(t.amount for t in txs if t.type == "income")
        expenses = sum(t.amount for t in txs if t.type == "expense")

        by_category: dict[str, float] = defaultdict(float)
        for t in txs:
            if t.type == "expense":
                by_category[t.category] += t.amount

        # Account balance = initial_balance + all-time income - all-time expenses
        initial_balance = 0.0
        if account_id is not None:
            account = session.get(Account, account_id)
            if account:
                initial_balance = account.initial_balance
        all_income = sum(t.amount for t in all_txs if t.type == "income")
        all_expenses = sum(t.amount for t in all_txs if t.type == "expense")
        account_balance = initial_balance + all_income - all_expenses

        return {
            "income": income,
            "expenses": expenses,
            "balance": income - expenses,
            "account_balance": account_balance,
            "by_category": [
                {"category": k, "total": v}
                for k, v in sorted(by_category.items(), key=lambda x: -x[1])
            ],
        }


@app.get("/monthly")
def get_monthly(
    months: int = Query(6),
    account_id: Optional[int] = Query(None),
    category: Optional[str] = Query(None),
):
    with Session(engine) as session:
        txs = session.exec(select(Transaction)).all()

    if account_id is not None:
        txs = [t for t in txs if t.account_id == account_id]
    if category is not None:
        txs = [t for t in txs if t.category == category]

    today = date.today()
    if months == 0:
        if not txs:
            return []
        earliest = min(t.date for t in txs)
        months = (today.year - earliest.year) * 12 + (today.month - earliest.month) + 1

    result = []
    for i in range(months - 1, -1, -1):
        ref = today - relativedelta(months=i)
        y, m = ref.year, ref.month
        period_txs = [t for t in txs if t.date.year == y and t.date.month == m]
        income = sum(t.amount for t in period_txs if t.type == "income")
        expenses = sum(t.amount for t in period_txs if t.type == "expense")
        result.append({
            "year": y,
            "month": m,
            "label": ref.strftime("%b %Y"),
            "income": income,
            "expenses": expenses,
            "balance": income - expenses,
        })
    return result


@app.get("/balances")
def get_balances():
    with Session(engine) as session:
        accounts = session.exec(select(Account)).all()
        all_txs = session.exec(select(Transaction)).all()
        all_transfers = session.exec(select(Transfer)).all()

    result = []
    for acc in accounts:
        acc_txs = [t for t in all_txs if t.account_id == acc.id]
        income = sum(t.amount for t in acc_txs if t.type == "income")
        expenses = sum(t.amount for t in acc_txs if t.type == "expense")
        transfers_out = sum(t.amount for t in all_transfers if t.from_account_id == acc.id)
        transfers_in = sum(t.amount for t in all_transfers if t.to_account_id == acc.id)
        result.append({
            "id": acc.id,
            "name": acc.name,
            "icon": acc.icon,
            "color": acc.color,
            "balance": acc.initial_balance + income - expenses + transfers_in - transfers_out,
        })
    return result


@app.get("/available-months")
def get_available_months(account_id: Optional[int] = Query(None)):
    with Session(engine) as session:
        txs = session.exec(select(Transaction)).all()
    if account_id is not None:
        txs = [t for t in txs if t.account_id == account_id]
    seen = sorted({(t.date.year, t.date.month) for t in txs})
    return [
        {"year": y, "month": m, "label": date(y, m, 1).strftime("%B %Y")}
        for y, m in seen
    ]


@app.get("/balance-history")
def get_balance_history(months: int = Query(6)):
    with Session(engine) as session:
        accounts = session.exec(select(Account)).all()
        all_txs = session.exec(select(Transaction)).all()
        all_transfers = session.exec(select(Transfer)).all()

    today = date.today()
    if months == 0:
        if not all_txs:
            return {"accounts": [{"id": a.id, "name": a.name, "color": a.color} for a in accounts], "history": []}
        earliest = min(t.date for t in all_txs)
        months = (today.year - earliest.year) * 12 + (today.month - earliest.month) + 1

    history = []
    for i in range(months - 1, -1, -1):
        ref = today - relativedelta(months=i)
        y, m = ref.year, ref.month
        cutoff = y * 12 + m
        point = {"label": ref.strftime("%b %Y"), "year": y, "month": m, "Total": 0.0}
        for acc in accounts:
            acc_txs = [t for t in all_txs if t.account_id == acc.id]
            cum = [t for t in acc_txs if t.date.year * 12 + t.date.month <= cutoff]
            cum_out = sum(t.amount for t in all_transfers
                         if t.from_account_id == acc.id and t.date.year * 12 + t.date.month <= cutoff)
            cum_in = sum(t.amount for t in all_transfers
                        if t.to_account_id == acc.id and t.date.year * 12 + t.date.month <= cutoff)
            bal = acc.initial_balance \
                + sum(t.amount for t in cum if t.type == "income") \
                - sum(t.amount for t in cum if t.type == "expense") \
                + cum_in - cum_out
            point[acc.name] = bal
            point["Total"] += bal
        history.append(point)

    return {
        "accounts": [{"id": a.id, "name": a.name, "color": a.color} for a in accounts],
        "history": history,
    }


# ---------------------------------------------------------------------------
# Investments
# ---------------------------------------------------------------------------

@app.get("/investments", response_model=list[Investment])
def list_investments():
    with Session(engine) as session:
        return session.exec(select(Investment).order_by(Investment.date.desc())).all()


@app.post("/investments", response_model=Investment)
def create_investment(data: InvestmentCreate):
    with Session(engine) as session:
        inv = Investment(**data.model_dump())
        session.add(inv)
        session.commit()
        session.refresh(inv)
        return inv


@app.patch("/investments/{inv_id}", response_model=Investment)
def update_investment(inv_id: int, data: InvestmentUpdate):
    with Session(engine) as session:
        inv = session.get(Investment, inv_id)
        if not inv:
            raise HTTPException(status_code=404, detail="Investment not found")
        updates = data.model_dump(exclude_none=True)
        if 'date' in updates:
            updates['date'] = date.fromisoformat(updates['date'])
        for field, value in updates.items():
            setattr(inv, field, value)
        session.add(inv)
        session.commit()
        session.refresh(inv)
        return inv


@app.delete("/investments/{inv_id}")
def delete_investment(inv_id: int):
    with Session(engine) as session:
        inv = session.get(Investment, inv_id)
        if not inv:
            raise HTTPException(status_code=404, detail="Investment not found")
        session.delete(inv)
        session.commit()
        return {"ok": True}


@app.get("/investments/summary")
def get_investments_summary():
    with Session(engine) as session:
        investments = session.exec(select(Investment)).all()

    total_invested = sum(i.units * i.purchase_price for i in investments)
    current_value = sum(i.units * i.current_price for i in investments)
    total_pnl = current_value - total_invested
    return_pct = (total_pnl / total_invested * 100) if total_invested > 0 else 0.0

    by_type: dict[str, dict] = defaultdict(lambda: {"invested": 0.0, "current_value": 0.0})
    for i in investments:
        inv_cost = i.units * i.purchase_price
        inv_value = i.units * i.current_price
        by_type[i.type]["invested"] += inv_cost
        by_type[i.type]["current_value"] += inv_value

    # Monthly invested amounts (for timeline chart)
    monthly: dict[str, float] = defaultdict(float)
    for i in investments:
        key = i.date.strftime("%b %Y")
        monthly[key] += i.units * i.purchase_price

    return {
        "total_invested": total_invested,
        "current_value": current_value,
        "total_pnl": total_pnl,
        "return_pct": return_pct,
        "count": len(investments),
        "by_type": [
            {
                "type": t,
                "invested": v["invested"],
                "current_value": v["current_value"],
                "pnl": v["current_value"] - v["invested"],
            }
            for t, v in by_type.items()
        ],
        "monthly_invested": [
            {"label": k, "invested": v}
            for k, v in monthly.items()
        ],
    }


# ---------------------------------------------------------------------------
# Key-value store (replaces browser localStorage for cross-device persistence)
# ---------------------------------------------------------------------------

@app.get("/store/{key}")
def get_store_value(key: str):
    with Session(engine) as session:
        row = session.get(AppStore, key)
        if not row or row.value is None:
            raise HTTPException(status_code=404, detail="Key not found")
        try:
            return {"value": json.loads(row.value)}
        except Exception:
            return {"value": row.value}


@app.put("/store/{key}")
def put_store_value(key: str, body: StoreBody):
    with Session(engine) as session:
        row = session.get(AppStore, key)
        if not row:
            row = AppStore(key=key)
        row.value = json.dumps(body.value)
        session.add(row)
        session.commit()
        return {"ok": True}


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
