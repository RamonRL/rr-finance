import { useState, useEffect, useMemo } from 'react';
import { useStore } from '../hooks/useStore';
import { getStore } from '../api/store';
import {
  AreaChart, Area, BarChart, Bar,
  PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
  Legend, CartesianGrid,
} from 'recharts';

// ── Storage ───────────────────────────────────────────────────────────────────
const PRED_KEY       = 'rr-predictions-config';
const SNAPSHOTS_KEY  = 'rr-savings-snapshots';
const DCA_KEY        = 'rr-finance-dca-contributions';
const EVO_KEY        = 'rr-finance-evolution-data';
const DCA_START      = '2026-02';

import { API_URL } from '../constants';


// ── Formatters ────────────────────────────────────────────────────────────────
const fmtEur = (v) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v ?? 0);
const fmtEur2 = (v) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(v ?? 0);
const fmtPct = (v) => `${Number(v).toFixed(1)}%`;

// ── Default config ────────────────────────────────────────────────────────────
const DEFAULT_CONFIG = {
  brutAnnualSalary: null,
  irpfRate: 15,
  socialSecurityRate: 6.35,
  otherDeductions: 0,
  monthlySavings: null,
  monthlyInvestments: null,
  monthlyExpenses: null,
  expensesAutoCalc: true,
  investmentAnnualReturn: 7,
  savingsAnnualReturn: 2,
  projectionYears: 30,
};

// ── Pure salary calc ──────────────────────────────────────────────────────────
export function calcNetMonthly(cfg) {
  if (!cfg.brutAnnualSalary) return null;
  const gross = cfg.brutAnnualSalary / 12;
  const deductions = gross * (cfg.irpfRate / 100)
    + gross * (cfg.socialSecurityRate / 100)
    + (cfg.otherDeductions || 0);
  return gross - deductions;
}

// ── Pure projection calc ──────────────────────────────────────────────────────
export function buildProjection({ netMonthly, monthlySavings, monthlyInvestments, monthlyExpenses,
  investmentAnnualReturn, savingsAnnualReturn, projectionYears, currentSavings, currentInvestments }) {
  const invRate = (investmentAnnualReturn || 0) / 100;
  const savRate = (savingsAnnualReturn    || 0) / 100;
  const annualSavings = (monthlySavings || 0) * 12;
  const annualInvest  = (monthlyInvestments || 0) * 12;

  const rows = [];
  let savBal  = currentSavings     || 0;
  let invBal  = currentInvestments || 0;
  const invStart = invBal;
  let cumSav  = 0;
  let cumInv  = 0;

  for (let y = 0; y <= projectionYears; y++) {
    const gains    = invBal - invStart - cumInv;
    const gainsPct = (invStart + cumInv) > 0 ? (gains / (invStart + cumInv)) * 100 : 0;
    rows.push({
      year: y,
      netAnnual:      netMonthly != null ? netMonthly * 12 : null,
      netMonthly,
      annualSavings:  y === 0 ? 0 : annualSavings,
      annualInvest:   y === 0 ? 0 : annualInvest,
      annualExpenses: y === 0 ? 0 : (monthlyExpenses || 0) * 12,
      savBal,
      cumSav,
      invBal,
      cumInv,
      gains,
      gainsPct,
      netWorth: savBal + invBal,
    });
    if (y < projectionYears) {
      cumSav += annualSavings;
      savBal  = savBal * (1 + savRate) + annualSavings;
      invBal  = invBal * (1 + invRate) + annualInvest;
      cumInv += annualInvest;
    }
  }
  return rows;
}

// ── Milestones ────────────────────────────────────────────────────────────────
const MILESTONES = [100_000, 250_000, 500_000, 1_000_000, 2_000_000];
function milestoneBg(netWorth) {
  for (const m of [...MILESTONES].reverse()) {
    if (netWorth >= m) return MILESTONE_COLORS[m];
  }
  return null;
}
const MILESTONE_COLORS = {
  100_000:   'rgba(240,180,41,0.08)',
  250_000:   'rgba(99,102,241,0.10)',
  500_000:   'rgba(0,200,150,0.10)',
  1_000_000: 'rgba(236,72,153,0.12)',
  2_000_000: 'rgba(251,146,60,0.13)',
};

