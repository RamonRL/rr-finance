import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { BarChart, Bar, AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { API_URL } from '../constants';
import { useAccount } from '../AccountContext';
import { useStore } from '../hooks/useStore';
import { buildHoldings, shareBy, START_MONTH } from '../utils/holdings';
import { xirr } from '../utils/portfolio';
import {
  AccountIcon,
  IconTrendUp,
  IconTrendDown,
  IconScale,
  IconPieChart,
  IconWallet,
} from '../components/icons';

const now = new Date();
const fmtEur = (v) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(v);
const pnlSign = (v) => (v != null && v > 0 ? '+' : '');
const pnlColor = (v) => (v == null ? '#7a95b2' : v >= 0 ? '#00c896' : '#ff5c5c');

const TOP_BAR_COLORS = ['#00c896', '#3d9eff', '#3d9eff', '#f0b429', '#f0b429'];

// ── Investments (backend store) ───────────────────────────────────────────────
const DCA_KEY = 'rr-finance-dca-contributions';
const EVO_KEY = 'rr-finance-evolution-data';
const SNAPSHOTS_KEY = 'rr-networth-snapshots';
const round2 = (v) => Math.round(v * 100) / 100;

const TYPE_COLORS = {
  'Indexed Fund': '#6366f1',
  ETF: '#00c896',
  Crypto: '#f97316',
  Gold: '#f0b429',
  Stock: '#ec4899',
  Other: '#7a95b2',
};


// ── Components ────────────────────────────────────────────────────────────────
function KpiCard({ label, value, color, Icon, valueColor }) {
  const stripe = color.includes('green') ? 'var(--accent-green)' : color.includes('red') ? 'var(--accent-red)' : 'var(--accent-blue)';
  const iconColor = color.includes('green') ? 'text-accent-green' : color.includes('red') ? 'text-accent-red' : 'text-accent-blue';
  return (
    <div className="bg-surface rounded-xl p-3 md:p-5 flex flex-col md:flex-row items-start md:items-center gap-2 md:gap-4 min-w-0"
      style={{ borderTop: '1px solid var(--border-default)', borderLeft: `2px solid ${stripe}`, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)' }}>
      <div className={`w-8 h-8 md:w-12 md:h-12 rounded-lg flex items-center justify-center ${color} ${iconColor}`}>
        {Icon ? <Icon size={20} /> : null}
      </div>
      <div className="min-w-0 w-full">
        <p className="text-[10px] md:text-[11px] text-secondary uppercase tracking-[0.08em] truncate">{label}</p>
        <p className={`text-base md:text-2xl font-bold tabular-nums truncate ${valueColor ?? (value >= 0 ? 'text-white' : 'text-accent-red')}`}>
          <span className="private">{fmtEur(value)}</span>
        </p>
      </div>
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-elevated border border-white/10 rounded-lg p-3 text-sm">
      <p className="text-secondary mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>{p.name}: {fmtEur(p.value)}</p>
      ))}
    </div>
  );
};

