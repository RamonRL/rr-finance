import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import HomePage from './pages/HomePage';
import TransactionsPage from './pages/TransactionsPage';
import AnalyticsPage from './pages/AnalyticsPage';
import SavingsPage from './pages/SavingsPage';
import InvestmentsPage from './pages/InvestmentsPage';
import AdminPage from './pages/AdminPage';
import CashflowPage from './pages/CashflowPage';
import LoginPage from './pages/LoginPage';
import AnimatedBackground from './AnimatedBackground';
import { AccountProvider, useAccount } from './AccountContext';

// ─────────────────────────────────────────────────────────────────────────────
// Icons (inline SVG, stroke-based — match the finance-terminal aesthetic)
// ─────────────────────────────────────────────────────────────────────────────

const Icon = ({ children, className = '' }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    {children}
  </svg>
);

const IconDashboard = () => (
  <Icon>
    <rect x="3" y="3" width="7" height="9" />
    <rect x="14" y="3" width="7" height="5" />
    <rect x="14" y="12" width="7" height="9" />
    <rect x="3" y="16" width="7" height="5" />
  </Icon>
);
const IconTransactions = () => (
  <Icon>
    <polyline points="17 1 21 5 17 9" />
    <path d="M3 11V9a4 4 0 0 1 4-4h14" />
    <polyline points="7 23 3 19 7 15" />
    <path d="M21 13v2a4 4 0 0 1-4 4H3" />
  </Icon>
);
const IconSavings = () => (
  <Icon>
    <path d="M3 10h18" />
    <path d="M5 10V6l7-3 7 3v4" />
    <path d="M5 10v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8" />
    <path d="M9 14h2" />
  </Icon>
);
const IconInvestments = () => (
  <Icon>
    <polyline points="3 17 9 11 13 15 21 7" />
    <polyline points="14 7 21 7 21 14" />
  </Icon>
);
const IconCashflow = () => (
  <Icon>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v10" />
    <path d="M15 9.5a3 3 0 0 0-6 .5c0 1.2 1 2 2.5 2.3C13 12.6 15 13 15 14.5c0 1.5-1.5 2.5-3 2.5a3 3 0 0 1-3-2" />
  </Icon>
);
const IconAnalytics = () => (
  <Icon>
    <path d="M3 3v18h18" />
    <rect x="7" y="13" width="3" height="5" />
    <rect x="12" y="9" width="3" height="9" />
    <rect x="17" y="5" width="3" height="13" />
  </Icon>
);
const IconAdmin = () => (
  <Icon>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </Icon>
);
const IconLogout = () => (
  <Icon>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </Icon>
);
const IconMenu = () => (
  <Icon>
    <line x1="3" y1="6" x2="21" y2="6" />
    <line x1="3" y1="12" x2="21" y2="12" />
    <line x1="3" y1="18" x2="21" y2="18" />
  </Icon>
);
const IconEye = ({ off }) => (
  <Icon>
    {off ? (
      <>
        <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a19.1 19.1 0 0 1 5.06-5.94" />
        <path d="M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a19.2 19.2 0 0 1-2.16 3.19" />
        <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
        <line x1="1" y1="1" x2="23" y2="23" />
      </>
    ) : (
      <>
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" />
        <circle cx="12" cy="12" r="3" />
      </>
    )}
  </Icon>
);

// ─────────────────────────────────────────────────────────────────────────────
// Navigation
// ─────────────────────────────────────────────────────────────────────────────

const NAV_LINKS = [
  { to: '/', label: 'Dashboard', icon: IconDashboard },
  { to: '/transactions', label: 'Transactions', icon: IconTransactions },
  { to: '/savings', label: 'Savings', icon: IconSavings },
  { to: '/investments', label: 'Investments', icon: IconInvestments },
  { to: '/cashflow', label: 'Cashflow', icon: IconCashflow },
  { to: '/analytics', label: 'Analytics', icon: IconAnalytics },
];