// ── Chart tooltip ─────────────────────────────────────────────────────────────
const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-elevated border border-white/10 rounded-lg p-3 text-sm">
      <p className="text-secondary mb-1">{label !== undefined ? `Year ${label}` : ''}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color: p.color || p.fill }}>
          {p.name}: {typeof p.value === 'number' ? fmtEur(p.value) : p.value}
        </p>
      ))}
    </div>
  );
};

// ── Input ─────────────────────────────────────────────────────────────────────
const inputCls = 'bg-elevated border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent-green/50 w-full';

function CfgInput({ label, hint, children }) {
  return (
    <div>
      <p className="text-xs text-secondary mb-1">{label}</p>
      {children}
      {hint && <p className="text-[10px] text-muted mt-0.5">{hint}</p>}
    </div>
  );
}

// ── Table row def ─────────────────────────────────────────────────────────────
const TABLE_ROWS = [
  { key: 'netMonthly',    label: 'Net monthly salary',          fmt: fmtEur2, color: () => '#ffffff',  section: 'income'       },
  { key: 'netAnnual',     label: 'Net annual salary',           fmt: fmtEur,  color: () => '#ffffff',  section: 'income'       },
  { key: 'annualSavings', label: 'Annual savings contribution', fmt: fmtEur,  color: () => '#f0b429',  section: 'allocation'   },
  { key: 'annualInvest',  label: 'Annual investments',          fmt: fmtEur,  color: () => '#6366f1',  section: 'allocation'   },
  { key: 'annualExpenses',label: 'Annual expenses',             fmt: fmtEur,  color: () => '#7a95b2',  section: 'allocation'   },
  { key: 'savBal',        label: 'Savings balance',             fmt: fmtEur,  color: () => '#f0b429',  section: 'savings'      },
  { key: 'cumSav',        label: 'Cumulative savings added',    fmt: fmtEur,  color: () => '#7a95b2',  section: 'savings'      },
  { key: 'invBal',        label: 'Investment portfolio value',  fmt: fmtEur,  color: (v, row) => row.year === 0 ? '#ffffff' : v > 0 ? '#00c896' : '#ff5c5c', section: 'investments' },
  { key: 'cumInv',        label: 'Cumulative investments added',fmt: fmtEur,  color: () => '#7a95b2',  section: 'investments'  },
  { key: 'gains',         label: 'Investment gains (€)',        fmt: fmtEur,  color: (v) => v > 0 ? '#00c896' : v < 0 ? '#ff5c5c' : '#7a95b2', section: 'investments' },
  { key: 'gainsPct',      label: 'Investment gains (%)',        fmt: fmtPct,  color: (v) => v > 0 ? '#00c896' : v < 0 ? '#ff5c5c' : '#7a95b2', section: 'investments' },
  { key: 'netWorth',      label: 'Total net worth',             fmt: fmtEur,  color: (v) => v > 0 ? '#00c896' : '#ff5c5c', section: 'networth', bold: true },
];

const SECTION_LABELS = { income: 'Income', allocation: 'Allocation', savings: 'Savings', investments: 'Investments', networth: 'Net Worth' };