// ── Page ──────────────────────────────────────────────────────────────────────
const HomePage = () => {
  const { selectedAccount } = useAccount();
  const [summary, setSummary] = useState(null);
  const [monthly, setMonthly] = useState([]);
  const [balances, setBalances] = useState([]);
  const [selectedYM, setSelectedYM] = useState('');
  const [availableMonths, setAvailableMonths] = useState([]);
  const [monthsRange, setMonthsRange] = useState(6);

  // Investments — read from backend store (same source as EvolutionPage)
  const [contributions, , contribLoading] = useStore(DCA_KEY, []);
  const [evData, , evLoading] = useStore(EVO_KEY, {});
  const [snaps, setSnaps, snapsLoading] = useStore(SNAPSHOTS_KEY, []);

  useEffect(() => {
    if (!selectedAccount) return;
    fetch(`${API_URL}/available-months?account_id=${selectedAccount.id}`)
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        if (!Array.isArray(data) || data.length === 0) return;
        setAvailableMonths(data);
        const nowKey = `${now.getFullYear()}-${now.getMonth() + 1}`;
        const exists = data.some(d => `${d.year}-${d.month}` === nowKey);
        setSelectedYM(exists ? nowKey : `${data[data.length - 1].year}-${data[data.length - 1].month}`);
      }).catch(() => {});
  }, [selectedAccount]);

  useEffect(() => {
    if (!selectedAccount || !selectedYM) return;
    const [year, month] = selectedYM.split('-').map(Number);
    const aid = selectedAccount.id;
    fetch(`${API_URL}/summary?year=${year}&month=${month}&account_id=${aid}`)
      .then(r => r.ok ? r.json() : null).then(d => { if (d) setSummary(d); }).catch(() => {});
    fetch(`${API_URL}/monthly?months=${monthsRange}&account_id=${aid}`)
      .then(r => r.ok ? r.json() : []).then(d => { if (Array.isArray(d)) setMonthly(d); }).catch(() => {});
  }, [selectedYM, selectedAccount, monthsRange]);

  useEffect(() => {
    fetch(`${API_URL}/balances`)
      .then(r => r.ok ? r.json() : [])
      .then(d => { if (Array.isArray(d)) setBalances([...d].sort((a, b) => a.id - b.id)); })
      .catch(() => {});
  }, []);

  // ── Portfolio computation ─────────────────────────────────────────────────
  const { assetRows, grandTotalEur, grandContributed } = useMemo(
    () => buildHoldings(contributions, evData), [contributions, evData]);
  const grandPnlEur = grandTotalEur - grandContributed;
  const grandPnlPct = grandContributed > 0 ? (grandPnlEur / grandContributed) * 100 : null;
  const hasPortfolio = assetRows.some(r => r.totalEur > 0 || r.totalContributed > 0);

  // Top assets sorted by current value
  const topAssets = useMemo(() =>
    [...assetRows].sort((a, b) => b.totalEur - a.totalEur).slice(0, 5),
  [assetRows]);

  // Investments is only the ledger sink for money sent to the portfolio; its market
  // value is already in grandTotalEur, so counting the account would double it.
  const totalBankBalance = balances.filter(a => a.name !== 'Investments').reduce((s, a) => s + a.balance, 0);
  const grandTotal = totalBankBalance + grandTotalEur;

  // Liquidity / emergency fund / invested split of the net worth
  const bankAccounts = balances.filter(a => a.name !== 'Investments');
  const emergency = balances.find(a => a.name === 'Savings')?.balance ?? 0;
  const liquidity = totalBankBalance - emergency;
  const split = [
    { label: 'Liquidity', value: liquidity, color: '#00c896' },
    { label: 'Emergency fund', value: emergency, color: '#f0b429' },
    { label: 'Invested', value: grandTotalEur, color: '#6366f1' },
  ];

  const brokerShare = useMemo(() => shareBy(assetRows, 'broker'), [assetRows]);

  // Money-weighted annualised return; month-level contribution dates are approximated to the 15th
  const annualised = useMemo(() => {
    const flows = contributions.filter(c => c.month >= START_MONTH && c.amount)
      .map(c => ({ date: `${c.month}-15`, amount: -c.amount }))
      .sort((a, b) => a.date.localeCompare(b.date));
    const today = new Date().toISOString().slice(0, 10);
    if (!flows.length || (new Date(today) - new Date(flows[0].date)) / 86400000 < 60) return null;
    return xirr([...flows, { date: today, amount: grandTotalEur }]);
  }, [contributions, grandTotalEur]);

  // Monthly net-worth snapshot (market value included, unlike /balance-history)
  useEffect(() => {
    if (snapsLoading || contribLoading || evLoading || !balances.length) return;
    const ym = new Date().toISOString().slice(0, 7);
    const entry = {
      month: ym, liquidity: round2(liquidity), emergency: round2(emergency),
      invested: round2(grandTotalEur), contributed: round2(grandContributed),
    };
    const cur = snaps.find(x => x.month === ym);
    if (cur && ['liquidity', 'emergency', 'invested', 'contributed'].every(k => cur[k] === entry[k])) return;
    setSnaps([...snaps.filter(x => x.month !== ym), entry].sort((a, b) => a.month.localeCompare(b.month)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapsLoading, contribLoading, evLoading, balances, grandTotalEur, grandContributed]);

  return (
    <div className="h-full overflow-y-auto custom-scrollbar p-3 md:p-6">
      <div className="max-w-6xl mx-auto space-y-4 md:space-y-6">

        {/* Header row */}
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg md:text-xl font-bold text-white">Dashboard</h2>
          <select
            value={selectedYM}
            onChange={e => setSelectedYM(e.target.value)}
            className="bg-elevated border border-white/10 text-xs md:text-sm text-white rounded-lg px-2 md:px-3 py-1.5 md:py-2 focus:outline-none focus:border-primary/50"
          >
            {availableMonths.map(m => (
              <option key={`${m.year}-${m.month}`} value={`${m.year}-${m.month}`}>{m.label}</option>
            ))}
          </select>
        </div>

        {/* Monthly KPI cards */}
        <div className="grid grid-cols-3 gap-2 md:gap-4">
          <KpiCard label="Income"   value={summary?.income    ?? 0} color="bg-accent-green/20" Icon={IconTrendUp}   valueColor="text-accent-green" />
          <KpiCard label="Expenses" value={summary?.expenses  ?? 0} color="bg-accent-red/20"   Icon={IconTrendDown} valueColor="text-accent-red" />
          <KpiCard label="Balance"  value={summary?.balance   ?? 0} color="bg-accent-blue/20"  Icon={IconScale} />
        </div>

        {/* Account balances — bank accounts + portfolio card */}
        {(bankAccounts.length > 0 || hasPortfolio) && (
          <div className="bg-surface border border-white/10 rounded-xl p-3 md:p-5">
            <h3 className="text-[11px] font-semibold text-secondary uppercase tracking-widest mb-3 md:mb-4">Account balances</h3>
            <div className="grid grid-cols-2 md:flex md:flex-wrap gap-2 md:gap-3">
              {/* Bank accounts */}
              {bankAccounts.map(acc => (
                <div key={acc.id} className="min-w-0 md:flex-1 md:min-w-[140px] bg-background/50 rounded-lg p-3 md:p-4 border border-white/[0.06]">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-secondary"><AccountIcon name={acc.icon} size={16} /></span>
                    <span className="text-xs text-secondary truncate">{acc.name}</span>
                  </div>
                  <p className="text-base md:text-xl font-bold tabular-nums truncate" style={{ color: acc.balance >= 0 ? acc.color : '#ff5c5c' }}>
                    <span className="private">{fmtEur(acc.balance)}</span>
                  </p>
                </div>
              ))}

              {/* Portfolio card */}
              {hasPortfolio && (
                <div className="min-w-0 md:flex-1 md:min-w-[140px] bg-background/50 rounded-lg p-3 md:p-4 border border-white/[0.06]"
                  style={{ borderLeft: '2px solid #6366f1' }}>
                  <div className="flex items-center gap-2 mb-2">
                    <span style={{ color: '#6366f1' }}><IconPieChart size={16} /></span>
                    <span className="text-xs text-secondary">Portfolio</span>
                  </div>
                  <p className="text-base md:text-xl font-bold tabular-nums text-white truncate">
                    <span className="private">{fmtEur(grandTotalEur)}</span>
                  </p>
                  {grandPnlEur !== 0 && (
                    <p className="text-[11px] tabular-nums mt-0.5" style={{ color: pnlColor(grandPnlEur) }}>
                      {pnlSign(grandPnlEur)}{fmtEur(grandPnlEur)}
                    </p>
                  )}
                </div>
              )}

              {/* Grand total */}
              <div className="min-w-0 md:flex-1 md:min-w-[140px] bg-background/50 rounded-lg p-3 md:p-4 border border-white/[0.06] col-span-2 md:col-span-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-accent-gold"><IconWallet size={16} /></span>
                  <span className="text-xs text-secondary">Total</span>
                </div>
                <p className={`text-base md:text-xl font-bold tabular-nums truncate ${grandTotal >= 0 ? 'text-white' : 'text-accent-red'}`}>
                  <span className="private">{fmtEur(grandTotal)}</span>
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Net worth split + evolution */}
        {grandTotal > 0 && (
          <div className="bg-surface border border-white/10 rounded-xl p-3 md:p-5 space-y-4">
            <h3 className="text-[11px] font-semibold text-secondary uppercase tracking-widest">Net worth</h3>
            <div className="flex h-2 rounded-full overflow-hidden bg-white/[0.06]">
              {split.filter(x => x.value > 0).map(x => (
                <div key={x.label} style={{ width: `${(x.value / grandTotal) * 100}%`, background: x.color }} />
              ))}
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-secondary">
              {split.map(x => (
                <span key={x.label} className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ background: x.color }} />
                  {x.label} <span className="text-white tabular-nums private">{fmtEur(x.value)}</span>
                  <span className="text-muted">{((x.value / grandTotal) * 100).toFixed(1)}%</span>
                </span>
              ))}
            </div>
            {snaps.length > 1 && (
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={snaps.map(x => ({ ...x, label: x.month, Total: x.liquidity + x.emergency + x.invested, Contributed: x.contributed }))}>
                  <XAxis dataKey="label" tick={{ fill: '#3d5a78', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#3d5a78', fontSize: 11 }} axisLine={false} tickLine={false} width={55}
                    domain={['dataMin', 'dataMax']} tickFormatter={v => `€${(v / 1000).toFixed(0)}k`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="Total" stroke="#00c896" fill="#00c89622" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        )}

        {/* Portfolio snapshot */}
        {hasPortfolio && (
          <div className="bg-surface border border-white/10 rounded-xl p-3 md:p-5">
            <div className="flex items-center justify-between mb-3 md:mb-4">
              <h3 className="text-[11px] font-semibold text-secondary uppercase tracking-widest">Portfolio</h3>
              <Link to="/investments" className="text-xs text-primary hover:text-accent transition-colors">View all →</Link>
            </div>

            {/* Summary stat cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3 mb-4 md:mb-5">
              <div className="bg-background/50 rounded-lg p-3 md:p-4 border border-white/[0.06] min-w-0" style={{ borderLeft: '2px solid #3d9eff' }}>
                <p className="text-[10px] text-secondary uppercase tracking-widest mb-1 truncate">Contributed</p>
                <p className="text-sm md:text-lg font-bold text-white tabular-nums private truncate">{fmtEur(grandContributed)}</p>
              </div>
              <div className="bg-background/50 rounded-lg p-3 md:p-4 border border-white/[0.06] min-w-0" style={{ borderLeft: '2px solid #6366f1' }}>
                <p className="text-[10px] text-secondary uppercase tracking-widest mb-1 truncate">Portfolio value</p>
                <p className="text-sm md:text-lg font-bold text-white tabular-nums private truncate">{fmtEur(grandTotalEur)}</p>
              </div>
              <div className="bg-background/50 rounded-lg p-3 md:p-4 border border-white/[0.06] min-w-0"
                style={{ borderLeft: `2px solid ${pnlColor(grandPnlEur)}` }}>
                <p className="text-[10px] text-secondary uppercase tracking-widest mb-1 truncate">P&amp;L</p>
                <p className="text-sm md:text-lg font-bold tabular-nums private truncate" style={{ color: pnlColor(grandPnlEur) }}>
                  {pnlSign(grandPnlEur)}{fmtEur(grandPnlEur)}
                </p>
              </div>
              <div className="bg-background/50 rounded-lg p-3 md:p-4 border border-white/[0.06] min-w-0"
                style={{ borderLeft: `2px solid ${pnlColor(grandPnlPct)}` }}>
                <p className="text-[10px] text-secondary uppercase tracking-widest mb-1 truncate">Return</p>
                <p className="text-sm md:text-lg font-bold tabular-nums truncate" style={{ color: pnlColor(grandPnlPct) }}>
                  {grandPnlPct != null ? `${pnlSign(grandPnlPct)}${grandPnlPct.toFixed(2)}%` : '—'}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-secondary mb-4">
              <span>Annualised (XIRR): <span className="tabular-nums" style={{ color: pnlColor(annualised) }}>
                {annualised != null ? `${pnlSign(annualised)}${annualised.toFixed(1)}%` : '—'}</span></span>
              {brokerShare.map(b => (
                <span key={b.name}>{b.name}: <span className="text-white tabular-nums">{b.pct.toFixed(1)}%</span></span>
              ))}
            </div>

            {/* Per-asset rows */}
            <div className="space-y-2">
              {topAssets.map(r => {
                const typeColor = TYPE_COLORS[r.meta.type] || TYPE_COLORS.Other;
                const pct = grandTotalEur > 0 ? (r.totalEur / grandTotalEur) * 100 : 0;
                return (
                  <div key={r.name} className="flex flex-col md:flex-row md:items-center gap-1.5 md:gap-3">
                    <div className="flex items-center gap-2 md:w-48 min-w-0 md:flex-shrink-0">
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: typeColor }} />
                      <span className="text-sm text-white truncate">{r.name}</span>
                      <span className="text-[10px] px-1.5 py-px rounded flex-shrink-0"
                        style={{ background: typeColor + '22', color: typeColor }}>{r.meta.type}</span>
                    </div>
                    <div className="flex items-center gap-2 md:contents">
                      <div className="flex-1 h-1.5 bg-white/[0.06] rounded-full min-w-0">
                        <div className="h-1.5 rounded-full transition-all"
                          style={{ width: `${pct}%`, backgroundColor: typeColor }} />
                      </div>
                      <span className="text-xs text-secondary w-10 text-right flex-shrink-0">{pct.toFixed(1)}%</span>
                      <span className="text-sm font-semibold tabular-nums text-white private md:w-28 text-right flex-shrink-0 whitespace-nowrap">
                        {fmtEur(r.totalEur)}
                      </span>
                      <span className="text-xs tabular-nums md:w-16 text-right flex-shrink-0 whitespace-nowrap"
                        style={{ color: pnlColor(r.pnlPct) }}>
                        {r.pnlPct != null ? `${pnlSign(r.pnlPct)}${r.pnlPct.toFixed(1)}%` : '—'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
          {/* Bar chart */}
          <div className="md:col-span-2 bg-surface border border-white/10 rounded-xl p-3 md:p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[11px] font-semibold text-secondary uppercase tracking-widest">
                {monthsRange === 0 ? 'All time' : `Last ${monthsRange} months`}
              </h3>
              <select value={monthsRange} onChange={e => setMonthsRange(Number(e.target.value))}
                className="bg-elevated border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-primary/50">
                <option value={3}>3 months</option>
                <option value={6}>6 months</option>
                <option value={12}>12 months</option>
                <option value={0}>All time</option>
              </select>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={monthly} barGap={4}>
                <XAxis dataKey="label" tick={{ fill: '#3d5a78', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#3d5a78', fontSize: 11 }} axisLine={false} tickLine={false} width={55}
                  tickFormatter={v => `€${(v / 1000).toFixed(0)}k`} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12, color: '#7a95b2' }} />
                <Bar dataKey="income"   name="Income"   fill="#00c896" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expenses" name="Expenses" fill="#ff5c5c" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Top expense categories */}
          <div className="bg-surface border border-white/10 rounded-xl p-3 md:p-5">
            <h3 className="text-[11px] font-semibold text-secondary uppercase tracking-widest mb-3 md:mb-4">Top expenses</h3>
            {summary?.by_category?.length ? (
              <ul className="space-y-3">
                {summary.by_category.slice(0, 5).map(({ category, total }, idx) => {
                  const max = summary.by_category[0].total;
                  const pct = Math.round((total / max) * 100);
                  return (
                    <li key={category}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-white">{category}</span>
                        <span className="text-secondary private">€{total.toFixed(0)}</span>
                      </div>
                      <div className="h-1.5 bg-white/[0.06] rounded-full">
                        <div className="h-1.5 rounded-full"
                          style={{ width: `${pct}%`, backgroundColor: TOP_BAR_COLORS[idx] || '#f0b429' }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-muted text-sm">No expenses yet this month.</p>
            )}
            <Link to="/analytics" className="mt-4 block text-xs text-primary hover:text-accent transition-colors">
              View full analytics →
            </Link>
          </div>
        </div>

      </div>
    </div>
  );
};

export default HomePage;
