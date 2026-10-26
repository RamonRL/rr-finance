import { Routes, Route, Navigate, NavLink } from 'react-router-dom';
import SavingsDepositsPage from './SavingsDepositsPage';
import SavingsPortfolioPage from './SavingsPortfolioPage';
import SavingsEmergencyPage from './SavingsEmergencyPage';

const SUB_PAGES = [
  { to: '/savings/emergency', label: 'Emergency fund' },
  { to: '/savings/portfolio', label: 'Portfolio (closing)' },
  { to: '/savings/deposits',  label: 'Deposits (archive)' },
];

const SavingsPage = () => (
  <div className="h-full flex flex-col md:overflow-hidden gap-3 md:gap-4 p-3 md:p-0">

    {/* Sub-nav */}
    <div className="md:flex-shrink-0 overflow-x-auto no-scrollbar">
      <div className="inline-flex bg-white/[0.03] rounded-lg p-1 gap-0.5 min-w-max">
        {SUB_PAGES.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `px-3 md:px-4 py-1.5 rounded-md text-xs md:text-sm font-medium transition-colors whitespace-nowrap ${
                isActive
                  ? 'bg-accent-gold/15 text-accent-gold'
                  : 'text-secondary hover:text-white'
              }`
            }
          >
            {label}
          </NavLink>
        ))}
      </div>
    </div>

    {/* Page content */}
    <div className="flex-1 md:min-h-0">
      <Routes>
        <Route index element={<Navigate to="emergency" replace />} />
        <Route path="emergency" element={<SavingsEmergencyPage />} />
        {/* Archived: fieldset disabled turns every form control read-only */}
        <Route path="deposits"  element={<fieldset disabled className="contents"><SavingsDepositsPage /></fieldset>} />
        <Route path="portfolio" element={<SavingsPortfolioPage />} />
        {/* The tab used to be "Money fund" — keep old links working */}
        <Route path="fund" element={<Navigate to="../portfolio" replace />} />
      </Routes>
    </div>

  </div>
);

export default SavingsPage;
