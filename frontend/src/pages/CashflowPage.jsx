import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useStore } from '../hooks/useStore';
import { NavLink, Routes, Route, Navigate } from 'react-router-dom';
import { IconPencil } from '../components/icons';
import {
  ComposedChart, BarChart, Bar, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
  CartesianGrid, Cell, ReferenceLine,
} from 'recharts';
import { API_URL } from '../constants';
import PredictionsPage from './PredictionsPage';

// ── Constants ─────────────────────────────────────────────────────────────────
const CASHFLOW_KEY  = 'rr-cashflow-data';
const SAVINGS_ACCT  = 3;
const PERSONAL_ACCT = 1;
const START_MONTH   = '2026-01';

// March 2026 was a month of heavy one-off money moves. Its values still count
// towards totals, but they distort most averages badly enough to make them
// useless, so averages skip it. The exempt rows below were not distorted that
// month — common and subscriptions ran at their usual level, and one outlier
// barely moves remaining — so dropping March there would hide a real result.
const AVG_EXCLUDED = new Set(['2026-03']);
const AVG_EXCLUDED_EXEMPT = new Set(['common', 'subscriptions', 'remaining']);

// A parsed month with nothing put aside is a real zero, not missing data, so it
// has to pull these averages down. Months never parsed stay unknown and are
// skipped instead — see readValue.
const ZERO_FILLED = new Set(['savings', 'investments']);

// Same month dwarfs every other bar in the stacked breakdown, flattening the
// rest of the year into an unreadable strip.
const CHART_EXCLUDED = new Set(['2026-03']);

const FIELDS = ['salary', 'savings', 'investments', 'common', 'subscriptions', 'otherWastes'];

const ROWS = [
  { key: 'salary',        label: 'Salary',        editable: true,  agg: 'avg'       },
  { key: 'savings',       label: 'Savings',        editable: true,  agg: 'total+avg' },
  { key: 'investments',   label: 'Investments',    editable: true,  agg: 'total+avg' },
  { key: 'common',        label: 'Common',         editable: true,  agg: 'avg'       },
  { key: 'subscriptions', label: 'Subscriptions',  editable: true,  agg: 'avg'       },
  { key: 'otherWastes',   label: 'Other wastes',   editable: true,  agg: 'avg'       },
  { key: 'remaining',     label: 'Remaining',      editable: false, agg: 'avg'       },
];

// Percentages are shares of that month's income, so a running total means
// nothing — every row aggregates as an average. "Other wastes" is left out
// because it swings too wildly to read as a share.
const PCT_ROWS = ROWS
  .filter(r => r.key !== 'otherWastes')
  .map(r => ({ ...r, editable: false, agg: 'avg' }));

const CLR = {
  salary: '#00c896', savings: '#f0b429', investments: '#6366f1',
  common: '#3d9eff', subscriptions: '#ec4899', otherWastes: '#ff5c5c', remaining: '#ffffff',
};

// Rows shown as a share of income: salary reads as good, money leaving reads as
// spend, and remaining flips with its sign.
const PCT_TONE = {
  salary: 'good', savings: 'spend', investments: 'spend',
  common: 'spend', subscriptions: 'spend', remaining: 'signed',
};

// ── Formatters ────────────────────────────────────────────────────────────────
const fmtEur = (v) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(v ?? 0);

const fmtPct = (v) => (v == null ? '—' : `${v.toFixed(1)}%`);

const toMonthLabel = (ym) => {
  if (!ym) return '';
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
};

const toMonthShort = (ym) => {
  if (!ym) return '';
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
};

