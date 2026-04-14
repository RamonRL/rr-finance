import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { API_URL } from '../constants';
import { useAccount } from '../AccountContext';
import { useStore } from '../hooks/useStore';

const now = new Date();
const fmtEur = (v) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(v);
const pnlSign = (v) => (v != null && v > 0 ? '+' : '');
const pnlColor = (v) => (v == null ? '#7a95b2' : v >= 0 ? '#00c896' : '#ff5c5c');

const TOP_BAR_COLORS = ['#00c896', '#3d9eff', '#3d9eff', '#f0b429', '#f0b429'];

// ── Investments (backend store) ───────────────────────────────────────────────
const DCA_KEY = 'rr-finance-dca-contributions';
const EVO_KEY = 'rr-finance-evolution-data';
const START_MONTH = '2026-02';

const TYPE_COLORS = {
  'Indexed Fund': '#6366f1',
  ETF: '#00c896',
  Crypto: '#f97316',
  Gold: '#f0b429',
  Other: '#7a95b2',
};


// ── Components ────────────────────────────────────────────────────────────────
function KpiCard({ label, value, color, icon, valueColor }) {
  const stripe = color.includes('green') ? 'var(--accent-green)' : color.includes('red') ? 'var(--accent-red)' : 'var(--accent-blue)';
  return (
    <div className="bg-surface rounded-xl p-5 flex items-center gap-4"
      style={{ borderTop: '1px solid var(--border-default)', borderLeft: `2px solid ${stripe}`, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)' }}>
      <div className={`w-12 h-12 rounded-lg flex items-center justify-center text-2xl ${color}`}>
        {icon}
      </div>
      <div>
        <p className="text-[11px] text-secondary uppercase tracking-[0.08em]">{label}</p>
        <p className={`text-2xl font-bold tabular-nums ${valueColor ?? (value >= 0 ? 'text-white' : 'text-accent-red')}`}>
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
  const [contributions] = useStore(DCA_KEY, []);
  const [evData] = useStore(EVO_KEY, {});

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
      .then(d => { if (Array.isArray(d)) setBalances(d); })
      .catch(() => {});
  }, []);

  // ── Portfolio computation (mirrors EvolutionPage logic) ───────────────────
  const dcaByAsset = useMemo(() => {
    const map = {};
    contributions.filter(c => c.month >= START_MONTH).forEach(c => {
      if (!map[c.assetName]) {
        map[c.assetName] = {
          assetName: c.assetName, ticker: c.ticker,
          type: c.type, broker: c.broker, months: {}, participations: {},
        };
      }
      const a = map[c.assetName];
      a.months[c.month] = (a.months[c.month] || 0) + c.amount;
      a.participations[c.month] = (a.participations[c.month] || 0) + (c.participations || 0);
      if (c.ticker) a.ticker = c.ticker;
      a.type = c.type;
      if (c.broker) a.broker = c.broker;
    });
    return map;
  }, [contributions]);

  const allMonths = useMemo(() =>
    [...new Set(contributions.filter(c => c.month >= START_MONTH).map(c => c.month))].sort(),
  [contributions]);

  const assetNames = useMemo(() => Object.keys(dcaByAsset), [dcaByAsset]);

  // Plain function (no useCallback needed — not passed as prop)
  const getPrice = (assetName, month) => {
    const ev = evData[`${assetName}___${month}`];
    if (ev?.priceIsManual && ev.priceSource !== 'refresh' && ev.price != null) return ev.price;
    const n = dcaByAsset[assetName]?.participations?.[month] || 0;
    const dcaAmt = dcaByAsset[assetName]?.months[month];
    if (n > 0 && dcaAmt != null) return dcaAmt / n;
    if (ev?.price != null) return ev.price;
    return null;
  };

  const assetRows = useMemo(() => {
    return assetNames.map(name => {
      const meta = dcaByAsset[name];
      let totalN = 0, latestPrice = null, totalContributed = 0;
      allMonths.forEach(m => {
        totalN += dcaByAsset[name]?.participations?.[m] || 0;
        const p = getPrice(name, m);
        if (p != null) latestPrice = p;
        totalContributed += meta.months[m] || 0;
      });
      const totalEur = totalN * (latestPrice ?? 0);
      const pnlEur = totalEur - totalContributed;
      const pnlPct = totalContributed > 0 ? (pnlEur / totalContributed) * 100 : null;
      return { name, meta, totalN, latestPrice, totalContributed, totalEur, pnlEur, pnlPct };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetNames, dcaByAsset, allMonths, evData]);

  const grandTotalEur = useMemo(() => assetRows.reduce((s, r) => s + r.totalEur, 0), [assetRows]);
  const grandContributed = useMemo(() => assetRows.reduce((s, r) => s + r.totalContributed, 0), [assetRows]);
  const grandPnlEur = grandTotalEur - grandContributed;
  const grandPnlPct = grandContributed > 0 ? (grandPnlEur / grandContributed) * 100 : null;
  const hasPortfolio = assetRows.some(r => r.totalEur > 0 || r.totalContributed > 0);

  // Top assets sorted by current value
  const topAssets = useMemo(() =>
    [...assetRows].sort((a, b) => b.totalEur - a.totalEur).slice(0, 5),
  [assetRows]);

  const totalBankBalance = balances.reduce((s, a) => s + a.balance, 0);
  const grandTotal = totalBankBalance + grandTotalEur;

  return (
    <div className="h-full overflow-y-auto custom-scrollbar p-6">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* Header row */}
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">Dashboard</h2>
          <select
            value={selectedYM}
            onChange={e => setSelectedYM(e.target.value)}
            className="bg-elevated border border-white/10 text-sm text-white rounded-lg px-3 py-2 focus:outline-none focus:border-primary/50"
          >
            {availableMonths.map(m => (
              <option key={`${m.year}-${m.month}`} value={`${m.year}-${m.month}`}>{m.label}</option>
            ))}
          </select>
        </div>

        {/* Monthly KPI cards */}
        <div className="grid grid-cols-3 gap-4">
          <KpiCard label="Income"   value={summary?.income    ?? 0} color="bg-accent-green/20" icon="📈" valueColor="text-accent-green" />
          <KpiCard label="Expenses" value={summary?.expenses  ?? 0} color="bg-accent-red/20"   icon="📉" valueColor="text-accent-red" />
          <KpiCard label="Balance"  value={summary?.balance   ?? 0} color="bg-accent-blue/20"  icon="⚖️" />
        </div>

        {/* Account balances — bank accounts + portfolio card */}
        {(balances.length > 0 || hasPortfolio) && (
          <div className="bg-surface border border-white/10 rounded-xl p-5">
            <h3 className="text-[11px] font-semibold text-secondary uppercase tracking-widest mb-4">Account balances</h3>
            <div className="flex flex-wrap gap-3">
              {/* Bank accounts */}
              {balances.map(acc => (
                <div key={acc.id} className="flex-1 min-w-[140px] bg-background/50 rounded-lg p-4 border border-white/[0.06]">
                  <div className="flex items-center gap-2 mb-2">
                    <span>{acc.icon}</span>
                    <span className="text-xs text-secondary truncate">{acc.name}</span>
                  </div>
                  <p className="text-xl font-bold tabular-nums" style={{ color: acc.balance >= 0 ? acc.color : '#ff5c5c' }}>
                    <span className="private">{fmtEur(acc.balance)}</span>
                  </p>
                </div>
              ))}

              {/* Portfolio card */}
              {hasPortfolio && (
                <div className="flex-1 min-w-[140px] bg-background/50 rounded-lg p-4 border border-white/[0.06]"
                  style={{ borderLeft: '2px solid #6366f1' }}>
                  <div className="flex items-center gap-2 mb-2">
                    <span>📊</span>
                    <span className="text-xs text-secondary">Portfolio</span>
                  </div>
                  <p className="text-xl font-bold tabular-nums text-white">
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
              <div className="flex-1 min-w-[140px] bg-background/50 rounded-lg p-4 border border-white/[0.06]">
                <div className="flex items-center gap-2 mb-2">
                  <span>💰</span>
                  <span className="text-xs text-secondary">Total</span>
                </div>
                <p className={`text-xl font-bold tabular-nums ${grandTotal >= 0 ? 'text-white' : 'text-accent-red'}`}>
                  <span className="private">{fmtEur(grandTotal)}</span>
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Portfolio snapshot */}
        {hasPortfolio && (
          <div className="bg-surface border border-white/10 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[11px] font-semibold text-secondary uppercase tracking-widest">Portfolio</h3>
              <Link to="/investments" className="text-xs text-primary hover:text-accent transition-colors">View all →</Link>
            </div>

            {/* Summary stat cards */}
            <div className="grid grid-cols-4 gap-3 mb-5">
              <div className="bg-background/50 rounded-lg p-4 border border-white/[0.06]" style={{ borderLeft: '2px solid #3d9eff' }}>
                <p className="text-[10px] text-secondary uppercase tracking-widest mb-1">Contributed</p>
                <p className="text-lg font-bold text-white tabular-nums private">{fmtEur(grandContributed)}</p>
              </div>
              <div className="bg-background/50 rounded-lg p-4 border border-white/[0.06]" style={{ borderLeft: '2px solid #6366f1' }}>
                <p className="text-[10px] text-secondary uppercase tracking-widest mb-1">Portfolio value</p>
                <p className="text-lg font-bold text-white tabular-nums private">{fmtEur(grandTotalEur)}</p>
              </div>
              <div className="bg-background/50 rounded-lg p-4 border border-white/[0.06]"
                style={{ borderLeft: `2px solid ${pnlColor(grandPnlEur)}` }}>
                <p className="text-[10px] text-secondary uppercase tracking-widest mb-1">P&amp;L</p>
                <p className="text-lg font-bold tabular-nums private" style={{ color: pnlColor(grandPnlEur) }}>
                  {pnlSign(grandPnlEur)}{fmtEur(grandPnlEur)}
                </p>
              </div>
              <div className="bg-background/50 rounded-lg p-4 border border-white/[0.06]"
                style={{ borderLeft: `2px solid ${pnlColor(grandPnlPct)}` }}>
                <p className="text-[10px] text-secondary uppercase tracking-widest mb-1">Return</p>
                <p className="text-lg font-bold tabular-nums" style={{ color: pnlColor(grandPnlPct) }}>
                  {grandPnlPct != null ? `${pnlSign(grandPnlPct)}${grandPnlPct.toFixed(2)}%` : '—'}
                </p>
              </div>
            </div>

            {/* Per-asset rows */}
            <div className="space-y-2">
              {topAssets.map(r => {
                const typeColor = TYPE_COLORS[r.meta.type] || TYPE_COLORS.Other;
                const pct = grandTotalEur > 0 ? (r.totalEur / grandTotalEur) * 100 : 0;
                return (
                  <div key={r.name} className="flex items-center gap-3">
                    <div className="flex items-center gap-2 w-48 min-w-0 flex-shrink-0">
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: typeColor }} />
                      <span className="text-sm text-white truncate">{r.name}</span>
                      <span className="text-[10px] px-1.5 py-px rounded flex-shrink-0"
                        style={{ background: typeColor + '22', color: typeColor }}>{r.meta.type}</span>
                    </div>
                    <div className="flex-1 h-1.5 bg-white/[0.06] rounded-full">
                      <div className="h-1.5 rounded-full transition-all"
                        style={{ width: `${pct}%`, backgroundColor: typeColor }} />
                    </div>
                    <span className="text-xs text-secondary w-10 text-right flex-shrink-0">{pct.toFixed(1)}%</span>
                    <span className="text-sm font-semibold tabular-nums text-white private w-28 text-right flex-shrink-0">
                      {fmtEur(r.totalEur)}
                    </span>
                    <span className="text-xs tabular-nums w-16 text-right flex-shrink-0"
                      style={{ color: pnlColor(r.pnlPct) }}>
                      {r.pnlPct != null ? `${pnlSign(r.pnlPct)}${r.pnlPct.toFixed(1)}%` : '—'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="grid grid-cols-3 gap-4">
          {/* Bar chart */}
          <div className="col-span-2 bg-surface border border-white/10 rounded-xl p-5">
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
          <div className="bg-surface border border-white/10 rounded-xl p-5">
            <h3 className="text-[11px] font-semibold text-secondary uppercase tracking-widest mb-4">Top expenses</h3>
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