// ── Main component ────────────────────────────────────────────────────────────
export default function PredictionsPage() {
  const [cfg, persistCfg] = useStore(PRED_KEY, DEFAULT_CONFIG);

  const updateCfg = (patch) => {
    const next = { ...DEFAULT_CONFIG, ...cfg, ...patch };
    persistCfg(next);
  };

  const num = (v) => (v === '' || v == null) ? null : parseFloat(v);

  // ── Read current savings balance from backend (same as Dashboard) ─────────
  const [currentSavings, setCurrentSavings] = useState(0);
  const [latestSnapMonth, setLatestSnapMonth] = useState(null);

  useEffect(() => {
    fetch(`${API_URL}/balances`)
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        if (Array.isArray(data)) {
          const acc = data.find(a => a.name === 'Savings');
          if (acc) setCurrentSavings(acc.balance);
        }
      }).catch(() => {});
    getStore(SNAPSHOTS_KEY, []).then(snaps => {
      if (snaps.length) {
        const latest = [...snaps].sort((a, b) => b.month.localeCompare(a.month))[0];
        setLatestSnapMonth(latest?.month ?? null);
      }
    });
  }, []);

  const [currentInvestments, setCurrentInvestments] = useState(0);
  const [latestInvMonth, setLatestInvMonth] = useState(null);

  useEffect(() => {
    Promise.all([getStore(DCA_KEY, []), getStore(EVO_KEY, {})]).then(([contributions, evData]) => {
      const dcaByAsset = {};
      contributions.filter(c => c.month >= DCA_START).forEach(c => {
        if (!dcaByAsset[c.assetName]) dcaByAsset[c.assetName] = { months: {}, participations: {} };
        const a = dcaByAsset[c.assetName];
        a.months[c.month] = (a.months[c.month] || 0) + c.amount;
        a.participations[c.month] = (a.participations[c.month] || 0) + (c.participations || 0);
      });
      const allMonths = [...new Set(contributions.filter(c => c.month >= DCA_START).map(c => c.month))].sort();
      let total = 0;
      Object.keys(dcaByAsset).forEach(name => {
        let totalN = 0, latestPrice = null;
        allMonths.forEach(m => {
          totalN += dcaByAsset[name]?.participations?.[m] || 0;
          const ev = evData[`${name}___${m}`];
          let price = null;
          if (ev?.priceIsManual && ev.priceSource !== 'refresh' && ev.price != null) price = ev.price;
          else {
            const n = dcaByAsset[name]?.participations?.[m] || 0;
            const amt = dcaByAsset[name]?.months?.[m];
            if (n > 0 && amt != null) price = amt / n;
            else if (ev?.price != null) price = ev.price;
          }
          if (price != null) latestPrice = price;
        });
        total += totalN * (latestPrice ?? 0);
      });
      setCurrentInvestments(total);
      const months = contributions.filter(c => c.month >= DCA_START).map(c => c.month).sort();
      setLatestInvMonth(months[months.length - 1] ?? null);
    });
  }, []);

  // ── Derived salary ────────────────────────────────────────────────────────
  const netMonthly = useMemo(() => calcNetMonthly(cfg), [cfg]);
  const grossMonthly = cfg.brutAnnualSalary ? cfg.brutAnnualSalary / 12 : null;
  const irpfAmt   = grossMonthly ? grossMonthly * (cfg.irpfRate / 100) : null;
  const ssAmt     = grossMonthly ? grossMonthly * (cfg.socialSecurityRate / 100) : null;

  // ── Distribution ──────────────────────────────────────────────────────────
  const monthlyExpenses = useMemo(() => {
    if (!cfg.expensesAutoCalc) return cfg.monthlyExpenses ?? 0;
    if (netMonthly == null) return null;
    return netMonthly - (cfg.monthlySavings || 0) - (cfg.monthlyInvestments || 0);
  }, [cfg, netMonthly]);

  const unallocated = useMemo(() => {
    if (netMonthly == null) return null;
    return netMonthly - (cfg.monthlySavings || 0) - (cfg.monthlyInvestments || 0) - (monthlyExpenses || 0);
  }, [netMonthly, cfg, monthlyExpenses]);

  // ── Projection ────────────────────────────────────────────────────────────
  const projection = useMemo(() => buildProjection({
    netMonthly,
    monthlySavings:      cfg.monthlySavings,
    monthlyInvestments:  cfg.monthlyInvestments,
    monthlyExpenses,
    investmentAnnualReturn: cfg.investmentAnnualReturn,
    savingsAnnualReturn:    cfg.savingsAnnualReturn,
    projectionYears:        cfg.projectionYears,
    currentSavings,
    currentInvestments,
  }), [cfg, netMonthly, monthlyExpenses, currentSavings, currentInvestments]);

  // ── Chart data ────────────────────────────────────────────────────────────
  const chart1Data = projection.map(r => ({
    year: r.year, Savings: r.savBal, Investments: r.invBal, 'Net Worth': r.netWorth,
  }));

  const chart2Data = projection.map(r => ({
    year: r.year,
    'Starting balance': r.year === 0 ? currentInvestments : currentInvestments,
    Contributions: r.cumInv,
    Gains: Math.max(0, r.gains),
  }));

  const pieData = [
    { name: 'Savings',     value: cfg.monthlySavings || 0,     fill: '#f0b429' },
    { name: 'Investments', value: cfg.monthlyInvestments || 0, fill: '#6366f1' },
    { name: 'Expenses',    value: Math.max(0, monthlyExpenses || 0), fill: '#3d9eff'  },
  ].filter(d => d.value > 0);

  const years = projection.map(r => r.year);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="h-full overflow-y-auto custom-scrollbar">
      <div className="px-6 py-6 space-y-5">

        {/* ── Config panel ────────────────────────────────────────────────── */}
        <div className="bg-surface border border-white/10 rounded-xl p-5 space-y-5">

          {/* Row 1: Salary */}
          <div>
            <p className="text-[10px] text-muted uppercase tracking-widest mb-3">Salary configuration</p>
            <div className="grid grid-cols-5 gap-4">
              <CfgInput label="Gross annual salary (€)">
                <input type="number" step="100" value={cfg.brutAnnualSalary ?? ''}
                  onChange={e => updateCfg({ brutAnnualSalary: num(e.target.value) })}
                  placeholder="e.g. 36000" className={inputCls} />
              </CfgInput>
              <CfgInput label="IRPF rate (%)">
                <input type="number" step="0.01" value={cfg.irpfRate}
                  onChange={e => updateCfg({ irpfRate: parseFloat(e.target.value) || 0 })}
                  className={inputCls} />
              </CfgInput>
              <CfgInput label="Social Security (%)">
                <input type="number" step="0.01" value={cfg.socialSecurityRate}
                  onChange={e => updateCfg({ socialSecurityRate: parseFloat(e.target.value) || 0 })}
                  className={inputCls} />
              </CfgInput>
              <CfgInput label="Other deductions (€/mo)">
                <input type="number" step="1" value={cfg.otherDeductions}
                  onChange={e => updateCfg({ otherDeductions: parseFloat(e.target.value) || 0 })}
                  className={inputCls} />
              </CfgInput>
              {/* Derived net salary */}
              <div>
                <p className="text-xs text-secondary mb-1">Net monthly salary</p>
                <div className="bg-elevated/60 border border-white/[0.06] rounded-lg px-3 py-2 text-sm space-y-0.5">
                  {netMonthly != null ? (
                    <>
                      <p className="text-accent-green font-bold text-base tabular-nums private">{fmtEur2(netMonthly)}</p>
                      <p className="text-[10px] text-muted">Gross: {fmtEur2(grossMonthly)}</p>
                      <p className="text-[10px] text-muted">− IRPF: {fmtEur2(irpfAmt)}</p>
                      <p className="text-[10px] text-muted">− SS: {fmtEur2(ssAmt)}</p>
                      {cfg.otherDeductions > 0 && <p className="text-[10px] text-muted">− Other: {fmtEur2(cfg.otherDeductions)}</p>}
                    </>
                  ) : (
                    <p className="text-muted text-sm">—</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-white/[0.06]" />

          {/* Row 2: Distribution + projection */}
          <div>
            <p className="text-[10px] text-muted uppercase tracking-widest mb-3">Distribution & projection</p>
            <div className="grid grid-cols-7 gap-4">
              <CfgInput label="Monthly savings (€)">
                <input type="number" step="10" value={cfg.monthlySavings ?? ''}
                  onChange={e => updateCfg({ monthlySavings: num(e.target.value) })}
                  placeholder="0" className={inputCls} />
              </CfgInput>
              <CfgInput label="Monthly investments (€)">
                <input type="number" step="10" value={cfg.monthlyInvestments ?? ''}
                  onChange={e => updateCfg({ monthlyInvestments: num(e.target.value) })}
                  placeholder="0" className={inputCls} />
              </CfgInput>
              <CfgInput label={
                <span className="flex items-center gap-1.5">
                  Monthly expenses (€)
                  <button
                    onClick={() => updateCfg({ expensesAutoCalc: !cfg.expensesAutoCalc })}
                    className={`text-[9px] px-1.5 py-0.5 rounded border transition-colors ${
                      cfg.expensesAutoCalc
                        ? 'border-accent-green/40 text-accent-green bg-accent-green/10'
                        : 'border-white/10 text-muted hover:text-white'
                    }`}>
                    {cfg.expensesAutoCalc ? 'auto' : 'manual'}
                  </button>
                </span>
              }>
                {cfg.expensesAutoCalc ? (
                  <div className="bg-elevated/60 border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-secondary tabular-nums private">
                    {monthlyExpenses != null ? fmtEur2(monthlyExpenses) : '—'}
                  </div>
                ) : (
                  <input type="number" step="10" value={cfg.monthlyExpenses ?? ''}
                    onChange={e => updateCfg({ monthlyExpenses: num(e.target.value) })}
                    placeholder="0" className={inputCls} />
                )}
              </CfgInput>
              <CfgInput label="Investment return (%/yr)">
                <input type="number" step="0.1" value={cfg.investmentAnnualReturn}
                  onChange={e => updateCfg({ investmentAnnualReturn: parseFloat(e.target.value) || 0 })}
                  className={inputCls} />
              </CfgInput>
              <CfgInput label="Savings return (%/yr)">
                <input type="number" step="0.1" value={cfg.savingsAnnualReturn}
                  onChange={e => updateCfg({ savingsAnnualReturn: parseFloat(e.target.value) || 0 })}
                  className={inputCls} />
              </CfgInput>
              <CfgInput label="Projection years">
                <input type="number" min="1" max="50" value={cfg.projectionYears}
                  onChange={e => updateCfg({ projectionYears: Math.min(50, Math.max(1, parseInt(e.target.value) || 30)) })}
                  className={inputCls} />
              </CfgInput>

              {/* Distribution summary */}
              <div>
                <p className="text-xs text-secondary mb-1">Allocation summary</p>
                <div className="bg-elevated/60 border border-white/[0.06] rounded-lg px-3 py-2 text-[11px] space-y-0.5">
                  {netMonthly != null ? (
                    <>
                      <p className="text-white font-medium private">{fmtEur2(netMonthly)} net</p>
                      <p className="text-accent-gold private">→ Savings: {fmtEur2(cfg.monthlySavings || 0)} ({netMonthly > 0 ? fmtPct(((cfg.monthlySavings || 0) / netMonthly) * 100) : '0%'})</p>
                      <p style={{ color: '#6366f1' }} className="private">→ Invest: {fmtEur2(cfg.monthlyInvestments || 0)} ({netMonthly > 0 ? fmtPct(((cfg.monthlyInvestments || 0) / netMonthly) * 100) : '0%'})</p>
                      <p className="text-accent-blue private">→ Expenses: {fmtEur2(monthlyExpenses || 0)} ({netMonthly > 0 ? fmtPct(((monthlyExpenses || 0) / netMonthly) * 100) : '0%'})</p>
                      {unallocated != null && Math.abs(unallocated) > 0.01 && (
                        <p style={{ color: unallocated < 0 ? '#ff5c5c' : '#00c896' }}>
                          → Unalloc: {fmtEur2(unallocated)}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-muted">Enter salary first</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-white/[0.06]" />

          {/* Current balances */}
          <div className="flex gap-6">
            <div>
              <p className="text-[10px] text-muted uppercase tracking-widest mb-1">Current savings balance</p>
              <p className="text-accent-gold font-bold tabular-nums private">{fmtEur2(currentSavings)}</p>
              {latestSnapMonth && <p className="text-[10px] text-muted">as of {latestSnapMonth}</p>}
            </div>
            <div>
              <p className="text-[10px] text-muted uppercase tracking-widest mb-1">Current investment portfolio</p>
              <p style={{ color: '#6366f1' }} className="font-bold tabular-nums private">{fmtEur2(currentInvestments)}</p>
              {latestInvMonth && <p className="text-[10px] text-muted">as of {latestInvMonth}</p>}
            </div>
            <div>
              <p className="text-[10px] text-muted uppercase tracking-widest mb-1">Combined net worth (Year 0)</p>
              <p className="text-accent-green font-bold tabular-nums private">{fmtEur2(currentSavings + currentInvestments)}</p>
            </div>
          </div>
        </div>

        {/* ── Projection table ─────────────────────────────────────────────── */}
        <div className="bg-surface border border-white/10 rounded-xl overflow-hidden">
          <div className="overflow-x-auto custom-scrollbar">
            <table
              className="border-separate border-spacing-0 text-sm"
              style={{ minWidth: `${180 + (cfg.projectionYears + 1) * 100}px` }}
            >
              <thead>
                <tr>
                  <th className="sticky left-0 z-20 bg-elevated px-4 py-3 text-left text-[10px] text-muted uppercase tracking-widest font-medium border-b border-r border-white/[0.06]"
                    style={{ width: 210, minWidth: 210 }}>
                    Metric
                  </th>
                  {years.map(y => {
                    const nw = projection[y]?.netWorth ?? 0;
                    const bg = milestoneBg(nw);
                    const isMilestone = MILESTONES.includes(
                      MILESTONES.find(m => nw >= m && (projection[y - 1]?.netWorth ?? 0) < m)
                    );
                    return (
                      <th key={y}
                        className="px-3 py-2 text-center text-[10px] text-secondary font-medium border-b border-white/[0.06] whitespace-nowrap"
                        style={{ width: 100, minWidth: 100, background: bg || undefined }}>
                        <span className={isMilestone ? 'text-accent-gold' : ''}>
                          {y === 0 ? 'Now' : `Year ${y}`}
                        </span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {(() => {
                  let lastSection = null;
                  return TABLE_ROWS.map(row => {
                    const sectionHeader = row.section !== lastSection;
                    lastSection = row.section;
                    return [
                      sectionHeader && (
                        <tr key={`sec-${row.section}`}>
                          <td colSpan={years.length + 1}
                            className="sticky left-0 px-4 py-1.5 text-[9px] text-muted uppercase tracking-widest font-semibold bg-surface/80 border-b border-white/[0.03]">
                            {SECTION_LABELS[row.section]}
                          </td>
                        </tr>
                      ),
                      <tr key={row.key} className="hover:bg-white/[0.015] transition-colors">
                        <td className={`sticky left-0 z-10 bg-surface px-4 py-2 text-secondary border-b border-r border-white/[0.04] whitespace-nowrap ${row.bold ? 'font-semibold text-white' : ''}`}>
                          {row.label}
                        </td>
                        {years.map(y => {
                          const r = projection[y];
                          const val = r?.[row.key] ?? null;
                          const nw = r?.netWorth ?? 0;
                          const bg = milestoneBg(nw);
                          const color = typeof row.color === 'function' ? row.color(val, r) : row.color;
                          return (
                            <td key={y}
                              className={`px-3 py-2 text-right tabular-nums border-b border-white/[0.04] ${row.bold ? 'font-semibold' : ''}`}
                              style={{ background: bg || undefined }}>
                              {val != null ? (
                                <span className="private" style={{ color }}>{row.fmt(val)}</span>
                              ) : (
                                <span className="text-muted">—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ];
                  });
                })()}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Charts ─────────────────────────────────────────────────────────── */}
        <div className="space-y-4">

          {/* Chart 1: Net worth over time */}
          <div className="bg-surface border border-white/10 rounded-xl p-5">
            <h3 className="text-[11px] font-semibold text-secondary uppercase tracking-widest mb-4">Net worth over time</h3>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={chart1Data}>
                <defs>
                  <linearGradient id="gSav" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#f0b429" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#f0b429" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gInv" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="year" tick={{ fill: '#3d5a78', fontSize: 11 }} axisLine={false} tickLine={false}
                  tickFormatter={v => v === 0 ? 'Now' : `Y${v}`} />
                <YAxis tick={{ fill: '#3d5a78', fontSize: 11 }} axisLine={false} tickLine={false} width={70}
                  tickFormatter={v => `€${(v / 1000).toFixed(0)}k`} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12, color: '#7a95b2' }} />
                <Area type="monotone" dataKey="Savings" stroke="#f0b429" fill="url(#gSav)" strokeWidth={2} />
                <Area type="monotone" dataKey="Investments" stroke="#6366f1" fill="url(#gInv)" strokeWidth={2} />
                <Area type="monotone" dataKey="Net Worth" stroke="#00c896" fill="none" strokeWidth={2} strokeDasharray="5 3" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Charts 2 & 3 side by side */}
          <div className="grid grid-cols-3 gap-4">

            {/* Chart 2: Investment growth breakdown */}
            <div className="col-span-2 bg-surface border border-white/10 rounded-xl p-5">
              <h3 className="text-[11px] font-semibold text-secondary uppercase tracking-widest mb-4">Investment growth breakdown</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chart2Data}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis dataKey="year" tick={{ fill: '#3d5a78', fontSize: 11 }} axisLine={false} tickLine={false}
                    tickFormatter={v => v === 0 ? 'Now' : `Y${v}`} />
                  <YAxis tick={{ fill: '#3d5a78', fontSize: 11 }} axisLine={false} tickLine={false} width={70}
                    tickFormatter={v => `€${(v / 1000).toFixed(0)}k`} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12, color: '#7a95b2' }} />
                  <Bar dataKey="Starting balance" fill="#3d5a78"  stackId="a" />
                  <Bar dataKey="Contributions"    fill="#6366f1"  stackId="a" />
                  <Bar dataKey="Gains"            fill="#00c896"  stackId="a" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Chart 3: Monthly allocation donut */}
            <div className="bg-surface border border-white/10 rounded-xl p-5 flex flex-col">
              <h3 className="text-[11px] font-semibold text-secondary uppercase tracking-widest mb-4">Monthly allocation</h3>
              {pieData.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={160}>
                    <PieChart>
                      <Pie data={pieData} dataKey="value" nameKey="name"
                        cx="50%" cy="50%" innerRadius={45} outerRadius={70} strokeWidth={0}>
                        {pieData.map((s, i) => <Cell key={i} fill={s.fill} />)}
                      </Pie>
                      <Tooltip formatter={(v) => fmtEur2(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-1.5 mt-2">
                    {pieData.map(s => {
                      const total = pieData.reduce((a, b) => a + b.value, 0);
                      return (
                        <div key={s.name} className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full" style={{ background: s.fill }} />
                            <span className="text-secondary">{s.name}</span>
                          </div>
                          <span className="text-white tabular-nums private">
                            {fmtEur2(s.value)} ({total > 0 ? fmtPct((s.value / total) * 100) : '0%'})
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-muted text-sm">
                  Configure distribution to see allocation
                </div>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
