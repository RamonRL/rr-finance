import { useState, useEffect, useMemo } from 'react';
import {
  AreaChart, Area, BarChart, Bar, Cell, ReferenceLine,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid,
} from 'recharts';
import { API_URL } from '../constants';
import { useStore } from '../hooks/useStore';
import { IconTrash } from '../components/icons';
import { byDate, contributedBy, valueAt, performance, xirr } from '../utils/portfolio';

// ── Storage ───────────────────────────────────────────────────────────────────
const CONFIG_KEY        = 'rr-savings-portfolio-config';
const CONTRIBUTIONS_KEY = 'rr-savings-portfolio-contributions';
const VALUATIONS_KEY    = 'rr-savings-portfolio-valuations';
const ARCHIVE_KEY       = 'rr-savings-portfolio-archive';
const DEPOSITS_KEY      = 'rr-savings-deposits';   // read-only, owned by the Deposits tab

// Written by the old money-market-fund tab; read only by the switch panel below
const LEGACY_KEYS = {
  config:        'rr-savings-fund-config',
  contributions: 'rr-savings-fund-contributions',
  navs:          'rr-savings-fund-navs',
};

const DEFAULT_CONFIG = {
  name: 'Cartera Indie 60/40',
  broker: 'MyInvestor',
};

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const round2 = (v) => Math.round(v * 100) / 100;

// ── Backend helpers ───────────────────────────────────────────────────────────
const deleteTx = async (id) => {
  if (!id) return;
  await fetch(`${API_URL}/transactions/${id}`, { method: 'DELETE' }).catch(() => {});
};

// ── Formatters ────────────────────────────────────────────────────────────────
const fmtEur = (v) =>
  v == null ? '—' : new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(v);

