# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Frontend (from `frontend/`)
```bash
pnpm dev        # Dev server on port 5173
pnpm build      # Production build
pnpm lint       # ESLint check
pnpm preview    # Preview production build locally
```

### Backend (from `backend/`)
```bash
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

The Vite dev server proxies `/api` → `http://localhost:8000`, so both services must run together for local development.

## Architecture

### Stack
- **Frontend**: React 19, Vite, Tailwind CSS, Recharts, React Router 7
- **Backend**: FastAPI, SQLModel, PostgreSQL (Neon), Uvicorn
- **Package manager**: pnpm (frontend), pip (backend)

### Backend (`backend/main.py`)
All backend logic lives in a single `main.py` (~655 lines). It defines:
- **SQLModel ORM models**: `Account`, `Transaction`, `Transfer`, `Investment`, `AppStore`
- **25 REST endpoints** for CRUD + aggregation (summaries, balances, monthly metrics, portfolio stats)
- **AppStore** — a key-value table for cross-device persistence of frontend state (replaces localStorage)
- NullPool connection pooling for stateless/serverless compatibility with Neon PostgreSQL

### Frontend (`frontend/src/`)
- **`App.jsx`** — root router and layout (nav, header, footer)
- **`AccountContext.jsx`** — global React Context for selected account and streamer mode toggle
- **`pages/`** — 12 page components; each page fetches its own data directly via `fetch()`
- **`api/store.js` + `hooks/useStore.js`** — thin wrapper for persisting UI state to the AppStore backend endpoint
- **`constants.js`** — exports `API_URL` from `VITE_API_URL` env var (default: `http://localhost:8000`)

### Data flow
Pages call FastAPI endpoints → SQLModel queries PostgreSQL → Recharts renders aggregated responses. No global state management library; state lives in local component state + AccountContext.

### Key domain concepts
- **Accounts** have an `initial_balance` (used to compute historical balances from transaction history)
- **Investments** track `cost_basis`, `current_price`, `shares` — PnL is computed server-side in `/investments/summary`
- **Expense categories**: Housing, Food & Groceries, Transport, Health, Entertainment, Shopping, Utilities, Subscriptions, Travel, Music, Fuel, Bizum, Gambling, Common, Other
- **Income categories**: Salary, Investment, Gift, Refund, Bizum, Gambling, Common, Other
- **Investment types**: Fund, ETF, Stock, Pension, Crypto, Other

### Environment variables
**Backend** (`backend/.env`):
```
DATABASE_URL=postgresql://...
FRONTEND_URL=http://localhost:5173
APP_USERNAME=admin          # required for auth
APP_PASSWORD=changeme       # required for auth
SECRET_KEY=...              # JWT signing key (required in production)
```

**Frontend** (`frontend/.env.local`):
```
VITE_API_URL=https://rr-finance-api.onrender.com
```

### Deployment
Defined in `render.yaml` — backend as a Python web service, frontend as static hosting, database via Neon PostgreSQL.

### Styling conventions
Dark theme with custom Tailwind palette: emerald `#00c896`, blue `#3d9eff`, gold `#f0b429`, red `#ff5c5c`, background `#080f1a`. All UI is custom Tailwind — no component library.
