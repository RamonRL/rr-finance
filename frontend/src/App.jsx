import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { setStore } from './api/store';
import HomePage from './pages/HomePage';
import TransactionsPage from './pages/TransactionsPage';
import AnalyticsPage from './pages/AnalyticsPage';
import SavingsPage from './pages/SavingsPage';
import InvestmentsPage from './pages/InvestmentsPage';
import AdminPage from './pages/AdminPage';
import CashflowPage from './pages/CashflowPage';
import AnimatedBackground from './AnimatedBackground';
import { AccountProvider, useAccount } from './AccountContext';

const NAV_LINKS = [
  { to: '/', label: 'Dashboard' },
  { to: '/transactions', label: 'Transactions' },
  { to: '/savings', label: 'Savings' },
  { to: '/investments', label: 'Investments' },
  { to: '/cashflow', label: 'Cashflow' },
  { to: '/analytics', label: 'Analytics' },
];

function StreamerButton() {
  const { streamerMode, toggleStreamerMode } = useAccount();
  return (
    <button
      onClick={toggleStreamerMode}
      title={streamerMode ? 'Disable Streamer Mode' : 'Enable Streamer Mode'}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
        streamerMode
          ? 'border-accent-gold/50 text-accent-gold bg-accent-gold/10'
          : 'border-white/10 text-secondary hover:text-white hover:border-white/20'
      }`}
    >
      <span>{streamerMode ? '🙈' : '👁'}</span>
      <span>Streamer</span>
    </button>
  );
}


function Layout({ children }) {
  const location = useLocation();
  const { streamerMode } = useAccount();

  return (
    <>
      <AnimatedBackground />
      <div className={`h-screen pt-6 px-8 pb-4 flex flex-col overflow-hidden relative z-[1]${streamerMode ? ' streamer' : ''}`}>
        <header className="mb-6 grid grid-cols-3 items-center px-6 py-3 rounded-2xl bg-overlay backdrop-blur-lg border border-white/[0.06]">
          <div className="flex items-center gap-4">
            <img src="/logo.png" alt="RR Finance" className="h-[102px] w-auto" />
            <div>
              <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-accent-green to-accent-blue">
                RR Finance
              </h1>
              <p className="text-xs text-secondary">Personal finance tracker</p>
            </div>
          </div>

          <nav className="flex justify-center">
            <div className="flex bg-white/[0.03] rounded-lg p-1">
              {NAV_LINKS.map(({ to, label }) => (
                <Link
                  key={to}
                  to={to}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    (to === '/' ? location.pathname === '/' : location.pathname.startsWith(to))
                      ? 'bg-accent-green/15 text-accent-green'
                      : 'text-secondary hover:text-white'
                  }`}
                >
                  {label}
                </Link>
              ))}
            </div>
          </nav>

          <div className="flex items-center justify-end gap-2">
            <StreamerButton />
            <Link
              to="/admin"
              title="Admin settings"
              className={`flex items-center justify-center w-8 h-8 rounded-lg border transition-colors ${
                location.pathname === '/admin'
                  ? 'border-accent-green/50 text-accent-green bg-accent-green/10'
                  : 'border-white/10 text-secondary hover:text-white hover:border-white/20'
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
            </Link>
          </div>
        </header>

        <div className="flex-1 min-h-0">
          {children}
        </div>

        <footer className="mt-2 pt-4 border-t border-white/[0.06] flex justify-center pb-2">
          <p className="text-muted text-[10px] uppercase font-bold tracking-[0.2em]">
            RR Finance &copy; 2026
          </p>
        </footer>
      </div>
    </>
  );
}

function AppContent() {
  return (
    <Layout>
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

const LS_KEYS_TO_MIGRATE = [
  'rr-finance-dca-contributions',
  'rr-finance-evolution-data',
  'rr-finance-distribution-targets',
  'rr-predictions-config',
  'rr-savings-deposits',
  'rr-savings-snapshots',
  'rr-savings-premiums',
  'rr-cashflow-data',
  'rr_finance_api_keys',
];

function App() {
  useEffect(() => {
    const MIGRATED_FLAG = 'rr-store-migrated-v1';
    if (localStorage.getItem(MIGRATED_FLAG)) return;

    const tasks = LS_KEYS_TO_MIGRATE.flatMap(key => {
      const raw = localStorage.getItem(key);
      if (!raw) return [];
      try {
        return [setStore(key, JSON.parse(raw))];
      } catch {
        return [];
      }
    });

    Promise.all(tasks).then(() => {
      localStorage.setItem(MIGRATED_FLAG, '1');
      console.log('[RR Finance] localStorage migrated to backend store.');
    });
  }, []);

  return (
    <Router>
      <AccountProvider>
        <AppContent />
      </AccountProvider>
    </Router>
  );
}

export default App;