function isActive(pathname, to) {
  return to === '/' ? pathname === '/' : pathname.startsWith(to);
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared action buttons
// ─────────────────────────────────────────────────────────────────────────────

function StreamerToggle({ compact = false }) {
  const { streamerMode, toggleStreamerMode } = useAccount();
  return (
    <button
      onClick={toggleStreamerMode}
      title={streamerMode ? 'Disable Streamer Mode' : 'Enable Streamer Mode'}
      className={`flex items-center ${compact ? 'justify-center w-9 h-9' : 'gap-2 px-3 py-2 w-full'} rounded-lg text-sm font-medium border transition-colors ${
        streamerMode
          ? 'border-accent-gold/40 text-accent-gold bg-accent-gold/10'
          : 'border-white/10 text-secondary hover:text-white hover:border-white/20 hover:bg-white/[0.04]'
      }`}
    >
      <IconEye off={streamerMode} />
      {!compact && <span>Streamer</span>}
    </button>
  );
}

function LogoutAction({ onLogout, compact = false }) {
  return (
    <button
      onClick={onLogout}
      title="Sign out"
      className={`flex items-center ${compact ? 'justify-center w-9 h-9' : 'gap-2 px-3 py-2 w-full'} rounded-lg text-sm font-medium border border-white/10 text-secondary hover:text-accent-red hover:border-accent-red/40 hover:bg-accent-red/5 transition-colors`}
    >
      <IconLogout />
      {!compact && <span>Logout</span>}
    </button>
  );
}

function AdminLink({ pathname, compact = false }) {
  const active = pathname === '/admin';
  return (
    <Link
      to="/admin"
      title="Admin"
      className={`flex items-center ${compact ? 'justify-center w-9 h-9' : 'gap-2 px-3 py-2 w-full'} rounded-lg text-sm font-medium border transition-colors ${
        active
          ? 'border-accent-green/40 text-accent-green bg-accent-green/10'
          : 'border-white/10 text-secondary hover:text-white hover:border-white/20 hover:bg-white/[0.04]'
      }`}
    >
      <IconAdmin />
      {!compact && <span>Admin</span>}
    </Link>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sidebar
// ─────────────────────────────────────────────────────────────────────────────

function Sidebar({ onLogout, onNavigate, className = '' }) {
  const location = useLocation();

  return (
    <aside
      className={`w-sidebar shrink-0 flex-col bg-surface/70 backdrop-blur-xl border-r border-white/[0.06] ${className}`}
    >
      {/* Brand */}
      <div className="px-5 pt-6 pb-5 border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          <img src="/newlogo.png" alt="RR Finance" className="h-9 w-auto object-contain" />
          <p className="text-[10px] uppercase tracking-[0.18em] text-muted font-medium">
            Trading Desk
          </p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto custom-scrollbar">
        <p className="label-eyebrow px-3 mb-2">Navigate</p>
        <ul className="flex flex-col gap-0.5">
          {NAV_LINKS.map(({ to, label, icon: Icon }) => {
            const active = isActive(location.pathname, to);
            return (
              <li key={to}>
                <Link
                  to={to}
                  onClick={onNavigate}
                  className={`group flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    active
                      ? 'bg-accent-green/12 text-accent-green border-l-2 border-accent-green -ml-0 pl-[10px]'
                      : 'text-secondary hover:text-white hover:bg-white/[0.04]'
                  }`}
                >
                  <span className={active ? 'text-accent-green' : 'text-muted group-hover:text-secondary'}>
                    <Icon />
                  </span>
                  <span>{label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer actions */}
      <div className="px-3 pb-4 pt-3 border-t border-white/[0.06] flex flex-col gap-2">
        <StreamerToggle />
        <AdminLink pathname={location.pathname} />
        <LogoutAction onLogout={onLogout} />
        <p className="text-[9px] uppercase tracking-[0.2em] text-muted font-bold text-center pt-2">
          RR Finance &copy; 2026
        </p>
      </div>
    </aside>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Top bar
//   - Mobile: hamburger + compact brand + action icons
//   - Desktop: ticker-like breadcrumb left, action icons right
// ─────────────────────────────────────────────────────────────────────────────

function TopBar({ onOpenDrawer, onLogout }) {
  const location = useLocation();
  const active = NAV_LINKS.find((l) => isActive(location.pathname, l.to));
  const title = active?.label ?? (location.pathname === '/admin' ? 'Admin' : '');

  return (
    <header className="flex items-center justify-between gap-3 px-4 md:px-6 h-14 md:h-16 border-b border-white/[0.06] bg-overlay/40 backdrop-blur-md">
      {/* Left: mobile hamburger + title */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={onOpenDrawer}
          className="md:hidden flex items-center justify-center w-9 h-9 rounded-lg border border-white/10 text-secondary hover:text-white hover:border-white/20"
          aria-label="Open navigation"
        >
          <IconMenu />
        </button>
        <div className="md:hidden flex items-center gap-2 min-w-0">
          <img src="/newlogo.png" alt="RR Finance" className="h-6 w-auto object-contain" />
        </div>

        {/* Desktop: current section eyebrow */}
        <div className="hidden md:flex items-center gap-3">
          <span className="h-2 w-2 rounded-full bg-accent-green animate-pulse" />
          <span className="label-eyebrow">Live</span>
          <span className="text-muted">/</span>
          <span className="text-sm font-medium text-white">{title}</span>
        </div>
      </div>

      {/* Right: quick actions (mobile only — desktop has them in sidebar) */}
      <div className="flex items-center gap-2 md:hidden">
        <StreamerToggle compact />
        <AdminLink pathname={location.pathname} compact />
        <LogoutAction onLogout={onLogout} compact />
      </div>
    </header>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Layout
// ─────────────────────────────────────────────────────────────────────────────

function Layout({ children, onLogout }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();
  const { streamerMode } = useAccount();

  // Close drawer on route change
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  // Lock body scroll when drawer open
  useEffect(() => {
    if (drawerOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [drawerOpen]);

  return (
    <>
      <AnimatedBackground />
      <div
        className={`min-h-screen md:h-screen flex relative z-[1]${streamerMode ? ' streamer' : ''}`}
      >
        {/* Sidebar — desktop */}
        <Sidebar
          className="hidden md:flex"
          onLogout={onLogout}
        />

        {/* Drawer — mobile */}
        {drawerOpen && (
          <>
            <div
              className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40 md:hidden"
              onClick={() => setDrawerOpen(false)}
              aria-hidden
            />
            <div className="fixed inset-y-0 left-0 z-50 flex md:hidden animate-[slideIn_0.18s_ease-out]">
              <Sidebar
                className="flex shadow-2xl shadow-black/60"
                onLogout={onLogout}
                onNavigate={() => setDrawerOpen(false)}
              />
            </div>
          </>
        )}

        {/* Main column */}
        <div className="flex-1 flex flex-col min-w-0 md:h-screen md:overflow-hidden">
          <TopBar
            onOpenDrawer={() => setDrawerOpen(true)}
            onLogout={onLogout}
          />
          <main className="flex-1 min-h-0 md:overflow-hidden">{children}</main>
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// App
// ─────────────────────────────────────────────────────────────────────────────

function AppContent({ onLogout }) {
  return (
    <Layout onLogout={onLogout}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/transactions" element={<TransactionsPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/savings" element={<SavingsPage />} />
        <Route path="/investments/*" element={<InvestmentsPage />} />
        <Route path="/cashflow/*" element={<CashflowPage />} />
        <Route path="/admin" element={<AdminPage />} />
      </Routes>
    </Layout>
  );
}

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(
    () => Boolean(localStorage.getItem('authToken'))
  );

  useEffect(() => {
    const handler = () => setIsAuthenticated(false);
    window.addEventListener('auth:logout', handler);
    return () => window.removeEventListener('auth:logout', handler);
  }, []);

  function handleLogin() {
    setIsAuthenticated(true);
  }

  function handleLogout() {
    localStorage.removeItem('authToken');
    setIsAuthenticated(false);
  }

  if (!isAuthenticated) {
    return <LoginPage onLogin={handleLogin} />;
  }

  return (
    <Router>
      <AccountProvider>
        <AppContent onLogout={handleLogout} />
      </AccountProvider>
    </Router>
  );
}

export default App;
