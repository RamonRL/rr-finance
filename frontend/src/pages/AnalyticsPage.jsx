import React, { useState, useEffect, useMemo } from 'react';
import { useStore } from '../hooks/useStore';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
  LineChart, Line, PieChart, Pie, Cell, CartesianGrid,
} from 'recharts';
import { API_URL } from '../constants';
import { useAccount } from '../AccountContext';

const now = new Date();
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const COLORS = ['#00c896','#3d9eff','#f0b429','#ec4899','#8b5cf6','#14b8a6','#ff5c5c','#a3e635','#fb923c','#e879f9'];
const ALL_CATEGORIES = ['Housing','Food & Groceries','Transport','Health','Entertainment','Shopping','Utilities','Subscriptions','Travel','Music','Fuel','Bizum','Gambling','Investments','Common','Other','Salary','Investment','Gift','Refund'];

// ── Investments (backend store) ───────────────────────────────────────────────
const DCA_KEY = 'rr-finance-dca-contributions';
const EVO_KEY = 'rr-finance-evolution-data';
const START_MONTH = '2026-02';


const fmtEur = (v) => `€${Number(v).toFixed(0)}`;

const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const fmt = (v) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(v);
  return (
    <div className="bg-elevated border border-white/10 rounded-lg p-3 text-sm">
      <p className="text-secondary mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>{p.name}: {fmt(p.value)}</p>
      ))}
    </div>
  );
};

const PieTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-elevated border border-white/10 rounded-lg p-3 text-sm">
      <p style={{ color: payload[0].payload.fill }}>{payload[0].name}: €{payload[0].value.toFixed(0)}</p>
    </div>
  );
};