// ── Pure parsing functions ────────────────────────────────────────────────────
export function parseTxns(transactions, transfers) {
  const used = new Set();

  // Salary: every payroll credit in the month, added up. It used to take the
  // largest one, which silently dropped a second payslip — e.g. July 2026, with
  // a final settlement from the old employer plus the new employer's payroll.
  const salaryTxs = transactions.filter(t => {
    if (t.type !== 'income') return false;
    const d = t.description.toLowerCase();
    return d.includes('nómina') || d.includes('nomina') || d.includes('finiquito');
  });
  const salary = salaryTxs.length ? salaryTxs.reduce((s, t) => s + t.amount, 0) : null;
  salaryTxs.forEach(t => used.add(t.id));

  // Savings: transfers to Savings account this month
  const savingsTotal = transfers
    .filter(t => t.to_account_id === SAVINGS_ACCT)
    .reduce((s, t) => s + t.amount, 0);
  const savings = savingsTotal > 0 ? savingsTotal : null;

  // Investments: "ingreso myinvestor" or "ingreso kraken"
  const investTxs = transactions.filter(t => {
    const d = t.description.toLowerCase();
    return d.includes('ingreso myinvestor') || d.includes('ingreso kraken');
  });
  const investments = investTxs.length ? investTxs.reduce((s, t) => s + t.amount, 0) : null;
  investTxs.forEach(t => used.add(t.id));

  // Common: "traspaso a común"
  const commonTxs = transactions.filter(t => t.description.toLowerCase().includes('traspaso a común'));
  const common = commonTxs.length ? commonTxs.reduce((s, t) => s + t.amount, 0) : null;
  commonTxs.forEach(t => used.add(t.id));

  // Subscriptions: category "Subscriptions" or description contains "Escola de Música", expense type
  const subTxs = transactions.filter(t =>
    t.type === 'expense' &&
    (t.category === 'Subscriptions' || t.description.toLowerCase().includes('escola de música'))
  );
  const subscriptions = subTxs.length ? subTxs.reduce((s, t) => s + t.amount, 0) : null;
  subTxs.forEach(t => used.add(t.id));

  // Other wastes: all remaining — expenses positive, income negative
  const restTxs = transactions.filter(t => !used.has(t.id));
  const otherWastes = restTxs.length
    ? restTxs.reduce((s, t) => s + (t.type === 'expense' ? t.amount : -t.amount), 0)
    : null;

  // Every euro that came in this month — the denominator for the share view.
  // Not just salary: bizums received, refunds and gifts all count as income.
  const incomeTotal = transactions
    .filter(t => t.type === 'income')
    .reduce((s, t) => s + t.amount, 0);

  return {
    salary, savings, investments, common, subscriptions, otherWastes,
    income: incomeTotal > 0 ? incomeTotal : null,
  };
}

export function computeRemaining(rec) {
  if (!rec || rec.salary == null) return null;
  return rec.salary
    - (rec.savings       ?? 0)
    - (rec.investments   ?? 0)
    - (rec.common        ?? 0)
    - (rec.subscriptions ?? 0)
    - (rec.otherWastes   ?? 0);
}

function emptyRecord(month) {
  return {
    month, salary: null, savings: null, investments: null,
    common: null, subscriptions: null, otherWastes: null, income: null,
    overrides: { salary: false, savings: false, investments: false, common: false, subscriptions: false, otherWastes: false },
  };
}

// Merge parsed values into an existing record, respecting manual overrides
function applyParsed(existing, parsed) {
  const base = existing
    ? { ...emptyRecord(existing.month ?? ''), ...existing, overrides: { ...emptyRecord('').overrides, ...(existing.overrides ?? {}) } }
    : emptyRecord('');
  const next = { ...base };
  FIELDS.forEach(f => { if (!base.overrides[f]) next[f] = parsed[f] ?? null; });
  // Income is the denominator of the share view, always taken from the ledger
  next.income = parsed.income ?? null;
  return next;
}

/**
 * The single way to read one row's value for a month, so the cell, the average,
 * the total, the share and the charts can never disagree.
 *
 * Returns null for genuinely unknown values — a month that was never parsed —
 * and callers skip those. Rows in ZERO_FILLED read as 0 once the month has been
 * parsed, since "nothing set aside" is a real result that should weigh on the
 * average rather than vanish from it.
 */
export function readValue(rec, key) {
  if (key === 'remaining') return computeRemaining(rec);
  const val = rec?.[key] ?? null;
  if (val == null && ZERO_FILLED.has(key)) return rec ? 0 : null;
  return val;
}

/** Share of a month's income taken by one row. Null when income is unknown. */
export function computeShare(rec, key) {
  const income = rec?.income;
  if (!income) return null;
  const val = readValue(rec, key);
  return val == null ? null : (val / income) * 100;
}