const fmtPct = (v) => (v == null ? '—' : `${v.toFixed(2)}%`);
const fmtSignedPct = (v) => (v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`);

const fmtDate = (s) => {
  if (!s) return '—';
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
};

const fmtShortDate = (s) => {
  if (!s) return '';
  const [, m, d] = s.split('-');
  return `${d}/${m}`;
};

const toDate = (s) => new Date(s + 'T00:00:00');
const DAY_MS = 86400000;

// ── Chart tooltip ─────────────────────────────────────────────────────────────
const ChartTooltip = ({ active, payload, label, fmt = fmtEur }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-elevated border border-white/10 rounded-lg p-3 text-sm">
      <p className="text-secondary mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color || p.fill }}>
          {p.name}: {fmt(p.value)}
        </p>
      ))}
    </div>
  );
};

// ── Collapsible section ───────────────────────────────────────────────────────
function Section({ title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-white/10 rounded-xl overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-surface hover:bg-elevated transition-colors">
        <span className="text-[11px] font-semibold text-secondary uppercase tracking-widest">{title}</span>
        <span className="text-muted text-xs">{open ? '▴' : '▾'}</span>
      </button>
      {open && <div className="px-4 pb-4 pt-2 bg-surface space-y-3">{children}</div>}
    </div>
  );
}

const inputCls = 'w-full bg-elevated border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent-gold/50 placeholder-muted';
const cellInputCls = 'w-28 bg-elevated border border-white/10 rounded px-2 py-1 text-sm text-white focus:outline-none';

function Field({ label, children }) {
  return (
    <div>
      <p className="text-xs text-secondary mb-1">{label}</p>
      {children}
    </div>
  );
}

const gainColor = (v) => (v == null ? 'text-muted' : v >= 0 ? 'text-accent-green' : 'text-red-400');

// ── One-time switch panel ─────────────────────────────────────────────────────
/**
 * The money-market fund was tracked as units × NAV. The indexed portfolio is
 * reported as a single value, so the old position is closed rather than
 * converted. Only the user knows the date the transfer landed and the amount
 * that actually arrived, so nothing is assumed.
 */
function SwitchPanel({ legacy, onConfirm, busy }) {
  const units = legacy.contributions.reduce((s, c) => s + (c.units || 0), 0);
  const contributed = legacy.contributions.reduce((s, c) => s + (c.amount || 0), 0);
  const lastNav = [...legacy.navs].sort(byDate).pop();
  const finalValue = lastNav ? round2(units * lastNav.nav) : contributed;
  const postedTxs = legacy.navs.filter(n => n.txId);

  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [value, setValue] = useState(String(finalValue));

  const amount = parseFloat(value);
  const valid = date && amount > 0;

  return (
    <div className="bg-surface border border-accent-gold/30 rounded-xl p-5 space-y-4">
      <div>
        <h3 className="text-white font-semibold">Move to the indexed portfolio</h3>
        <p className="text-sm text-secondary mt-1">
          This tab still holds the money market fund, tracked as participaciones × NAV.
          An indexed portfolio reports a single value instead, so the old position is
          closed and archived rather than converted.
        </p>
      </div>

      <div className="bg-elevated/60 rounded-lg p-3 text-xs text-secondary space-y-1">
        <div className="flex justify-between">
          <span>{legacy.config?.name || 'AXA Trésor Court Terme C'} — contributed</span>
          <span className="text-white tabular-nums private">{fmtEur(contributed)}</span>
        </div>
        <div className="flex justify-between">
          <span>Value at last NAV ({fmtDate(lastNav?.date)})</span>
          <span className="text-white tabular-nums private">{fmtEur(finalValue)}</span>
        </div>
        <div className="flex justify-between">
          <span>Gain</span>
          <span className={`tabular-nums private ${gainColor(finalValue - contributed)}`}>
            {fmtEur(finalValue - contributed)}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Transfer date">
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Amount that landed (€)">
          <input type="number" step="0.01" value={value}
            onChange={e => setValue(e.target.value)} className={inputCls} />
        </Field>
      </div>

      <div className="text-xs text-secondary bg-accent-gold/[0.07] border border-accent-gold/25 rounded-lg p-3 space-y-1.5">
        <p className="text-accent-gold font-semibold">What this does</p>
        <p>· Archives the fund as a closed position — it stays visible below.</p>
        <p>· Opens the portfolio with {fmtEur(amount || 0)} contributed on {fmtDate(date)}.</p>
        {postedTxs.length > 0 && (
          <p className="text-red-400">
            · <strong>Deletes {postedTxs.length} transaction{postedTxs.length > 1 ? 's' : ''}</strong> the
            old tab posted onto the Savings account
            ({fmtEur(postedTxs.reduce((s, n) => s + (n.postedGain || 0), 0))} of fund gains).
            The portfolio no longer writes to the ledger, so its gain lives in the value
            instead — leaving them would count it twice.
          </p>
        )}
      </div>

      <button onClick={() => onConfirm({ date, amount, contributed, finalValue })}
        disabled={!valid || busy}
        className="w-full px-4 py-2.5 bg-accent-gold/10 border border-accent-gold/30 text-accent-gold text-sm font-semibold rounded-lg hover:bg-accent-gold/20 transition-colors disabled:opacity-40">
        {busy ? 'Switching…' : 'Close the fund and open the portfolio'}
      </button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function SavingsPortfolioPage() {
  const [config, setConfig] = useStore(CONFIG_KEY, DEFAULT_CONFIG);
  const [contributions, setContributions] = useStore(CONTRIBUTIONS_KEY, []);
  const [valuations, setValuations] = useStore(VALUATIONS_KEY, []);
  const [archive, setArchive, archiveLoading] = useStore(ARCHIVE_KEY, null);
  const [deposits] = useStore(DEPOSITS_KEY, []);

  // Legacy money-market-fund data, read only so the switch panel can close it out
  const [legacyConfig, setLegacyConfig] = useStore(LEGACY_KEYS.config, null);
  const [legacyContribs, setLegacyContribs, legacyLoading] = useStore(LEGACY_KEYS.contributions, []);
  const [legacyNavs, setLegacyNavs] = useStore(LEGACY_KEYS.navs, []);

  const [bankBalance, setBankBalance] = useState(null);
  const [balanceTick, setBalanceTick] = useState(0);
  const [switching, setSwitching] = useState(false);
  const refreshBalance = () => setBalanceTick(t => t + 1);

  // Local draft for the details form — persisted on blur, not on every keystroke
  const [configDraft, setConfigDraft] = useState(null);
  const cfg = configDraft ?? config;
  const editConfig = (patch) => setConfigDraft({ ...cfg, ...patch });
  const commitConfig = () => {
    if (configDraft) { setConfig(configDraft); setConfigDraft(null); }
  };

  // ── Forms ────────────────────────────────────────────────────────────────────
  const [cDate, setCDate] = useState(new Date().toISOString().slice(0, 10));
  const [cAmount, setCAmount] = useState('');
  const [vDate, setVDate] = useState(new Date().toISOString().slice(0, 10));
  const [vValue, setVValue] = useState('');

  const [editingContribId, setEditingContribId] = useState(null);
  const [editContrib, setEditContrib] = useState({});
  const [editingValId, setEditingValId] = useState(null);
  const [editVal, setEditVal] = useState({});

  // ── Savings cash balance ─────────────────────────────────────────────────────
  useEffect(() => {
    fetch(`${API_URL}/balances`)
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        if (Array.isArray(data)) {
          const acc = data.find(a => a.name === 'Savings');
          if (acc) setBankBalance(acc.balance);
        }
      })
      .catch(() => {});
  }, [balanceTick]);

  // ── Switch ───────────────────────────────────────────────────────────────────
  const needsSwitch = !archiveLoading && !legacyLoading && !archive && legacyContribs.length > 0;

  const handleSwitch = async ({ date, amount, contributed, finalValue }) => {
    setSwitching(true);
    try {
      // Unwind the mark-to-market transactions the old tab posted
      for (const nav of legacyNavs) await deleteTx(nav.txId);

      const dates = [...legacyContribs, ...legacyNavs].map(x => x.date).sort();
      setArchive({
        name: legacyConfig?.name || 'AXA Trésor Court Terme C',
        broker: legacyConfig?.broker || 'MyInvestor',
        from: dates[0] ?? null,
        to: dates[dates.length - 1] ?? null,
        contributed,
        finalValue,
        gain: round2(finalValue - contributed),
        closedOn: date,
      });

      setContributions([{ id: uid(), date, amount: round2(amount) }]);
      setValuations([{ id: uid(), date, value: round2(amount) }]);

      // Clear the legacy keys, in the backend store and in localStorage — useStore
      // falls back to localStorage when the backend value is empty, which would
      // otherwise resurrect the fund on the next load.
      setLegacyContribs([]);
      setLegacyNavs([]);
      setLegacyConfig({});
      Object.values(LEGACY_KEYS).forEach(k => {
        try { localStorage.removeItem(k); } catch { /* ignore */ }
      });

      refreshBalance();
    } finally {
      setSwitching(false);
    }
  };

  // ── Derived ──────────────────────────────────────────────────────────────────
  const sortedContribs = useMemo(() => [...contributions].sort(byDate), [contributions]);
  const sortedVals = useMemo(() => [...valuations].sort(byDate), [valuations]);

  const latestDate = useMemo(() => {
    const dates = [...contributions.map(c => c.date), ...valuations.map(v => v.date)].sort();
    return dates[dates.length - 1] ?? null;
  }, [contributions, valuations]);

  const perf = useMemo(() => {
    const p = performance(sortedVals, sortedContribs);
    return { ...p, periods: p.periods.map(x => ({ ...x, label: fmtShortDate(x.date) })) };
  }, [sortedVals, sortedContribs]);

  const summary = useMemo(() => {
    const contributed = contributions.reduce((s, c) => s + (c.amount || 0), 0);
    const value = latestDate ? valueAt(sortedVals, sortedContribs, latestDate) : 0;
    const gain = value - contributed;
    const returnPct = contributed > 0 ? (gain / contributed) * 100 : null;

    let annualised = null;
    if (sortedContribs.length && latestDate) {
      const spanDays = (toDate(latestDate) - toDate(sortedContribs[0].date)) / DAY_MS;
      annualised = spanDays >= 14
        ? xirr([...sortedContribs.map(c => ({ date: c.date, amount: -c.amount })),
                { date: latestDate, amount: value }])
        : null;
    }

    const inDeposits = deposits.filter(d => d.status === 'active').reduce((s, d) => s + (d.amount || 0), 0);

    // The cash that went into the portfolio was never booked as leaving the
    // Savings account, and the portfolio writes nothing to the ledger, so the
    // balance still carries the contributed amount. Swap it for market value.
    const cashAndDeposits = (bankBalance ?? 0) - contributed;
    const totalSavings = cashAndDeposits + value;

    return {
      contributed, value, gain, returnPct, annualised,
      maxDrawdown: perf.maxDrawdown,
      inDeposits, cashAndDeposits, totalSavings,
      share: totalSavings > 0 ? (value / totalSavings) * 100 : null,
    };
  }, [contributions, sortedContribs, sortedVals, latestDate, deposits, bankBalance, perf]);

  // ── Timeline ─────────────────────────────────────────────────────────────────
  const timeline = useMemo(() => {
    const dates = [...new Set([
      ...contributions.map(c => c.date),
      ...valuations.map(v => v.date),
    ])].sort();

    return dates.map(d => {
      const contributed = contributedBy(sortedContribs, d);
      const value = valueAt(sortedVals, sortedContribs, d);
      return {
        date: d,
        label: fmtShortDate(d),
        'Portfolio value': value,
        'Contributed': contributed,
        'Gain': value - contributed,
      };
    });
  }, [contributions, valuations, sortedContribs, sortedVals]);

  const monthlyContribs = useMemo(() => {
    const byMonth = {};
    sortedContribs.forEach(c => {
      const m = c.date.slice(0, 7);
      byMonth[m] = (byMonth[m] || 0) + c.amount;
    });
    return Object.keys(byMonth).sort().map(month => ({ month, Contributed: byMonth[month] }));
  }, [sortedContribs]);

  // ── Handlers ─────────────────────────────────────────────────────────────────
  const addContribution = () => {
    const a = parseFloat(cAmount);
    if (!cDate || !a) return;
    setContributions([...contributions, { id: uid(), date: cDate, amount: round2(a) }]);
    setCAmount('');
  };

  const deleteContribution = (id) => {
    if (!confirm('Delete this contribution?')) return;
    setContributions(contributions.filter(c => c.id !== id));
  };

  const saveEditContrib = () => {
    const a = parseFloat(editContrib.amount);
    if (!a) return;
    setContributions(contributions.map(c =>
      c.id === editingContribId ? { ...c, date: editContrib.date, amount: round2(a) } : c));
    setEditingContribId(null);
  };

  const addValuation = () => {
    const v = parseFloat(vValue);
    if (!vDate || !v) return;
    const exists = valuations.some(x => x.date === vDate);
    setValuations(exists
      ? valuations.map(x => x.date === vDate ? { ...x, value: round2(v) } : x)
      : [...valuations, { id: uid(), date: vDate, value: round2(v) }]);
    setVValue('');
  };

  const deleteValuation = (id) => {
    if (!confirm('Delete this valuation?')) return;
    setValuations(valuations.filter(v => v.id !== id));
  };

  const saveEditVal = () => {
    const v = parseFloat(editVal.value);
    if (!v) return;
    setValuations(valuations.map(x =>
      x.id === editingValId ? { ...x, date: editVal.date, value: round2(v) } : x));
    setEditingValId(null);
  };

  // ── Table rows ───────────────────────────────────────────────────────────────
  const contribRows = useMemo(() => {
    let cum = 0;
    return sortedContribs.map(c => ({ ...c, cumulative: (cum += c.amount) })).reverse();
  }, [sortedContribs]);

  const valRows = useMemo(() =>
    sortedVals.map((v, i, arr) => {
      const prev = arr[i - 1];
      const flows = prev
        ? sortedContribs.filter(c => c.date > prev.date && c.date <= v.date)
            .reduce((s, c) => s + c.amount, 0)
        : 0;
      const changeEur = prev ? v.value - prev.value - flows : null;
      const changePct = prev && prev.value > 0 ? ((v.value - flows) / prev.value - 1) * 100 : null;
      const contributed = contributedBy(sortedContribs, v.date);
      return { ...v, changeEur, changePct, contributed, gain: v.value - contributed };
    }).reverse(),
  [sortedVals, sortedContribs]);

  const valPreview = useMemo(() => {
    const v = parseFloat(vValue);
    if (!v) return null;
    const contributed = contributedBy(sortedContribs, vDate);
    const prev = sortedVals.filter(x => x.date < vDate).pop();
    const flows = prev
      ? sortedContribs.filter(c => c.date > prev.date && c.date <= vDate).reduce((s, c) => s + c.amount, 0)
      : 0;
    return {
      gain: v - contributed,
      change: prev ? v - prev.value - flows : null,
      changePct: prev && prev.value > 0 ? ((v - flows) / prev.value - 1) * 100 : null,
    };
  }, [vValue, vDate, sortedContribs, sortedVals]);

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col md:flex-row gap-3 md:gap-4 overflow-y-auto md:overflow-hidden">

      {/* ── Left panel ─────────────────────────────────────────────────────── */}
      <div className="w-full md:w-1/5 md:flex-shrink-0 md:overflow-y-auto md:custom-scrollbar space-y-3 md:pr-1">

        <Section title="Log a contribution">
          <Field label="Date">
            <input type="date" value={cDate} onChange={e => setCDate(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Amount (€)">
            <input type="number" step="0.01" value={cAmount} onChange={e => setCAmount(e.target.value)}
              placeholder="0" className={inputCls} />
          </Field>
          <button onClick={addContribution}
            className="w-full px-4 py-2 bg-accent-gold/10 border border-accent-gold/30 text-accent-gold text-sm font-medium rounded-lg hover:bg-accent-gold/20 transition-colors">
            Add contribution
          </button>
        </Section>

        <Section title="Update value">
          <Field label="Date">
            <input type="date" value={vDate} onChange={e => setVDate(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Total value (€)">
            <input type="number" step="0.01" value={vValue} onChange={e => setVValue(e.target.value)}
              placeholder="0" className={inputCls} />
          </Field>
          {valPreview && (
            <div className="bg-elevated/60 rounded-lg px-3 py-2 text-xs text-secondary space-y-0.5">
              <p>Gain: <span className={`private ${gainColor(valPreview.gain)}`}>{fmtEur(valPreview.gain)}</span></p>
              {valPreview.change != null && (
                <p>Since last: <span className={`private ${gainColor(valPreview.change)}`}>
                  {fmtEur(valPreview.change)} ({fmtSignedPct(valPreview.changePct)})
                </span></p>
              )}
            </div>
          )}
          <button onClick={addValuation}
            className="w-full px-4 py-2 bg-accent-blue/10 border border-accent-blue/30 text-accent-blue text-sm font-medium rounded-lg hover:bg-accent-blue/20 transition-colors">
            Save value
          </button>
        </Section>

        <Section title="Portfolio details" defaultOpen={false}>
          <Field label="Name">
            <input type="text" value={cfg.name ?? ''} onBlur={commitConfig}
              onChange={e => editConfig({ name: e.target.value })} className={inputCls} />
          </Field>
          <Field label="Broker">
            <input type="text" value={cfg.broker ?? ''} onBlur={commitConfig}
              onChange={e => editConfig({ broker: e.target.value })} className={inputCls} />
          </Field>
          <p className="text-[10px] text-muted leading-snug">
            The portfolio never writes to the ledger. Its value is counted into Total savings
            below, replacing the contributed amount that the Savings account balance still carries.
          </p>
        </Section>

        {/* Savings composition */}
        <div className="bg-surface border border-white/10 rounded-xl p-4 space-y-2"
          style={{ borderLeft: '2px solid var(--accent-gold)' }}>
          <p className="text-[10px] text-muted uppercase tracking-widest">Total savings</p>
          <p className="text-2xl font-bold tabular-nums private text-accent-gold">
            {bankBalance != null ? fmtEur(summary.totalSavings) : '—'}
          </p>
          <div className="text-xs text-secondary space-y-1 pt-1 border-t border-white/[0.06]">
            <div className="flex justify-between">
              <span>Portfolio</span>
              <span className="text-accent-gold tabular-nums private">{fmtEur(summary.value)}</span>
            </div>
            <div className="flex justify-between">
              <span>Cash &amp; deposits</span>
              <span className="text-white tabular-nums private">
                {bankBalance != null ? fmtEur(summary.cashAndDeposits) : '—'}
              </span>
            </div>
            <p className="text-[10px] text-muted pt-1 leading-snug">
              Savings balance {fmtEur(bankBalance)} − {fmtEur(summary.contributed)} contributed
              + {fmtEur(summary.value)} market value.
            </p>
          </div>
        </div>
      </div>

      {/* ── Right panel ────────────────────────────────────────────────────── */}
      <div className="flex-1 md:overflow-y-auto md:custom-scrollbar space-y-3 md:space-y-4 min-w-0">

        {needsSwitch && (
          <SwitchPanel
            legacy={{ config: legacyConfig, contributions: legacyContribs, navs: legacyNavs }}
            onConfirm={handleSwitch}
            busy={switching}
          />
        )}

        {/* Header */}
        <div className="bg-surface border border-white/10 rounded-xl px-4 py-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-white font-semibold">{cfg.name || 'Portfolio'}</span>
          {cfg.broker && <span className="text-xs text-secondary">· {cfg.broker}</span>}
          {latestDate && (
            <span className="text-xs text-muted ml-auto">
              Valued {fmtDate(sortedVals[sortedVals.length - 1]?.date ?? latestDate)}
            </span>
          )}
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-7 gap-2">
          {[
            { label: 'Total contributed', value: fmtEur(summary.contributed), color: 'text-white' },
            { label: 'Current value', value: fmtEur(summary.value), color: 'text-accent-gold' },
            { label: 'Gain', value: fmtEur(summary.gain), color: gainColor(summary.gain) },
            { label: 'Return', value: fmtPct(summary.returnPct), color: gainColor(summary.gain) },
            {
              label: 'Annualised',
              value: fmtPct(summary.annualised),
              color: summary.annualised != null ? gainColor(summary.annualised) : 'text-muted',
            },
            {
              label: 'Max drawdown',
              value: fmtPct(summary.maxDrawdown),
              color: summary.maxDrawdown != null && summary.maxDrawdown < 0 ? 'text-red-400' : 'text-muted',
            },
            { label: '% of savings', value: fmtPct(summary.share), color: 'text-accent-blue' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-surface border border-white/10 rounded-xl p-3 text-center">
              <p className="text-[9px] text-muted uppercase tracking-widest mb-1 leading-tight">{label}</p>
              <p className={`text-base font-bold tabular-nums private ${color}`}>{value}</p>
            </div>
          ))}
        </div>

        {/* Archived position */}
        {archive && (
          <div className="bg-surface border border-white/10 rounded-xl p-3 md:p-5">
            <h3 className="text-[11px] font-semibold text-secondary uppercase tracking-widest mb-3">
              Closed position
            </h3>
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
              <span className="text-white font-medium">{archive.name}</span>
              <span className="text-xs text-muted">
                {fmtDate(archive.from)} → {fmtDate(archive.closedOn ?? archive.to)}
              </span>
              <span className="text-secondary text-xs ml-auto">
                Contributed <span className="text-white tabular-nums private">{fmtEur(archive.contributed)}</span>
                {' · '}Final <span className="text-white tabular-nums private">{fmtEur(archive.finalValue)}</span>
                {' · '}Gain <span className={`tabular-nums private ${gainColor(archive.gain)}`}>{fmtEur(archive.gain)}</span>
              </span>
            </div>
          </div>
        )}

        {/* Contributions */}
        <div className="bg-surface border border-white/10 rounded-xl p-3 md:p-5">
          <h3 className="text-[11px] font-semibold text-secondary uppercase tracking-widest mb-3 md:mb-4">Contributions</h3>
          {contribRows.length === 0 ? (
            <p className="text-muted text-sm">No contributions logged yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[520px]">
                <thead>
                  <tr className="text-left text-[10px] text-muted uppercase tracking-widest border-b border-white/[0.06]">
                    {['Date', 'Amount', 'Cumulative', 'Actions'].map(h => (
                      <th key={h} className="pb-2 pr-4 font-medium whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {contribRows.map(c => {
                    const isEditing = editingContribId === c.id;
                    return (
                      <tr key={c.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                        <td className="py-2 pr-4 text-secondary whitespace-nowrap">
                          {isEditing
                            ? <input type="date" value={editContrib.date}
                                onChange={e => setEditContrib(s => ({ ...s, date: e.target.value }))}
                                className={cellInputCls} />
                            : fmtDate(c.date)}
                        </td>
                        <td className="py-2 pr-4 tabular-nums private">
                          {isEditing
                            ? <input type="number" step="0.01" value={editContrib.amount}
                                onChange={e => setEditContrib(s => ({ ...s, amount: e.target.value }))}
                                className={cellInputCls} />
                            : <span className="text-white">{fmtEur(c.amount)}</span>}
                        </td>
                        <td className="py-2 pr-4 text-secondary tabular-nums private">{fmtEur(c.cumulative)}</td>
                        <td className="py-2">
                          {isEditing ? (
                            <div className="flex gap-2">
                              <button onClick={saveEditContrib}
                                className="text-xs px-2 py-1 bg-accent-green/10 border border-accent-green/30 text-accent-green rounded-lg hover:bg-accent-green/20">
                                Save
                              </button>
                              <button onClick={() => setEditingContribId(null)}
                                className="text-xs px-2 py-1 border border-white/10 text-secondary rounded-lg hover:bg-white/[0.04]">
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="flex gap-2">
                              <button onClick={() => { setEditingContribId(c.id); setEditContrib({ date: c.date, amount: c.amount }); }}
                                className="text-xs px-2 py-1 bg-accent-blue/10 border border-accent-blue/30 text-accent-blue rounded-lg hover:bg-accent-blue/20">
                                Edit
                              </button>
                              <button onClick={() => deleteContribution(c.id)}
                                className="text-muted hover:text-red-400 transition-colors inline-flex items-center px-1"
                                title="Delete"><IconTrash size={14} /></button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Valuations */}
        <div className="bg-surface border border-white/10 rounded-xl p-3 md:p-5">
          <h3 className="text-[11px] font-semibold text-secondary uppercase tracking-widest mb-3 md:mb-4">Value history</h3>
          {valRows.length === 0 ? (
            <p className="text-muted text-sm">No valuations logged yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[680px]">
                <thead>
                  <tr className="text-left text-[10px] text-muted uppercase tracking-widest border-b border-white/[0.06]">
                    {['Date', 'Value', 'Change', 'Change %', 'Contributed', 'Gain', 'Actions'].map(h => (
                      <th key={h} className="pb-2 pr-4 font-medium whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {valRows.map(v => {
                    const isEditing = editingValId === v.id;
                    return (
                      <tr key={v.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                        <td className="py-2 pr-4 text-secondary whitespace-nowrap">
                          {isEditing
                            ? <input type="date" value={editVal.date}
                                onChange={e => setEditVal(s => ({ ...s, date: e.target.value }))}
                                className={cellInputCls} />
                            : fmtDate(v.date)}
                        </td>
                        <td className="py-2 pr-4 tabular-nums private">
                          {isEditing
                            ? <input type="number" step="0.01" value={editVal.value}
                                onChange={e => setEditVal(s => ({ ...s, value: e.target.value }))}
                                className={cellInputCls} />
                            : <span className="text-accent-gold">{fmtEur(v.value)}</span>}
                        </td>
                        <td className={`py-2 pr-4 tabular-nums private ${gainColor(v.changeEur)}`}>
                          {v.changeEur == null ? '—' : fmtEur(v.changeEur)}
                        </td>
                        <td className={`py-2 pr-4 tabular-nums ${gainColor(v.changePct)}`}>
                          {fmtSignedPct(v.changePct)}
                        </td>
                        <td className="py-2 pr-4 text-secondary tabular-nums private">{fmtEur(v.contributed)}</td>
                        <td className={`py-2 pr-4 tabular-nums private ${gainColor(v.gain)}`}>{fmtEur(v.gain)}</td>
                        <td className="py-2">
                          {isEditing ? (
                            <div className="flex gap-2">
                              <button onClick={saveEditVal}
                                className="text-xs px-2 py-1 bg-accent-green/10 border border-accent-green/30 text-accent-green rounded-lg hover:bg-accent-green/20">
                                Save
                              </button>
                              <button onClick={() => setEditingValId(null)}
                                className="text-xs px-2 py-1 border border-white/10 text-secondary rounded-lg hover:bg-white/[0.04]">
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="flex gap-2">
                              <button onClick={() => { setEditingValId(v.id); setEditVal({ date: v.date, value: v.value }); }}
                                className="text-xs px-2 py-1 bg-accent-blue/10 border border-accent-blue/30 text-accent-blue rounded-lg hover:bg-accent-blue/20">
                                Edit
                              </button>
                              <button onClick={() => deleteValuation(v.id)}
                                className="text-muted hover:text-red-400 transition-colors inline-flex items-center px-1"
                                title="Delete"><IconTrash size={14} /></button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Charts */}
        {timeline.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">

            {/* Value vs contributed */}
            <div className="bg-surface border border-white/10 rounded-xl p-3 md:p-5">
              <h3 className="text-[11px] font-semibold text-secondary uppercase tracking-widest mb-4">
                Value vs contributed
              </h3>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={timeline}>
                  <defs>
                    <linearGradient id="gPortfolioValue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f0b429" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#f0b429" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: '#3d5a78', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#3d5a78', fontSize: 11 }} axisLine={false} tickLine={false} width={60}
                    domain={['dataMin', 'dataMax']} tickFormatter={v => `€${v.toFixed(0)}`} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12, color: '#7a95b2' }} />
                  <Area type="monotone" dataKey="Portfolio value" stroke="#f0b429" strokeWidth={2} fill="url(#gPortfolioValue)" />
                  <Area type="monotone" dataKey="Contributed" stroke="#3d9eff" strokeWidth={2}
                    strokeDasharray="4 3" fill="none" />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Cumulative gain — signed, so it needs a zero line */}
            <div className="bg-surface border border-white/10 rounded-xl p-3 md:p-5">
              <h3 className="text-[11px] font-semibold text-secondary uppercase tracking-widest mb-4">
                Cumulative gain
              </h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={timeline}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: '#3d5a78', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#3d5a78', fontSize: 11 }} axisLine={false} tickLine={false} width={60}
                    tickFormatter={v => `€${v.toFixed(0)}`} />
                  <Tooltip content={<ChartTooltip />} />
                  <ReferenceLine y={0} stroke="rgba(255,255,255,0.25)" strokeWidth={1} />
                  <Bar dataKey="Gain" radius={[4, 4, 0, 0]}>
                    {timeline.map((d, i) => (
                      <Cell key={i} fill={d.Gain >= 0 ? '#00c896' : '#ff5c5c'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Period return */}
            <div className="bg-surface border border-white/10 rounded-xl p-3 md:p-5">
              <h3 className="text-[11px] font-semibold text-secondary uppercase tracking-widest mb-4">
                Return per period
              </h3>
              {perf.periods.length === 0 ? (
                <p className="text-muted text-sm">Log a second valuation to see returns.</p>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={perf.periods}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: '#3d5a78', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#3d5a78', fontSize: 11 }} axisLine={false} tickLine={false} width={50}
                      tickFormatter={v => `${v.toFixed(1)}%`} />
                    <Tooltip content={<ChartTooltip fmt={fmtSignedPct} />} />
                    <ReferenceLine y={0} stroke="rgba(255,255,255,0.25)" strokeWidth={1} />
                    <Bar dataKey="ret" name="Return" radius={[4, 4, 0, 0]}>
                      {perf.periods.map((p, i) => (
                        <Cell key={i} fill={p.ret >= 0 ? '#00c896' : '#ff5c5c'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Contributions per month */}
            <div className="bg-surface border border-white/10 rounded-xl p-3 md:p-5">
              <h3 className="text-[11px] font-semibold text-secondary uppercase tracking-widest mb-4">
                Contributions per month
              </h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={monthlyContribs}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis dataKey="month" tick={{ fill: '#3d5a78', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#3d5a78', fontSize: 11 }} axisLine={false} tickLine={false} width={60}
                    tickFormatter={v => `€${v.toFixed(0)}`} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="Contributed" fill="#3d9eff" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

          </div>
        ) : !needsSwitch && (
          <div className="bg-surface border border-white/10 rounded-xl p-10 text-center text-muted text-sm">
            Log a contribution to start tracking the portfolio.
          </div>
        )}

      </div>
    </div>
  );
}