export default function AnalyticsPage() {
  const { selectedAccount } = useAccount();
  const [monthly, setMonthly] = useState([]);
  const [summary, setSummary] = useState(null);
  const [selectedYM, setSelectedYM] = useState('');
  const [availableMonths, setAvailableMonths] = useState([]);
  const [monthsRange, setMonthsRange] = useState(6);
  const [balanceHistory, setBalanceHistory] = useState({ accounts: [], history: [] });
  const [catFilter, setCatFilter] = useState('Food & Groceries');
  const [catMonthly, setCatMonthly] = useState([]);

  // Investments — read from backend store (same source as EvolutionPage)
  const [contributions] = useStore(DCA_KEY, []);
  const [evData] = useStore(EVO_KEY, {});

  const dcaByAsset = useMemo(() => {
    const map = {};
    contributions.filter(c => c.month >= START_MONTH).forEach(c => {
      if (!map[c.assetName]) {
        map[c.assetName] = { months: {}, participations: {} };
      }
      const a = map[c.assetName];
      a.months[c.month] = (a.months[c.month] || 0) + c.amount;
      a.participations[c.month] = (a.participations[c.month] || 0) + (c.participations || 0);
    });
    return map;
  }, [contributions]);

  const allDcaMonths = useMemo(() =>
    [...new Set(contributions.filter(c => c.month >= START_MONTH).map(c => c.month))].sort(),
  [contributions]);

  const assetNames = useMemo(() => Object.keys(dcaByAsset), [dcaByAsset]);

  // Resolve price for a given asset + month (same logic as EvolutionPage)
  const resolvePrice = (name, month) => {
    const ev = evData[`${name}___${month}`];
    if (ev?.priceIsManual && ev.priceSource !== 'refresh' && ev.price != null) return ev.price;
    const n = dcaByAsset[name]?.participations?.[month] || 0;
    const dcaAmt = dcaByAsset[name]?.months?.[month];
    if (n > 0 && dcaAmt != null) return dcaAmt / n;
    if (ev?.price != null) return ev.price;
    return null;
  };

  // Compute portfolio value at each balance-history month, merging into the history points
  const enrichedHistory = useMemo(() => {
    if (!balanceHistory.history.length) return [];
    return balanceHistory.history.map(point => {
      const pointKey = `${point.year}-${String(point.month).padStart(2, '0')}`;
      let portfolioValue = 0;
      assetNames.forEach(name => {
        let cumN = 0, latestPrice = null;
        allDcaMonths.forEach(m => {
          if (m > pointKey) return;
          cumN += dcaByAsset[name]?.participations?.[m] || 0;
          const p = resolvePrice(name, m);
          if (p != null) latestPrice = p;
        });
        portfolioValue += cumN * (latestPrice ?? 0);
      });
      return { ...point, Portfolio: portfolioValue, Total: point.Total + portfolioValue };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [balanceHistory.history, assetNames, dcaByAsset, allDcaMonths, evData]);

  const hasPortfolioData = enrichedHistory.some(p => p.Portfolio > 0);

  useEffect(() => {
    if (!selectedAccount) return;
    fetch(`${API_URL}/monthly?months=${monthsRange}&account_id=${selectedAccount.id}`)
      .then(r => r.ok ? r.json() : []).then(d => { if (Array.isArray(d)) setMonthly(d); }).catch(() => {});
    fetch(`${API_URL}/balance-history?months=${monthsRange}`)
      .then(r => r.ok ? r.json() : null).then(d => { if (d) setBalanceHistory(d); }).catch(() => {});
  }, [monthsRange, selectedAccount]);

  useEffect(() => {
    if (!selectedAccount) return;
    fetch(`${API_URL}/monthly?months=${monthsRange}&account_id=${selectedAccount.id}&category=${encodeURIComponent(catFilter)}`)
      .then(r => r.ok ? r.json() : []).then(d => { if (Array.isArray(d)) setCatMonthly(d); }).catch(() => {});
  }, [catFilter, monthsRange, selectedAccount]);

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
    fetch(`${API_URL}/summary?year=${year}&month=${month}&account_id=${selectedAccount.id}`)
      .then(r => r.ok ? r.json() : null).then(d => { if (d) setSummary(d); }).catch(() => {});
  }, [selectedYM, selectedAccount]);

  const pieData = (summary?.by_category ?? []).map((item, i) => ({
    name: item.category,
    value: item.total,
    fill: COLORS[i % COLORS.length],
  }));

  const balanceLine = monthly.map(m => ({ ...m, balance: m.income - m.expenses }));

  return (
    <div className="h-full overflow-y-auto custom-scrollbar p-6">
      <div className="max-w-6xl mx-auto space-y-6">

        <h2 className="text-xl font-bold text-white">Analytics</h2>

        {/* Income vs Expenses bar chart */}
        <div className="bg-surface border border-white/10 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[11px] font-semibold text-secondary uppercase tracking-widest">Income vs Expenses</h3>
            <select value={monthsRange} onChange={e => setMonthsRange(Number(e.target.value))}
              className="bg-elevated border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-primary/50">
              <option value={3}>3 months</option>
              <option value={6}>6 months</option>
              <option value={12}>12 months</option>
              <option value={0}>All time</option>
            </select>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={monthly} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: '#3d5a78', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#3d5a78', fontSize: 11 }} axisLine={false} tickLine={false} width={55} tickFormatter={fmtEur} />
              <Tooltip content={<ChartTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12, color: '#7a95b2' }} />
              <Bar dataKey="income" name="Income" fill="#00c896" radius={[4,4,0,0]} />
              <Bar dataKey="expenses" name="Expenses" fill="#ff5c5c" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Balance line chart */}
        <div className="bg-surface border border-white/10 rounded-xl p-5">
          <h3 className="text-[11px] font-semibold text-secondary uppercase tracking-widest mb-4">Balance evolution</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={balanceLine}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: '#3d5a78', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#3d5a78', fontSize: 11 }} axisLine={false} tickLine={false} width={55} tickFormatter={fmtEur} />
              <Tooltip content={<ChartTooltip />} />
              <Line type="monotone" dataKey="balance" name="Balance" stroke="#00c896" strokeWidth={2} dot={{ fill: '#00c896', r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Account balance history */}
        {enrichedHistory.length > 0 && (() => {
          const latest = enrichedHistory[enrichedHistory.length - 1];
          const slices = [
            ...balanceHistory.accounts.map(acc => ({
              name: acc.name,
              value: Math.max(0, latest[acc.name] || 0),
              fill: acc.color,
            })),
            ...(hasPortfolioData ? [{ name: 'Portfolio', value: Math.max(0, latest.Portfolio || 0), fill: '#6366f1' }] : []),
          ].filter(d => d.value > 0);
          const pieTotal = slices.reduce((s, d) => s + d.value, 0);

          return (
            <div className="bg-surface border border-white/10 rounded-xl p-5">
              <h3 className="text-[11px] font-semibold text-secondary uppercase tracking-widest mb-4">Account balance history</h3>
              <div className="flex gap-6">
                <div className="flex-1 min-w-0">
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={enrichedHistory}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                      <XAxis dataKey="label" tick={{ fill: '#3d5a78', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: '#3d5a78', fontSize: 11 }} axisLine={false} tickLine={false} width={55} tickFormatter={fmtEur} />
                      <Tooltip content={<ChartTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 12, color: '#7a95b2' }} />
                      {balanceHistory.accounts.map(acc => (
                        <Line key={acc.id} type="monotone" dataKey={acc.name} name={acc.name}
                          stroke={acc.color} strokeWidth={2} dot={{ fill: acc.color, r: 3 }} />
                      ))}
                      {hasPortfolioData && (
                        <Line type="monotone" dataKey="Portfolio" name="Portfolio"
                          stroke="#6366f1" strokeWidth={2} dot={{ fill: '#6366f1', r: 3 }} />
                      )}
                      <Line type="monotone" dataKey="Total" name="Total"
                        stroke="#ffffff" strokeWidth={2} strokeDasharray="4 2" dot={{ fill: '#ffffff', r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* Balance distribution pie */}
                {slices.length > 0 && (
                  <div className="w-44 flex-shrink-0 flex flex-col justify-center gap-4">
                    <ResponsiveContainer width="100%" height={140}>
                      <PieChart>
                        <Pie data={slices} dataKey="value" nameKey="name"
                          cx="50%" cy="50%" innerRadius={38} outerRadius={62} strokeWidth={0} />
                        <Tooltip content={<PieTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="space-y-2">
                      {slices.map(s => (
                        <div key={s.name} className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.fill }} />
                            <span className="text-secondary truncate">{s.name}</span>
                          </div>
                          <span className="text-white tabular-nums ml-2 flex-shrink-0">
                            {pieTotal > 0 ? ((s.value / pieTotal) * 100).toFixed(1) : 0}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* Category analysis */}
        <div className="bg-surface border border-white/10 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[11px] font-semibold text-secondary uppercase tracking-widest">Category analysis</h3>
            <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
              className="bg-elevated border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-primary/50">
              {ALL_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <p className="text-xs text-muted uppercase tracking-widest mb-3">Income vs Expenses</p>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={catMonthly} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: '#3d5a78', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#3d5a78', fontSize: 11 }} axisLine={false} tickLine={false} width={55} tickFormatter={fmtEur} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12, color: '#7a95b2' }} />
                  <Bar dataKey="income" name="Income" fill="#00c896" radius={[4,4,0,0]} />
                  <Bar dataKey="expenses" name="Expenses" fill="#ff5c5c" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div>
              <p className="text-xs text-muted uppercase tracking-widest mb-3">Balance evolution</p>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={catMonthly.map(m => ({ ...m, balance: m.income - m.expenses }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: '#3d5a78', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#3d5a78', fontSize: 11 }} axisLine={false} tickLine={false} width={55} tickFormatter={fmtEur} />
                  <Tooltip content={<ChartTooltip />} />
                  <Line type="monotone" dataKey="balance" name="Balance" stroke="#3d9eff" strokeWidth={2} dot={{ fill: '#3d9eff', r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Category breakdown */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-surface border border-white/10 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[11px] font-semibold text-secondary uppercase tracking-widest">Expenses by category</h3>
              <select value={selectedYM} onChange={e => setSelectedYM(e.target.value)}
                className="bg-elevated border border-white/10 rounded-lg px-2 py-1 text-xs text-white focus:outline-none">
                {availableMonths.map(m => (
                  <option key={`${m.year}-${m.month}`} value={`${m.year}-${m.month}`}>{m.label}</option>
                ))}
              </select>
            </div>
            {pieData.length ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" outerRadius={80} dataKey="value" nameKey="name" paddingAngle={3}>
                    {pieData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                  </Pie>
                  <Tooltip content={<PieTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11, color: '#7a95b2' }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-muted text-sm">No expense data.</div>
            )}
          </div>

          <div className="bg-surface border border-white/10 rounded-xl p-5">
            <h3 className="text-[11px] font-semibold text-secondary uppercase tracking-widest mb-4">Category breakdown</h3>
            {pieData.length ? (
              <ul className="space-y-3 overflow-y-auto custom-scrollbar" style={{ maxHeight: 260 }}>
                {pieData.map((item, i) => {
                  const pct = summary?.expenses > 0 ? Math.round((item.value / summary.expenses) * 100) : 0;
                  return (
                    <li key={item.name}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-white">{item.name}</span>
                        <span><span className="text-secondary private">€{item.value.toFixed(0)}</span><span className="text-muted"> ({pct}%)</span></span>
                      </div>
                      <div className="h-1.5 bg-white/[0.06] rounded-full">
                        <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: item.fill }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-muted text-sm">No expense data for this month.</p>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
