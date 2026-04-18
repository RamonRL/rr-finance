import { Routes, Route, Navigate, NavLink } from 'react-router-dom';
import DcaPage from './DcaPage';
import EvolutionPage from './EvolutionPage';
import DistributionPage from './DistributionPage';
import CalculatorPage from './CalculatorPage';

const SUB_PAGES = [
  { to: '/investments/dca',          label: 'DCA' },
  { to: '/investments/evolution',    label: 'Evolution' },
  { to: '/investments/distribution', label: 'Distribution' },
  { to: '/investments/calculator',   label: 'Calculator' },
];

const InvestmentsPage = () => (
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
                  ? 'bg-accent-green/15 text-accent-green'
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
        <Route index element={<Navigate to="dca" replace />} />
        <Route path="dca" element={<DcaPage />} />
        <Route path="evolution" element={<EvolutionPage />} />
        <Route path="distribution" element={<DistributionPage />} />
        <Route path="calculator"   element={<CalculatorPage />} />
      </Routes>
    </div>

  </div>
);

export default InvestmentsPage;