// ── Chart tooltip ─────────────────────────────────────────────────────────────
const ChartTooltip = ({ active, payload, label, fmt = fmtEur }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-elevated border border-white/10 rounded-lg p-3 text-sm">
      <p className="text-secondary mb-1">{label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color: p.color || p.fill }}>
          {p.name}: {fmt(p.value)}
        </p>
      ))}
    </div>
  );
};

// ── Breakdown table ───────────────────────────────────────────────────────────
/**
 * The month-by-month grid, driven entirely by callbacks so the amounts view and
 * the share-of-income view render from the same markup. Editing is opt-in:
 * omit `edit` and every cell is read-only, as the share view needs.
 */
function BreakdownTable({ rows, months, getValue, format, colorFor, agg, onReparse, edit }) {
  return (
    <div className="bg-surface border border-white/10 rounded-xl overflow-hidden">
      <div className="overflow-x-auto custom-scrollbar">
        <table className="border-separate border-spacing-0"
          style={{ minWidth: `${140 + months.length * 110 + 110}px` }}>
          <thead>
            <tr>
              <th className="sticky left-0 z-20 bg-elevated px-4 py-3 text-left text-[10px] text-muted uppercase tracking-widest font-medium border-b border-r border-white/[0.06]"
                style={{ width: 140, minWidth: 140 }}>
                Category
              </th>

              {months.map(month => (
                <th key={month}
                  className="px-3 py-3 bg-surface text-center text-[10px] text-secondary uppercase tracking-widest font-medium border-b border-white/[0.06]"
                  style={{ width: 110, minWidth: 110 }}>
                  <div className="flex items-center justify-center gap-1.5">
                    <span className={AVG_EXCLUDED.has(month) ? 'text-accent-gold' : ''}
                      title={AVG_EXCLUDED.has(month) ? 'Excluded from averages' : undefined}>
                      {toMonthShort(month)}
                    </span>
                    {AVG_EXCLUDED.has(month) && (
                      <span className="text-accent-gold/70 text-[9px] leading-none" title="Excluded from averages">*</span>
                    )}
                    <button onClick={() => onReparse(month)} title="Re-parse this month"
                      className="text-muted hover:text-accent-green transition-colors flex-shrink-0">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="1 4 1 10 7 10"/>
                        <path d="M3.51 15a9 9 0 1 0 .49-3.1"/>
                      </svg>
                    </button>
                  </div>
                </th>
              ))}

              <th className="sticky right-0 z-20 bg-elevated px-4 py-3 text-right text-[10px] text-muted uppercase tracking-widest font-medium border-b border-l border-white/[0.06]"
                style={{ width: 110, minWidth: 110 }}>
                {rows.some(r => r.agg !== 'avg') ? 'Avg / Total' : 'Average'}
              </th>
            </tr>
          </thead>

          <tbody>
            {rows.map(row => (
              <tr key={row.key} className="hover:bg-white/[0.015] transition-colors">
                <td className="sticky left-0 z-10 bg-surface px-4 py-2.5 text-sm font-medium text-secondary border-b border-r border-white/[0.06] whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ background: CLR[row.key] ?? '#7a95b2' }} />
                    {row.label}
                  </div>
                </td>

                {months.map(month => {
                  const val = getValue(month, row.key);
                  const editable = Boolean(edit) && row.editable;
                  const isEditing = editable
                    && edit.cell?.month === month && edit.cell?.field === row.key;

                  return (
                    <td key={month}
                      className={`px-3 py-2.5 text-right text-sm tabular-nums border-b border-white/[0.04]
                        ${editable ? 'cursor-pointer hover:bg-accent-green/[0.04]' : ''}`}
                      onClick={() => { if (!editable || isEditing) return; edit.start(month, row.key, val); }}>
                      {isEditing ? (
                        <input autoFocus type="number" step="0.01" value={edit.value}
                          onChange={e => edit.setValue(e.target.value)}
                          onKeyDown={edit.onKeyDown}
                          onBlur={edit.onBlur}
                          className="w-24 bg-elevated border border-accent-green/50 rounded px-2 py-0.5 text-sm text-white text-right focus:outline-none" />
                      ) : (
                        <span className={`${colorFor(row.key, val)} private`}>
                          {format(val, row.key)}
                          {editable && edit.isOverride(month, row.key) && (
                            <span className="ml-1 inline-flex align-middle opacity-50"><IconPencil size={10} /></span>
                          )}
                        </span>
                      )}
                    </td>
                  );
                })}

                <td className="sticky right-0 z-10 bg-surface px-4 py-2.5 text-right text-sm tabular-nums border-b border-l border-white/[0.06]">
                  {(() => {
                    const { total, avg } = agg[row.key] ?? { total: null, avg: null };
                    const avgColor = row.key === 'remaining' && avg != null
                      ? (avg >= 0 ? 'text-accent-green' : 'text-red-400')
                      : 'text-secondary';

                    if (row.agg === 'avg') {
                      return <span className={`${avgColor} private`}>{format(avg, row.key)}</span>;
                    }
                    if (row.agg === 'total') {
                      return <span className="text-secondary private">{format(total, row.key)}</span>;
                    }
                    return (
                      <div>
                        <div className="text-secondary private">{format(total, row.key)}</div>
                        {avg != null && (
                          <div className="text-[10px] text-muted private">{format(avg, row.key)}</div>
                        )}
                      </div>
                    );
                  })()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
function MonthlyPage() {
  const [cashflow, setCashflow]         = useStore(CASHFLOW_KEY, {});
  const [apiMonths, setApiMonths]       = useState([]);
  const [selMonth, setSelMonth]         = useState('');
  const [parsing, setParsing]           = useState(false);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [editCell, setEditCell]         = useState(null); // { month, field }
  const [editVal, setEditVal]           = useState('');
  const [view, setView]                 = useState('amounts'); // amounts | percentages
  const escRef = useRef(false);

  const persist = useCallback((next) => { setCashflow(next); }, [setCashflow]);

  // Fetch available months from Personal account
  useEffect(() => {
    fetch(`${API_URL}/available-months?account_id=${PERSONAL_ACCT}`)
      .then(r => r.ok ? r.json() : [])
      .then(d => { if (Array.isArray(d)) setApiMonths(d); })
      .catch(() => {});
  }, []);

  // Union of API months + cashflow store months, filtered >= START_MONTH
  const allMonths = useMemo(() => {
    const api = apiMonths.map(m => `${m.year}-${String(m.month).padStart(2, '0')}`);
    const cf  = Object.keys(cashflow);
    return [...new Set([...api, ...cf])].filter(m => m >= START_MONTH).sort();
  }, [apiMonths, cashflow]);

  // Default selected month to latest
  useEffect(() => {
    if (!selMonth && allMonths.length) setSelMonth(allMonths[allMonths.length - 1]);
  }, [allMonths, selMonth]);

  // ── Fetch transactions + transfers for a month and parse ──────────────────
  const fetchMonth = useCallback(async (month) => {
    const [y, m] = month.split('-').map(Number);
    const [txRes, trRes] = await Promise.all([
      fetch(`${API_URL}/transactions?account_id=${PERSONAL_ACCT}&year=${y}&month=${m}`),
      fetch(`${API_URL}/transfers`),
    ]);
    const txns   = txRes.ok ? await txRes.json() : [];
    const allTrs = trRes.ok ? await trRes.json() : [];
    const trs = (Array.isArray(allTrs) ? allTrs : []).filter(t => {
      const d = new Date(t.date + 'T00:00:00');
      return d.getFullYear() === y && d.getMonth() + 1 === m;
    });
    return parseTxns(Array.isArray(txns) ? txns : [], trs);
  }, []);

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleParseMonth = async () => {
    if (!selMonth || parsing) return;
    setParsing(true);
    try {
      const parsed = await fetchMonth(selMonth);
      persist({ ...cashflow, [selMonth]: applyParsed(cashflow[selMonth], parsed) });
    } finally { setParsing(false); }
  };

  const handleParseAll = async () => {
    if (parsing || !allMonths.length) return;
    setParsing(true);
    try {
      const next = { ...cashflow };
      for (const month of allMonths) {
        const parsed = await fetchMonth(month);
        next[month] = applyParsed(next[month], parsed);
      }
      persist(next);
    } finally { setParsing(false); }
  };

  const handleReparse = async (month) => {
    const parsed = await fetchMonth(month);
    persist({ ...cashflow, [month]: applyParsed(cashflow[month], parsed) });
  };

  const handleClearOverrides = () => {
    if (!selMonth) return;
    const base = cashflow[selMonth] ?? emptyRecord(selMonth);
    persist({
      ...cashflow,
      [selMonth]: {
        ...base,
        overrides: { salary: false, savings: false, investments: false, common: false, subscriptions: false, otherWastes: false },
      },
    });
    setClearConfirm(false);
  };

  // ── Inline editing ────────────────────────────────────────────────────────
  const startEdit = (month, field, val) => {
    setEditCell({ month, field });
    setEditVal(val != null ? String(val) : '');
    escRef.current = false;
  };

  const saveEdit = () => {
    if (!editCell) return;
    const { month, field } = editCell;
    const raw = editVal.trim();
    const val = raw === '' ? null : parseFloat(raw);
    const base = cashflow[month] ?? emptyRecord(month);
    persist({
      ...cashflow,
      [month]: { ...base, [field]: isNaN(val) ? null : val, overrides: { ...base.overrides, [field]: true } },
    });
    setEditCell(null);
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter')  { e.preventDefault(); saveEdit(); }
    if (e.key === 'Escape') { escRef.current = true; setEditCell(null); }
  };

  const onBlur = () => {
    if (escRef.current) { escRef.current = false; return; }
    saveEdit();
  };

  // ── Aggregation helpers ───────────────────────────────────────────────────
  const mean = (arr) => {
    const n = arr.filter(v => v != null);
    return n.length ? n.reduce((s, v) => s + v, 0) / n.length : null;
  };
  const total = (arr) => {
    const n = arr.filter(v => v != null);
    return n.length ? n.reduce((s, v) => s + v, 0) : null;
  };

  // Months an average is allowed to see, per row
  const avgMonthsFor = useCallback((key) =>
    AVG_EXCLUDED_EXEMPT.has(key)
      ? allMonths
      : allMonths.filter(m => !AVG_EXCLUDED.has(m)),
  [allMonths]);

  // ── Summary stats ─────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const avgAmount = (key) => mean(avgMonthsFor(key).map(m => readValue(cashflow[m], key)));
    const avgShare  = (key) => mean(avgMonthsFor(key).map(m => computeShare(cashflow[m], key)));

    return {
      avgSalary:      avgAmount('salary'),
      avgSavings:     avgAmount('savings'),
      avgInvestments: avgAmount('investments'),
      avgRemaining:   avgAmount('remaining'),
      // Totals deliberately span every month, March included
      totalSaved:     total(allMonths.map(m => readValue(cashflow[m], 'savings'))) ?? 0,
      totalInvested:  total(allMonths.map(m => readValue(cashflow[m], 'investments'))) ?? 0,
      avgSalaryPct:      avgShare('salary'),
      avgSavingsPct:     avgShare('savings'),
      avgInvestmentsPct: avgShare('investments'),
      avgRemainingPct:   avgShare('remaining'),
    };
  }, [cashflow, allMonths, avgMonthsFor]);

  // ── Per-row agg values ────────────────────────────────────────────────────
  const amountAgg = useMemo(() => {
    const out = {};
    ROWS.forEach(row => {
      out[row.key] = {
        total: total(allMonths.map(m => readValue(cashflow[m], row.key))) ?? 0,
        avg:   mean(avgMonthsFor(row.key).map(m => readValue(cashflow[m], row.key))),
      };
    });
    return out;
  }, [cashflow, allMonths, avgMonthsFor]);

  const shareAgg = useMemo(() => {
    const out = {};
    PCT_ROWS.forEach(row => {
      out[row.key] = {
        total: null,
        avg: mean(avgMonthsFor(row.key).map(m => computeShare(cashflow[m], row.key))),
      };
    });
    return out;
  }, [cashflow, allMonths, avgMonthsFor]);

  // ── Chart data ────────────────────────────────────────────────────────────
  const chartData = useMemo(() =>
    allMonths.map(month => {
      const r = cashflow[month];
      return {
        key:           month,
        month:         toMonthShort(month),
        salary:        readValue(r, 'salary')        ?? 0,
        savings:       readValue(r, 'savings')       ?? 0,
        investments:   readValue(r, 'investments')   ?? 0,
        common:        readValue(r, 'common')        ?? 0,
        subscriptions: readValue(r, 'subscriptions') ?? 0,
        otherWastes:   Math.max(0, readValue(r, 'otherWastes') ?? 0),
        remaining:     computeRemaining(r) ?? 0,
        remainingPct:  computeShare(r, 'remaining') ?? 0,
      };
    }),
  [cashflow, allMonths]);

  // The stacked breakdown drops the outlier month so the rest stays readable
  const breakdownData = useMemo(
    () => chartData.filter(d => !CHART_EXCLUDED.has(d.key)),
    [chartData],
  );

  // ── Cell helpers ──────────────────────────────────────────────────────────
  const getCellVal = (month, key) => readValue(cashflow[month], key);

  const getShareVal = (month, key) => computeShare(cashflow[month], key);

  const cellColor = (key, val) => {
    if (val == null) return 'text-muted';
    if (key === 'remaining')  return val >= 0 ? 'text-accent-green' : 'text-red-400';
    if (key === 'otherWastes') return val < 0 ? 'text-accent-green' : val > 0 ? 'text-red-400' : 'text-white';
    return 'text-white';
  };

  const shareColor = (key, val) => {
    if (val == null) return 'text-muted';
    const tone = PCT_TONE[key];
    if (tone === 'good')  return 'text-accent-green';
    if (tone === 'spend') return 'text-red-400';
    return val >= 0 ? 'text-accent-green' : 'text-red-400';
  };

  const isOverride = (month, f) => cashflow[month]?.overrides?.[f] === true;

  const editApi = {
    cell: editCell,
    value: editVal,
    setValue: setEditVal,
    start: startEdit,
    onKeyDown,
    onBlur,
    isOverride,
  };

  const isPct = view === 'percentages';

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="h-full overflow-y-auto custom-scrollbar">
      <div className="px-3 md:px-6 py-3 md:py-6 space-y-4 md:space-y-5">

        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg md:text-xl font-bold text-white">Cashflow</h2>

          {/* Amounts ⇄ share of income */}
          <div className="flex gap-1 bg-white/[0.03] rounded-lg p-1 w-fit">
            {[
              { id: 'amounts',     label: 'Amounts'   },
              { id: 'percentages', label: '% of income' },
            ].map(({ id, label }) => (
              <button key={id} onClick={() => setView(id)}
                className={`px-3 md:px-4 py-1.5 rounded-md text-xs md:text-sm font-medium transition-colors whitespace-nowrap ${
                  view === id ? 'bg-accent-green/15 text-accent-green' : 'text-secondary hover:text-white'
                }`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Parse controls ─────────────────────────────────────────────── */}
        <div className="bg-surface border border-white/10 rounded-xl p-3 md:p-4 flex flex-wrap items-center gap-2 md:gap-3">
          <select
            value={selMonth}
            onChange={e => { setSelMonth(e.target.value); setClearConfirm(false); }}
            className="bg-elevated border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent-green/50"
          >
            {allMonths.length === 0 && <option value="">No months available</option>}
            {allMonths.map(m => <option key={m} value={m}>{toMonthLabel(m)}</option>)}
          </select>

          <button
            onClick={handleParseMonth}
            disabled={!selMonth || parsing}
            className="px-4 py-2 bg-accent-green/10 border border-accent-green/30 text-accent-green text-sm font-medium rounded-lg hover:bg-accent-green/20 disabled:opacity-40 transition-colors"
          >
            {parsing ? 'Parsing…' : 'Parse month'}
          </button>

          <button
            onClick={handleParseAll}
            disabled={parsing || !allMonths.length}
            className="px-4 py-2 bg-accent-blue/10 border border-accent-blue/30 text-accent-blue text-sm font-medium rounded-lg hover:bg-accent-blue/20 disabled:opacity-40 transition-colors"
          >
            Parse all months
          </button>

          {!clearConfirm ? (
            <button
              onClick={() => setClearConfirm(true)}
              disabled={!selMonth}
              className="px-4 py-2 bg-white/[0.04] border border-white/10 text-secondary text-sm font-medium rounded-lg hover:bg-white/[0.07] disabled:opacity-40 transition-colors"
            >
              Clear overrides
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs text-accent-gold">Clear overrides for {toMonthLabel(selMonth)}?</span>
              <button
                onClick={handleClearOverrides}
                className="px-3 py-1.5 bg-accent-gold/10 border border-accent-gold/30 text-accent-gold text-xs font-medium rounded-lg hover:bg-accent-gold/20 transition-colors"
              >
                Confirm
              </button>
              <button
                onClick={() => setClearConfirm(false)}
                className="px-3 py-1.5 border border-white/10 text-secondary text-xs rounded-lg hover:bg-white/[0.04] transition-colors"
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        {/* ── Summary cards ──────────────────────────────────────────────── */}
        <div className={`grid grid-cols-2 sm:grid-cols-3 gap-2 md:gap-3 ${isPct ? 'md:grid-cols-4' : 'md:grid-cols-6'}`}>
          {(isPct
            ? [
                { label: 'Avg salary share',    value: stats.avgSalaryPct,      color: 'text-accent-green' },
                { label: 'Avg saved share',     value: stats.avgSavingsPct,     color: 'text-red-400'      },
                { label: 'Avg invested share',  value: stats.avgInvestmentsPct, color: 'text-red-400'      },
                {
                  label: 'Avg remaining share',
                  value: stats.avgRemainingPct,
                  color: stats.avgRemainingPct != null && stats.avgRemainingPct >= 0 ? 'text-accent-green' : 'text-red-400',
                },
              ].map(c => ({ ...c, text: fmtPct(c.value) }))
            : [
                { label: 'Avg monthly salary',   value: stats.avgSalary,      color: 'text-white'       },
                { label: 'Avg monthly savings',  value: stats.avgSavings,     color: 'text-accent-gold' },
                { label: 'Avg monthly invested', value: stats.avgInvestments, color: 'text-purple-400'  },
                {
                  label: 'Avg remaining',
                  value: stats.avgRemaining,
                  color: stats.avgRemaining != null && stats.avgRemaining >= 0 ? 'text-accent-green' : 'text-red-400',
                },
                { label: 'Total saved',     value: stats.totalSaved,     color: 'text-accent-gold' },
                { label: 'Total invested',  value: stats.totalInvested,  color: 'text-purple-400'  },
              ].map(c => ({ ...c, text: c.value != null ? fmtEur(c.value) : '—' }))
          ).map(({ label, text, color }) => (
            <div key={label} className="bg-surface border border-white/10 rounded-xl p-3 md:p-4 min-w-0">
              <p className="text-[10px] text-muted uppercase tracking-widest mb-1 leading-tight truncate">{label}</p>
              <p className={`text-sm md:text-base font-bold tabular-nums private truncate ${color}`}>{text}</p>
            </div>
          ))}
        </div>

        <p className="text-[11px] text-muted">
          <span className="text-accent-gold">{toMonthShort('2026-03')}*</span> was a month of one-off money
          moves, so it is left out of the averages for salary, savings, investments and other wastes, and out
          of the stacked breakdown chart. It still counts towards Total saved and Total invested, and towards
          the averages for common, subscriptions and remaining, which it did not distort.
        </p>

        {/* ── Table ──────────────────────────────────────────────────────── */}
        {allMonths.length > 0 ? (
          isPct ? (
            <BreakdownTable
              rows={PCT_ROWS}
              months={allMonths}
              getValue={getShareVal}
              format={fmtPct}
              colorFor={shareColor}
              agg={shareAgg}
              onReparse={handleReparse}
            />
          ) : (
            <BreakdownTable
              rows={ROWS}
              months={allMonths}
              getValue={getCellVal}
              format={(v) => (v != null ? fmtEur(v) : '—')}
              colorFor={cellColor}
              agg={amountAgg}
              onReparse={handleReparse}
              edit={editApi}
            />
          )
        ) : (
          <div className="bg-surface border border-white/10 rounded-xl p-10 text-center text-muted text-sm">
            No data yet — select a month and click "Parse month" to get started.
          </div>
        )}

        {/* ── Charts ─────────────────────────────────────────────────────── */}
        {chartData.length > 0 && (
          <div className="space-y-4">

            {/* Chart 1: Stacked breakdown + salary line */}
            <div className="bg-surface border border-white/10 rounded-xl p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
                <h3 className="text-[11px] font-semibold text-secondary uppercase tracking-widest">Monthly breakdown</h3>
                <span className="text-[10px] text-muted">{toMonthShort('2026-03')} omitted — it dwarfs every other month</span>
              </div>
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={breakdownData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis dataKey="month" tick={{ fill: '#3d5a78', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#3d5a78', fontSize: 11 }} axisLine={false} tickLine={false} width={65}
                    tickFormatter={v => `€${v.toFixed(0)}`} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12, color: '#7a95b2' }} />
                  <Bar dataKey="savings"       name="Savings"       fill={CLR.savings}       stackId="s" />
                  <Bar dataKey="investments"   name="Investments"   fill={CLR.investments}   stackId="s" />
                  <Bar dataKey="common"        name="Common"        fill={CLR.common}        stackId="s" />
                  <Bar dataKey="subscriptions" name="Subscriptions" fill={CLR.subscriptions} stackId="s" />
                  <Bar dataKey="otherWastes"   name="Other wastes"  fill={CLR.otherWastes}   stackId="s" radius={[4, 4, 0, 0]} />
                  <Line type="monotone" dataKey="salary" name="Salary"
                    stroke={CLR.salary} strokeWidth={2} dot={{ fill: CLR.salary, r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* Chart 2: Remaining per month — amounts or share of income */}
            <div className="bg-surface border border-white/10 rounded-xl p-5">
              <h3 className="text-[11px] font-semibold text-secondary uppercase tracking-widest mb-4">
                Remaining over time{isPct && ' (% of income)'}
              </h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis dataKey="month" tick={{ fill: '#3d5a78', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#3d5a78', fontSize: 11 }} axisLine={false} tickLine={false} width={65}
                    tickFormatter={v => (isPct ? `${v.toFixed(0)}%` : `€${v.toFixed(0)}`)} />
                  <Tooltip content={<ChartTooltip fmt={isPct ? fmtPct : fmtEur} />} />
                  <ReferenceLine y={0} stroke="rgba(255,255,255,0.25)" strokeWidth={1} />
                  <Bar dataKey={isPct ? 'remainingPct' : 'remaining'} name="Remaining" radius={[4, 4, 0, 0]}>
                    {chartData.map((entry, i) => (
                      <Cell key={i}
                        fill={(isPct ? entry.remainingPct : entry.remaining) >= 0 ? '#00c896' : '#ff5c5c'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

          </div>
        )}

      </div>
    </div>
  );
}

const SUBTABS = [
  { to: '/cashflow/monthly',     label: 'Monthly'     },
  { to: '/cashflow/predictions', label: 'Predictions' },
];

export default function CashflowPage() {
  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-shrink-0 px-6 pt-4 pb-0">
        <div className="flex gap-1 bg-white/[0.03] rounded-lg p-1 w-fit">
          {SUBTABS.map(({ to, label }) => (
            <NavLink key={to} to={to}
              className={({ isActive }) =>
                `px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  isActive ? 'bg-accent-green/15 text-accent-green' : 'text-secondary hover:text-white'
                }`
              }>
              {label}
            </NavLink>
          ))}
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        <Routes>
          <Route index element={<Navigate to="monthly" replace />} />
          <Route path="monthly"     element={<MonthlyPage />} />
          <Route path="predictions" element={<PredictionsPage />} />
        </Routes>
      </div>
    </div>
  );
}
