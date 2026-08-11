import { useState, useEffect, useMemo } from 'react';
import {
  AreaChart, Area, LineChart, Line, ComposedChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid,
} from 'recharts';
import { API_URL } from '../constants';
import { useStore } from '../hooks/useStore';
import { IconTrash } from '../components/icons';

// ── Storage ───────────────────────────────────────────────────────────────────
const CONFIG_KEY        = 'rr-savings-fund-config';
const CONTRIBUTIONS_KEY = 'rr-savings-fund-contributions';
const NAVS_KEY          = 'rr-savings-fund-navs';
const DEPOSITS_KEY      = 'rr-savings-deposits';   // read-only, owned by the Deposits tab

const SAVINGS_ACCOUNT_ID = 3;

const DEFAULT_CONFIG = {
  name: 'AXA Trésor Court Terme C',
  isin: '',
  broker: 'MyInvestor',
  // false → the transfer into the fund was never booked as an outflow, so the
  //         principal is still inside the Savings account balance and only the
  //         fund's gains need to be posted as transactions.
  // true  → the transfer is already booked as an outflow, so the fund lives
  //         entirely outside the account balance and nothing is posted.
  outflowRecorded: false,
};

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const round2 = (v) => Math.round(v * 100) / 100;

// ── Backend transaction helpers ───────────────────────────────────────────────
const postTx = async (data) => {
  try {
    const res = await fetch(`${API_URL}/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (res.ok) return (await res.json()).id;
  } catch { /* ignore */ }
  return null;
};

const deleteTx = async (id) => {
  if (!id) return;
  await fetch(`${API_URL}/transactions/${id}`, { method: 'DELETE' }).catch(() => {});
};

// ── Formatters ────────────────────────────────────────────────────────────────
const fmtEur = (v) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(v ?? 0);

const fmtNav = (v) =>
  new Intl.NumberFormat('es-ES', { minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(v ?? 0);

const fmtUnits = (v) =>
  new Intl.NumberFormat('es-ES', { minimumFractionDigits: 6, maximumFractionDigits: 6 }).format(v ?? 0);

const fmtPct = (v) => `${(v ?? 0).toFixed(2)}%`;

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

// ── Money-weighted return (XIRR via bisection) ────────────────────────────────
const xirr = (flows) => {
  if (flows.length < 2) return null;
  const t0 = toDate(flows[0].date).getTime();
  const npv = (rate) => flows.reduce((s, f) => {
    const years = (toDate(f.date).getTime() - t0) / (365 * DAY_MS);
    return s + f.amount / Math.pow(1 + rate, years);
  }, 0);

  let lo = -0.9999, hi = 10;
  const nLo = npv(lo), nHi = npv(hi);
  if (!isFinite(nLo) || !isFinite(nHi) || nLo * nHi > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (npv(lo) * npv(mid) <= 0) hi = mid; else lo = mid;
  }
  return ((lo + hi) / 2) * 100;
};

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

// ── Main component ────────────────────────────────────────────────────────────
export default function SavingsFundPage() {
  const [config, setConfig] = useStore(CONFIG_KEY, DEFAULT_CONFIG);
  const [contributions, setContributions] = useStore(CONTRIBUTIONS_KEY, []);
  const [navs, setNavs] = useStore(NAVS_KEY, []);
  const [deposits] = useStore(DEPOSITS_KEY, []);

  const [bankBalance, setBankBalance] = useState(null);
  const [balanceTick, setBalanceTick] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const refreshBalance = () => setBalanceTick(t => t + 1);

  // Local draft for the fund details form — persisted on blur, not on every keystroke
  const [configDraft, setConfigDraft] = useState(null);
  const cfg = configDraft ?? config;
  const editConfig = (patch) => setConfigDraft({ ...cfg, ...patch });
  const commitConfig = () => {
    if (configDraft) { setConfig(configDraft); setConfigDraft(null); }
  };

  // ── Contribution form ────────────────────────────────────────────────────────
  const [cDate, setCDate] = useState(new Date().toISOString().slice(0, 10));
  const [cAmount, setCAmount] = useState('');
  const [cNav, setCNav] = useState('');

  // ── NAV form ─────────────────────────────────────────────────────────────────
  const [nDate, setNDate] = useState(new Date().toISOString().slice(0, 10));
  const [nNav, setNNav] = useState('');

  // ── Inline edit state ────────────────────────────────────────────────────────
  const [editingContribId, setEditingContribId] = useState(null);
  const [editContrib, setEditContrib] = useState({});
  const [editingNavId, setEditingNavId] = useState(null);
  const [editNav, setEditNav] = useState({});

  // ── Savings cash balance (for the "total savings" breakdown) ─────────────────
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

  // ── Gain sync ────────────────────────────────────────────────────────────────
  // Each NAV entry owns one transaction on the Savings account holding the gain
  // accrued since the previous NAV entry, so the account balance tracks the
  // fund's growth. Recomputed from scratch on every change so edits and
  // deletions stay consistent. No-op (and unwinds itself) when the contributions
  // were already booked as an outflow — then the fund lives outside the account.
  const syncGains = async (navList, contribList, post) => {
    const sorted = [...navList].sort((a, b) => a.date.localeCompare(b.date));
    const out = [];
    let cumPosted = 0;

    for (const n of sorted) {
      const units = contribList.filter(c => c.date <= n.date).reduce((s, c) => s + c.units, 0);
      const invested = contribList.filter(c => c.date <= n.date).reduce((s, c) => s + c.amount, 0);
      const target = post ? round2(units * n.nav - invested - cumPosted) : 0;
      const posted = round2(n.postedGain ?? 0);

      let row = n;
      if (Math.abs(target - posted) >= 0.01 || (!post && n.txId)) {
        await deleteTx(n.txId);
        let txId = null;
        if (Math.abs(target) >= 0.01) {
          txId = await postTx({
            date: n.date,
            description: `Money fund ${target >= 0 ? 'gain' : 'loss'} — ${n.date}`,
            amount: Math.abs(target),
            type: target >= 0 ? 'income' : 'expense',
            category: target >= 0 ? 'Investment' : 'Other',
            account_id: SAVINGS_ACCOUNT_ID,
          });
        }
        row = { ...n, txId, postedGain: txId ? target : 0 };
      }
      cumPosted += round2(row.postedGain ?? 0);
      out.push(row);
    }
    return out;
  };

  // Persist contributions/NAVs and re-post the gain transactions in one go.
  const commit = async (nextContribs, nextNavs) => {
    setSyncing(true);
    setContributions(nextContribs);
    const synced = await syncGains(nextNavs, nextContribs, !cfg.outflowRecorded);
    setNavs(synced);
    setSyncing(false);
    refreshBalance();
  };

  // ── Derived: sorted series ───────────────────────────────────────────────────
  const sortedNavs = useMemo(
    () => [...navs].sort((a, b) => a.date.localeCompare(b.date)),
    [navs],
  );

  const sortedContribs = useMemo(
    () => [...contributions].sort((a, b) => a.date.localeCompare(b.date)),
    [contributions],
  );

  // Latest known NAV at (or before) a given date — falls back to the NAV paid on
  // the most recent contribution, so the fund can be tracked before logging NAVs.
  const navAt = useMemo(() => (dateStr) => {
    const fromHistory = sortedNavs.filter(n => n.date <= dateStr).pop();
    const fromContrib = sortedContribs.filter(c => c.date <= dateStr).pop();
    if (fromHistory && fromContrib) {
      return fromHistory.date >= fromContrib.date ? fromHistory.nav : fromContrib.nav;
    }
    return fromHistory?.nav ?? fromContrib?.nav ?? null;
  }, [sortedNavs, sortedContribs]);

  const currentNav = useMemo(() => {
    const last = sortedNavs[sortedNavs.length - 1];
    const lastContrib = sortedContribs[sortedContribs.length - 1];
    if (last && lastContrib) return last.date >= lastContrib.date ? last.nav : lastContrib.nav;
    return last?.nav ?? lastContrib?.nav ?? null;
  }, [sortedNavs, sortedContribs]);

  const currentNavDate = useMemo(() => {
    const last = sortedNavs[sortedNavs.length - 1];
    const lastContrib = sortedContribs[sortedContribs.length - 1];
    if (last && lastContrib) return last.date >= lastContrib.date ? last.date : lastContrib.date;
    return last?.date ?? lastContrib?.date ?? null;
  }, [sortedNavs, sortedContribs]);

  // ── Summary ──────────────────────────────────────────────────────────────────
  const summary = useMemo(() => {
    const units = contributions.reduce((s, c) => s + (c.units || 0), 0);
    const invested = contributions.reduce((s, c) => s + (c.amount || 0), 0);
    const value = currentNav != null ? units * currentNav : 0;
    const gain = value - invested;
    const returnPct = invested > 0 ? (gain / invested) * 100 : 0;

    // Money-weighted annualised return: contributions as outflows, current value as inflow
    let annualised = null;
    if (contributions.length && currentNav != null && currentNavDate) {
      const flows = [
        ...sortedContribs.map(c => ({ date: c.date, amount: -c.amount })),
        { date: currentNavDate, amount: value },
      ];
      const spanDays = (toDate(currentNavDate) - toDate(sortedContribs[0].date)) / DAY_MS;
      annualised = spanDays >= 14 ? xirr(flows) : null;
    }

    const inDeposits = deposits.filter(d => d.status === 'active').reduce((s, d) => s + (d.amount || 0), 0);

    // Deposits and (unless the transfer was booked as an outflow) the fund
    // principal are still inside the Savings account balance, so they must not
    // be added on top of it.
    const postedGains = navs.reduce((s, n) => s + (n.postedGain || 0), 0);
    const totalSavings = cfg.outflowRecorded
      ? (bankBalance ?? 0) + value
      : (bankBalance ?? 0);
    const restOfSavings = cfg.outflowRecorded ? (bankBalance ?? 0) : (bankBalance ?? 0) - value;

    return {
      units, invested, value, gain, returnPct, annualised,
      inDeposits, totalSavings, restOfSavings, postedGains,
      unpostedGain: cfg.outflowRecorded ? 0 : round2(gain - postedGains),
      fundShare: totalSavings > 0 ? (value / totalSavings) * 100 : 0,
    };
  }, [contributions, sortedContribs, currentNav, currentNavDate, deposits, navs, bankBalance, cfg.outflowRecorded]);

  // ── Timeline (one point per contribution date or NAV date) ───────────────────
  const timeline = useMemo(() => {
    const dates = [...new Set([
      ...contributions.map(c => c.date),
      ...navs.map(n => n.date),
    ])].sort();

    return dates.map(d => {
      const nav = navAt(d);
      if (nav == null) return null;
      const units = sortedContribs.filter(c => c.date <= d).reduce((s, c) => s + c.units, 0);
      const invested = sortedContribs.filter(c => c.date <= d).reduce((s, c) => s + c.amount, 0);
      const value = units * nav;
      return {
        date: d,
        label: fmtShortDate(d),
        'Fund value': value,
        'Contributed': invested,
        'Gain': value - invested,
        'NAV': nav,
      };
    }).filter(Boolean);
  }, [contributions, navs, sortedContribs, navAt]);

  // ── Monthly view: gain generated + contributions made ────────────────────────
  const monthlyData = useMemo(() => {
    const lastPointOfMonth = {};
    timeline.forEach(p => { lastPointOfMonth[p.date.slice(0, 7)] = p; });

    const months = [...new Set([
      ...Object.keys(lastPointOfMonth),
      ...contributions.map(c => c.date.slice(0, 7)),
    ])].sort();

    let prevGain = 0;
    return months.map(month => {
      const point = lastPointOfMonth[month];
      const gainSoFar = point ? point.Gain : prevGain;
      const monthGain = gainSoFar - prevGain;
      prevGain = gainSoFar;
      return {
        month,
        'Monthly gain': monthGain,
        'Contributed': contributions
          .filter(c => c.date.slice(0, 7) === month)
          .reduce((s, c) => s + c.amount, 0),
      };
    });
  }, [timeline, contributions]);

  // ── Form previews ────────────────────────────────────────────────────────────
  const contribPreview = useMemo(() => {
    const a = parseFloat(cAmount), v = parseFloat(cNav);
    if (!a || !v) return null;
    return { units: a / v };
  }, [cAmount, cNav]);

  const navPreview = useMemo(() => {
    const v = parseFloat(nNav);
    if (!v || !summary.units) return null;
    const value = summary.units * v;
    const alreadyPosted = navs
      .filter(n => n.date !== nDate)
      .reduce((s, n) => s + (n.postedGain || 0), 0);
    return {
      value,
      gain: value - summary.invested,
      toPost: round2(value - summary.invested - alreadyPosted),
    };
  }, [nNav, nDate, navs, summary.units, summary.invested]);

  // ── Handlers ─────────────────────────────────────────────────────────────────
  const addContribution = () => {
    const a = parseFloat(cAmount), v = parseFloat(cNav);
    if (!cDate || !a || !v) return;
    // The contribution carries the NAV of the day, so record it as a NAV point too —
    // otherwise the gain accrued up to that date would stay unbooked.
    commit(
      [...contributions, { id: uid(), date: cDate, amount: a, nav: v, units: a / v }],
      navs.some(n => n.date === cDate)
        ? navs.map(n => n.date === cDate ? { ...n, nav: v } : n)
        : [...navs, { id: uid(), date: cDate, nav: v, postedGain: 0, txId: null }],
    );
    setCAmount(''); setCNav('');
  };

  const deleteContribution = (id) => {
    if (!confirm('Delete this contribution?')) return;
    commit(contributions.filter(c => c.id !== id), navs);
  };

  const saveEditContrib = () => {
    const a = parseFloat(editContrib.amount), v = parseFloat(editContrib.nav);
    if (!a || !v) return;
    commit(contributions.map(c =>
      c.id === editingContribId ? { ...c, date: editContrib.date, amount: a, nav: v, units: a / v } : c
    ), navs);
    setEditingContribId(null);
  };

  const addNav = () => {
    const v = parseFloat(nNav);
    if (!nDate || !v) return;
    const exists = navs.some(n => n.date === nDate);
    commit(contributions, exists
      ? navs.map(n => n.date === nDate ? { ...n, nav: v } : n)
      : [...navs, { id: uid(), date: nDate, nav: v, postedGain: 0, txId: null }]);
    setNNav('');
  };

  const deleteNav = async (id) => {
    if (!confirm('Delete this NAV entry?')) return;
    const row = navs.find(n => n.id === id);
    await deleteTx(row?.txId);
    commit(contributions, navs.filter(n => n.id !== id));
  };

  const saveEditNav = () => {
    const v = parseFloat(editNav.nav);
    if (!v) return;
    commit(contributions, navs.map(n =>
      n.id === editingNavId ? { ...n, date: editNav.date, nav: v } : n
    ));
    setEditingNavId(null);
  };

  // Flipping the accounting mode re-posts (or unwinds) every gain transaction
  const toggleOutflowRecorded = async (recorded) => {
    const nextCfg = { ...cfg, outflowRecorded: recorded };
    setConfigDraft(null);
    setConfig(nextCfg);
    setSyncing(true);
    setNavs(await syncGains(navs, contributions, !recorded));
    setSyncing(false);
    refreshBalance();
  };

  // ── Table rows (newest first) ────────────────────────────────────────────────
  const contribRows = useMemo(() =>
    [...sortedContribs].reverse().map(c => {
      const value = currentNav != null ? c.units * currentNav : 0;
      const gain = value - c.amount;
      return { ...c, value, gain, gainPct: c.amount > 0 ? (gain / c.amount) * 100 : 0 };
    }),
  [sortedContribs, currentNav]);

  const navRows = useMemo(() =>
    [...sortedNavs].map((n, i, arr) => {
      const prev = arr[i - 1];
      const change = prev ? ((n.nav - prev.nav) / prev.nav) * 100 : null;
      const units = sortedContribs.filter(c => c.date <= n.date).reduce((s, c) => s + c.units, 0);
      return { ...n, change, fundValue: units * n.nav };
    }).reverse(),
  [sortedNavs, sortedContribs]);

  const gainColor = (v) => (v >= 0 ? 'text-accent-green' : 'text-red-400');

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
          <Field label="NAV at purchase (€)">
            <input type="number" step="0.0001" value={cNav} onChange={e => setCNav(e.target.value)}
              placeholder="0.0000" className={inputCls} />
          </Field>
          {contribPreview && (
            <div className="bg-elevated/60 rounded-lg px-3 py-2 text-xs text-secondary space-y-0.5">
              <p>Units bought: <span className="text-accent-gold tabular-nums">{fmtUnits(contribPreview.units)}</span></p>
            </div>
          )}
          <button onClick={addContribution} disabled={syncing}
            className="w-full px-4 py-2 bg-accent-gold/10 border border-accent-gold/30 text-accent-gold text-sm font-medium rounded-lg hover:bg-accent-gold/20 transition-colors disabled:opacity-40">
            {syncing ? 'Saving…' : 'Add contribution'}
          </button>
        </Section>

        <Section title="Update NAV">
          <Field label="Date">
            <input type="date" value={nDate} onChange={e => setNDate(e.target.value)} className={inputCls} />
          </Field>
          <Field label="NAV (€)">
            <input type="number" step="0.0001" value={nNav} onChange={e => setNNav(e.target.value)}
              placeholder="0.0000" className={inputCls} />
          </Field>
          {navPreview && (
            <div className="bg-elevated/60 rounded-lg px-3 py-2 text-xs text-secondary space-y-0.5">
              <p>Fund value: <span className="text-white private">{fmtEur(navPreview.value)}</span></p>
              <p>Gain: <span className={`private ${gainColor(navPreview.gain)}`}>{fmtEur(navPreview.gain)}</span></p>
              {!cfg.outflowRecorded && (
                <p>Posts to Savings: <span className={`private ${gainColor(navPreview.toPost)}`}>{fmtEur(navPreview.toPost)}</span></p>
              )}
            </div>
          )}
          <button onClick={addNav} disabled={syncing}
            className="w-full px-4 py-2 bg-accent-blue/10 border border-accent-blue/30 text-accent-blue text-sm font-medium rounded-lg hover:bg-accent-blue/20 transition-colors disabled:opacity-40">
            {syncing ? 'Saving…' : 'Save NAV'}
          </button>
        </Section>

        <Section title="Fund details" defaultOpen={false}>
          <Field label="Name">
            <input type="text" value={cfg.name ?? ''} onBlur={commitConfig}
              onChange={e => editConfig({ name: e.target.value })} className={inputCls} />
          </Field>
          <Field label="ISIN">
            <input type="text" value={cfg.isin ?? ''} onBlur={commitConfig}
              onChange={e => editConfig({ isin: e.target.value })}
              placeholder="FR0000447039" className={inputCls} />
          </Field>
          <Field label="Broker">
            <input type="text" value={cfg.broker ?? ''} onBlur={commitConfig}
              onChange={e => editConfig({ broker: e.target.value })} className={inputCls} />
          </Field>
          <Field label="Accounting">
            <select value={cfg.outflowRecorded ? 'out' : 'in'}
              onChange={e => toggleOutflowRecorded(e.target.value === 'out')} className={inputCls}>
              <option value="in">Money still inside the Savings account</option>
              <option value="out">Transfer already booked as an outflow</option>
            </select>
            <p className="text-[10px] text-muted mt-1 leading-snug">
              {cfg.outflowRecorded
                ? 'The fund sits outside the account balance, so its value is added on top and no transactions are created.'
                : 'The principal is already counted in the account balance, so each NAV update posts the gain as a transaction and the balance grows with the fund.'}
            </p>
          </Field>
        </Section>

        {/* Savings composition */}
        <div className="bg-surface border border-white/10 rounded-xl p-4 space-y-2"
          style={{ borderLeft: '2px solid var(--accent-gold)' }}>
          <p className="text-[10px] text-muted uppercase tracking-widest">Total savings</p>
          <p className="text-2xl font-bold tabular-nums private text-accent-gold">{fmtEur(summary.totalSavings)}</p>
          <div className="text-xs text-secondary space-y-1 pt-1 border-t border-white/[0.06]">
            <div className="flex justify-between">
              <span>Money fund</span>
              <span className="text-accent-gold tabular-nums private">{fmtEur(summary.value)}</span>
            </div>
            <div className="flex justify-between">
              <span>Cash &amp; deposits</span>
              <span className="text-white tabular-nums private">
                {bankBalance != null ? fmtEur(summary.restOfSavings) : '—'}
              </span>
            </div>
            <p className="text-[10px] text-muted pt-1 leading-snug">
              {cfg.outflowRecorded
                ? 'Savings account balance + fund value.'
                : `Savings account balance (${fmtEur(summary.inDeposits)} of it locked in deposits). Fund gains posted so far: ${fmtEur(summary.postedGains)}.`}
            </p>
          </div>
        </div>
      </div>

      {/* ── Right panel ────────────────────────────────────────────────────── */}
      <div className="flex-1 md:overflow-y-auto md:custom-scrollbar space-y-3 md:space-y-4 min-w-0">

        {/* Fund header */}
        <div className="bg-surface border border-white/10 rounded-xl px-4 py-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-white font-semibold">{cfg.name || 'Money market fund'}</span>
          {cfg.isin && <span className="text-xs text-muted tabular-nums">{cfg.isin}</span>}
          {cfg.broker && <span className="text-xs text-secondary">· {cfg.broker}</span>}
          {Math.abs(summary.unpostedGain) >= 0.01 && (
            <span className="text-[10px] text-accent-blue border border-accent-blue/30 bg-accent-blue/10 rounded-full px-2 py-0.5">
              {fmtEur(summary.unpostedGain)} not yet in the Savings balance — save a NAV to book it
            </span>
          )}
          {currentNavDate && (
            <span className="text-xs text-muted ml-auto">
              NAV {fmtNav(currentNav)} € · {fmtDate(currentNavDate)}
            </span>
          )}
        </div>

        {/* Summary bar */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-7 gap-2">
          {[
            { label: 'Total contributed', value: fmtEur(summary.invested), color: 'text-white' },
            { label: 'Current value', value: fmtEur(summary.value), color: 'text-accent-gold' },
            { label: 'Gain', value: fmtEur(summary.gain), color: gainColor(summary.gain) },
            { label: 'Return', value: fmtPct(summary.returnPct), color: gainColor(summary.gain) },
            {
              label: 'Annualised',
              value: summary.annualised != null ? fmtPct(summary.annualised) : '—',
              color: summary.annualised != null ? gainColor(summary.annualised) : 'text-muted',
            },
            { label: 'Units', value: fmtUnits(summary.units), color: 'text-accent-blue' },
            { label: '% of savings', value: fmtPct(summary.fundShare), color: 'text-accent-blue' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-surface border border-white/10 rounded-xl p-3 text-center">
              <p className="text-[9px] text-muted uppercase tracking-widest mb-1 leading-tight">{label}</p>
              <p className={`text-base font-bold tabular-nums private ${color}`}>{value}</p>
            </div>
          ))}
        </div>

        {/* Contributions table */}
        <div className="bg-surface border border-white/10 rounded-xl p-3 md:p-5">
          <h3 className="text-[11px] font-semibold text-secondary uppercase tracking-widest mb-3 md:mb-4">Contributions</h3>
          {contribRows.length === 0 ? (
            <p className="text-muted text-sm">No contributions logged yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[760px]">
                <thead>
                  <tr className="text-left text-[10px] text-muted uppercase tracking-widest border-b border-white/[0.06]">
                    {['Date', 'Amount', 'NAV', 'Units', 'Value now', 'Gain', 'Gain %', 'Actions'].map(h => (
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
                        <td className="py-2 pr-4 tabular-nums">
                          {isEditing
                            ? <input type="number" step="0.0001" value={editContrib.nav}
                                onChange={e => setEditContrib(s => ({ ...s, nav: e.target.value }))}
                                className={cellInputCls} />
                            : <span className="text-secondary">{fmtNav(c.nav)}</span>}
                        </td>
                        <td className="py-2 pr-4 text-accent-blue tabular-nums">{fmtUnits(c.units)}</td>
                        <td className="py-2 pr-4 text-accent-gold tabular-nums private">{fmtEur(c.value)}</td>
                        <td className={`py-2 pr-4 tabular-nums private ${gainColor(c.gain)}`}>{fmtEur(c.gain)}</td>
                        <td className={`py-2 pr-4 tabular-nums ${gainColor(c.gain)}`}>{fmtPct(c.gainPct)}</td>
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
                              <button onClick={() => { setEditingContribId(c.id); setEditContrib({ date: c.date, amount: c.amount, nav: c.nav }); }}
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

        {/* NAV history table */}
        <div className="bg-surface border border-white/10 rounded-xl p-3 md:p-5">
          <h3 className="text-[11px] font-semibold text-secondary uppercase tracking-widest mb-3 md:mb-4">NAV history</h3>
          {navRows.length === 0 ? (
            <p className="text-muted text-sm">No NAV updates logged yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[560px]">
                <thead>
                  <tr className="text-left text-[10px] text-muted uppercase tracking-widest border-b border-white/[0.06]">
                    {['Date', 'NAV', 'Change', 'Fund value', 'Actions'].map(h => (
                      <th key={h} className="pb-2 pr-4 font-medium whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {navRows.map(n => {
                    const isEditing = editingNavId === n.id;
                    return (
                      <tr key={n.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                        <td className="py-2 pr-4 text-secondary whitespace-nowrap">
                          {isEditing
                            ? <input type="date" value={editNav.date}
                                onChange={e => setEditNav(s => ({ ...s, date: e.target.value }))}
                                className={cellInputCls} />
                            : fmtDate(n.date)}
                        </td>
                        <td className="py-2 pr-4 tabular-nums">
                          {isEditing
                            ? <input type="number" step="0.0001" value={editNav.nav}
                                onChange={e => setEditNav(s => ({ ...s, nav: e.target.value }))}
                                className={cellInputCls} />
                            : <span className="text-white">{fmtNav(n.nav)}</span>}
                        </td>
                        <td className={`py-2 pr-4 tabular-nums ${n.change == null ? 'text-muted' : gainColor(n.change)}`}>
                          {n.change == null ? '—' : `${n.change >= 0 ? '+' : ''}${n.change.toFixed(3)}%`}
                        </td>
                        <td className="py-2 pr-4 text-accent-gold tabular-nums private">{fmtEur(n.fundValue)}</td>
                        <td className="py-2">
                          {isEditing ? (
                            <div className="flex gap-2">
                              <button onClick={saveEditNav}
                                className="text-xs px-2 py-1 bg-accent-green/10 border border-accent-green/30 text-accent-green rounded-lg hover:bg-accent-green/20">
                                Save
                              </button>
                              <button onClick={() => setEditingNavId(null)}
                                className="text-xs px-2 py-1 border border-white/10 text-secondary rounded-lg hover:bg-white/[0.04]">
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="flex gap-2">
                              <button onClick={() => { setEditingNavId(n.id); setEditNav({ date: n.date, nav: n.nav }); }}
                                className="text-xs px-2 py-1 bg-accent-blue/10 border border-accent-blue/30 text-accent-blue rounded-lg hover:bg-accent-blue/20">
                                Edit
                              </button>
                              <button onClick={() => deleteNav(n.id)}
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

        {/* Charts 2×2 grid */}
        {timeline.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">

            {/* Chart 1: value vs contributed */}
            <div className="bg-surface border border-white/10 rounded-xl p-3 md:p-5">
              <h3 className="text-[11px] font-semibold text-secondary uppercase tracking-widest mb-4">
                Fund value vs contributed
              </h3>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={timeline}>
                  <defs>
                    <linearGradient id="gFundValue" x1="0" y1="0" x2="0" y2="1">
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
                  <Area type="monotone" dataKey="Fund value" stroke="#f0b429" strokeWidth={2} fill="url(#gFundValue)" />
                  <Area type="monotone" dataKey="Contributed" stroke="#3d9eff" strokeWidth={2}
                    strokeDasharray="4 3" fill="none" />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Chart 2: cumulative gain */}
            <div className="bg-surface border border-white/10 rounded-xl p-3 md:p-5">
              <h3 className="text-[11px] font-semibold text-secondary uppercase tracking-widest mb-4">
                Cumulative gain
              </h3>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={timeline}>
                  <defs>
                    <linearGradient id="gFundGain" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#00c896" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#00c896" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: '#3d5a78', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#3d5a78', fontSize: 11 }} axisLine={false} tickLine={false} width={60}
                    tickFormatter={v => `€${v.toFixed(2)}`} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="Gain" stroke="#00c896" strokeWidth={2} fill="url(#gFundGain)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Chart 3: NAV evolution */}
            <div className="bg-surface border border-white/10 rounded-xl p-3 md:p-5">
              <h3 className="text-[11px] font-semibold text-secondary uppercase tracking-widest mb-4">
                NAV evolution
              </h3>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={timeline}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: '#3d5a78', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#3d5a78', fontSize: 11 }} axisLine={false} tickLine={false} width={70}
                    domain={['dataMin', 'dataMax']} tickFormatter={v => v.toFixed(2)} />
                  <Tooltip content={<ChartTooltip fmt={fmtNav} />} />
                  <Line type="monotone" dataKey="NAV" stroke="#8b5cf6" strokeWidth={2} dot={{ fill: '#8b5cf6', r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Chart 4: monthly gain + contributions */}
            <div className="bg-surface border border-white/10 rounded-xl p-3 md:p-5">
              <h3 className="text-[11px] font-semibold text-secondary uppercase tracking-widest mb-4">
                Monthly gain & contributions
              </h3>
              <ResponsiveContainer width="100%" height={200}>
                <ComposedChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis dataKey="month" tick={{ fill: '#3d5a78', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="left" tick={{ fill: '#3d5a78', fontSize: 11 }} axisLine={false} tickLine={false} width={60}
                    tickFormatter={v => `€${v.toFixed(0)}`} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fill: '#3d5a78', fontSize: 11 }}
                    axisLine={false} tickLine={false} width={55} tickFormatter={v => `€${v.toFixed(2)}`} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12, color: '#7a95b2' }} />
                  <Bar yAxisId="left" dataKey="Contributed" fill="#3d9eff" radius={[4, 4, 0, 0]} />
                  <Line yAxisId="right" type="monotone" dataKey="Monthly gain" stroke="#00c896" strokeWidth={2}
                    dot={{ fill: '#00c896', r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

          </div>
        ) : (
          <div className="bg-surface border border-white/10 rounded-xl p-10 text-center text-muted text-sm">
            Log a contribution to start tracking the fund.
          </div>
        )}

      </div>
    </div>
  );
}
