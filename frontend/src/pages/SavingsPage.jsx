import { useState, useEffect, useMemo, Fragment } from 'react';
import { useStore } from '../hooks/useStore';
import {
  LineChart, Line, BarChart, Bar, ComposedChart,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid,
} from 'recharts';
import { API_URL } from '../constants';
import { IconTrash } from '../components/icons';

// ── Storage ───────────────────────────────────────────────────────────────────
const DEPOSITS_KEY = 'rr-savings-deposits';
const SNAPSHOTS_KEY = 'rr-savings-snapshots';
const PREMIUMS_KEY = 'rr-savings-premiums';
const SAVINGS_ACCOUNT_ID = 3;

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

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

// ── Formatters ────────────────────────────────────────────────────────────────
const fmtEur = (v) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(v ?? 0);

const fmtDate = (s) => {
  if (!s) return '—';
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const addMonths = (dateStr, n) => {
  const d = new Date(dateStr + 'T00:00:00');
  d.setMonth(d.getMonth() + n);
  return d.toISOString().slice(0, 10);
};

const depositToMonth = (dep) => dep.date?.slice(0, 7) ?? '';
const maturityToMonth = (dep) => dep.maturityDate?.slice(0, 7) ?? '';

const displayStatus = (dep) => {
  if (dep.status !== 'active') return dep.status;
  const today = new Date().toISOString().slice(0, 10);
  return dep.maturityDate <= today ? 'matured' : 'active';
};

// ── Chart tooltip ─────────────────────────────────────────────────────────────
const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const fmt = (name, val) => {
    if (name?.toUpperCase().includes('TAE')) return `${Number(val).toFixed(2)}%`;
    return fmtEur(val);
  };
  return (
    <div className="bg-elevated border border-white/10 rounded-lg p-3 text-sm">
      <p className="text-secondary mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color || p.fill }}>
          {p.name}: {fmt(p.name, p.value)}
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

// ── Field wrapper ─────────────────────────────────────────────────────────────
const inputCls = 'w-full bg-elevated border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent-green/50 placeholder-muted';

function Field({ label, children }) {
  return (
    <div>
      <p className="text-xs text-secondary mb-1">{label}</p>
      {children}
    </div>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const cfg = {
    active: 'bg-accent-blue/10 text-accent-blue border-accent-blue/30',
    matured: 'bg-accent-gold/10 text-accent-gold border-accent-gold/30',
    confirmed: 'bg-accent-green/10 text-accent-green border-accent-green/30',
  };
  return (
    <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border ${cfg[status] ?? cfg.active}`}>
      {status}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function SavingsPage() {
  // ── Data state ───────────────────────────────────────────────────────────────
  const [balance, setBalance] = useState(null);
  const [deposits, setDeposits] = useStore(DEPOSITS_KEY, []);
  const [snapshots, setSnapshots] = useStore(SNAPSHOTS_KEY, []);
  const [premiums, setPremiums] = useStore(PREMIUMS_KEY, []);

  // ── Deposit form ─────────────────────────────────────────────────────────────
  const [depDate, setDepDate] = useState(new Date().toISOString().slice(0, 10));
  const [depAmount, setDepAmount] = useState('');
  const [depDuration, setDepDuration] = useState(12);
  const [depTae, setDepTae] = useState('');
  const [depIrpf, setDepIrpf] = useState('19');

  // ── Snapshot form ────────────────────────────────────────────────────────────
  const [snapMonth, setSnapMonth] = useState(new Date().toISOString().slice(0, 7));
  const [snapBalance, setSnapBalance] = useState('');
  const [snapTae, setSnapTae] = useState('');
  const [snapGross, setSnapGross] = useState('');
  const [snapIrpf, setSnapIrpf] = useState('19');

  // ── Premium form ─────────────────────────────────────────────────────────────
  const [premMonth, setPremMonth] = useState(new Date().toISOString().slice(0, 7));
  const [premAmount, setPremAmount] = useState('');

  // ── UI state ─────────────────────────────────────────────────────────────────
  const [confirmingId, setConfirmingId] = useState(null);
  const [confirmGross, setConfirmGross] = useState('');
  const [editingSnapId, setEditingSnapId] = useState(null);
  const [editSnap, setEditSnap] = useState({});

  // ── Persist helpers ──────────────────────────────────────────────────────────
  const persistDeposits = (d) => { setDeposits(d); };
  const persistSnapshots = (d) => { setSnapshots(d); };
  const persistPremiums = (d) => { setPremiums(d); };

  const [balanceTick, setBalanceTick] = useState(0);
  const [txHistory, setTxHistory] = useState([]);
  const refreshBalance = () => setBalanceTick(t => t + 1);

  // ── Fetch Savings account balance + transaction history ───────────────────
  useEffect(() => {
    fetch(`${API_URL}/balances`)
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        if (Array.isArray(data)) {
          const acc = data.find(a => a.name === 'Savings');
          if (acc) setBalance(acc.balance);
        }
      }).catch(() => {});
    fetch(`${API_URL}/transactions?account_id=${SAVINGS_ACCOUNT_ID}`)
      .then(r => r.ok ? r.json() : [])
      .then(data => { if (Array.isArray(data)) setTxHistory(data); })
      .catch(() => {});
  }, [balanceTick]);

  // ── Computed previews ────────────────────────────────────────────────────────
  const depPreview = useMemo(() => {
    const a = parseFloat(depAmount), t = parseFloat(depTae);
    if (!a || !t || !depDate) return null;
    const i = parseFloat(depIrpf) || 0;
    const gross = a * (t / 100) * (Number(depDuration) / 12);
    return { gross, net: gross * (1 - i / 100), maturity: addMonths(depDate, Number(depDuration)) };
  }, [depAmount, depTae, depIrpf, depDuration, depDate]);

  const snapPreviewNet = useMemo(() => {
    const g = parseFloat(snapGross), i = parseFloat(snapIrpf) || 0;
    if (!g) return null;
    return g * (1 - i / 100);
  }, [snapGross, snapIrpf]);

  // ── Form handlers ────────────────────────────────────────────────────────────
  const addDeposit = () => {
    if (!depDate || !depAmount || !depTae) return;
    const a = parseFloat(depAmount), t = parseFloat(depTae), i = parseFloat(depIrpf) || 0;
    const dur = Number(depDuration);
    const gross = a * (t / 100) * (dur / 12);
    persistDeposits([...deposits, {
      id: uid(), date: depDate, amount: a, durationMonths: dur, tae: t, irpf: i,
      maturityDate: addMonths(depDate, dur),
      expectedGrossInterest: gross, expectedNetInterest: gross * (1 - i / 100),
      actualGrossInterest: null, actualNetInterest: null, status: 'active',
    }]);
    setDepAmount(''); setDepTae('');
  };

  const addSnapshot = async () => {
    if (!snapMonth || !snapBalance || !snapGross) return;
    const g = parseFloat(snapGross), i = parseFloat(snapIrpf) || 0;
    const netInterest = g * (1 - i / 100);
    const txId = await postTx({
      date: `${snapMonth}-01`,
      description: `Savings interest — ${snapMonth}`,
      amount: netInterest,
      type: 'income',
      category: 'Investment',
      account_id: SAVINGS_ACCOUNT_ID,
    });
    persistSnapshots([...snapshots, {
      id: uid(), month: snapMonth, balance: parseFloat(snapBalance),
      tae: parseFloat(snapTae) || 0, interestGross: g, irpf: i,
      interestNet: netInterest, txId: txId ?? null,
    }]);
    setSnapBalance(''); setSnapTae(''); setSnapGross('');
    refreshBalance();
  };

  const addPremium = async () => {
    if (!premMonth || !premAmount) return;
    const amount = parseFloat(premAmount);
    const txId = await postTx({
      date: `${premMonth}-01`,
      description: `Savings premium fee — ${premMonth}`,
      amount,
      type: 'expense',
      category: 'Subscriptions',
      account_id: SAVINGS_ACCOUNT_ID,
    });
    persistPremiums([...premiums, { id: uid(), month: premMonth, amount, txId: txId ?? null }]);
    setPremAmount('');
    refreshBalance();
  };

  // ── Confirm maturity ─────────────────────────────────────────────────────────
  const confirmMaturity = async (id) => {
    const g = parseFloat(confirmGross);
    if (!g) return;
    const dep = deposits.find(d => d.id === id);
    if (!dep) return;
    const netInterest = g * (1 - dep.irpf / 100);
    const txId = await postTx({
      date: dep.maturityDate,
      description: `Deposit maturity — ${dep.durationMonths}m @ ${dep.tae}%`,
      amount: netInterest,
      type: 'income',
      category: 'Investment',
      account_id: SAVINGS_ACCOUNT_ID,
    });
    persistDeposits(deposits.map(d =>
      d.id === id
        ? { ...d, actualGrossInterest: g, actualNetInterest: netInterest, status: 'confirmed', txId: txId ?? null }
        : d
    ));
    setConfirmingId(null); setConfirmGross('');
    refreshBalance();
  };

  // ── Snapshot inline edit ─────────────────────────────────────────────────────
  const startEditSnap = (s) => { setEditingSnapId(s.id); setEditSnap({ ...s }); };

  const saveEditSnap = async () => {
    const g = parseFloat(editSnap.interestGross) || 0;
    const i = parseFloat(editSnap.irpf) || 0;
    const netInterest = g * (1 - i / 100);
    await deleteTx(editSnap.txId);
    const txId = await postTx({
      date: `${editSnap.month}-01`,
      description: `Savings interest — ${editSnap.month}`,
      amount: netInterest,
      type: 'income',
      category: 'Investment',
      account_id: SAVINGS_ACCOUNT_ID,
    });
    persistSnapshots(snapshots.map(s =>
      s.id === editingSnapId
        ? { ...editSnap, interestGross: g, irpf: i, interestNet: netInterest, txId: txId ?? null }
        : s
    ));
    setEditingSnapId(null);
    refreshBalance();
  };

  const deleteSnapshot = async (id) => {
    if (!confirm('Delete this snapshot?')) return;
    const sn = snapshots.find(s => s.id === id);
    await deleteTx(sn?.txId);
    persistSnapshots(snapshots.filter(s => s.id !== id));
    refreshBalance();
  };

  // ── Summary ──────────────────────────────────────────────────────────────────
  const summary = useMemo(() => {
    const confirmedGross = deposits.filter(d => d.status === 'confirmed')
      .reduce((s, d) => s + (d.actualGrossInterest ?? 0), 0);
    const confirmedNet = deposits.filter(d => d.status === 'confirmed')
      .reduce((s, d) => s + (d.actualNetInterest ?? 0), 0);
    const accountGross = snapshots.reduce((s, sn) => s + (sn.interestGross || 0), 0);
    const accountNet = snapshots.reduce((s, sn) => s + (sn.interestNet || 0), 0);
    const totalGross = confirmedGross + accountGross;
    const totalNet = confirmedNet + accountNet;
    const inDeposits = deposits.filter(d => d.status === 'active').reduce((s, d) => s + d.amount, 0);
    const latestSnap = [...snapshots].sort((a, b) => b.month.localeCompare(a.month))[0];
    const totalPremiums = premiums.reduce((s, p) => s + p.amount, 0);
    return {
      totalGross, totalNet, inDeposits,
      inAccount: latestSnap?.balance ?? null,
      totalPremiums,
      netBenefit: totalNet - totalPremiums,
      activeCount: deposits.filter(d => displayStatus(d) === 'active').length,
    };
  }, [deposits, snapshots, premiums]);

  // ── Chart data ───────────────────────────────────────────────────────────────
  const allMonths = useMemo(() => {
    const set = new Set([
      ...snapshots.map(s => s.month),
      ...deposits.filter(d => d.status === 'confirmed').map(maturityToMonth),
      ...premiums.map(p => p.month),
    ]);
    return [...set].sort();
  }, [snapshots, deposits, premiums]);

  // Chart 1: cumulative gross + net interest
  const chart1Data = useMemo(() => {
    let cumGross = 0, cumNet = 0;
    return allMonths.map(month => {
      cumGross += snapshots.filter(s => s.month === month).reduce((s, x) => s + x.interestGross, 0)
        + deposits.filter(d => d.status === 'confirmed' && maturityToMonth(d) === month)
            .reduce((s, d) => s + (d.actualGrossInterest || 0), 0);
      cumNet += snapshots.filter(s => s.month === month).reduce((s, x) => s + x.interestNet, 0)
        + deposits.filter(d => d.status === 'confirmed' && maturityToMonth(d) === month)
            .reduce((s, d) => s + (d.actualNetInterest || 0), 0);
      return { month, 'Gross (cum.)': cumGross, 'Net (cum.)': cumNet };
    });
  }, [allMonths, snapshots, deposits]);

  // Chart 2: account balance + locked in deposits per snapshot month
  const chart2Data = useMemo(() =>
    [...snapshots]
      .sort((a, b) => a.month.localeCompare(b.month))
      .map(sn => ({
        month: sn.month,
        'Account balance': sn.balance,
        'Locked in deposits': deposits
          .filter(d => depositToMonth(d) <= sn.month && maturityToMonth(d) > sn.month)
          .reduce((s, d) => s + d.amount, 0),
      })),
  [snapshots, deposits]);

  // Chart 3: monthly interest breakdown + premium fee line
  const chart3Data = useMemo(() =>
    allMonths.map(month => ({
      month,
      'Deposit interest': deposits.filter(d => d.status === 'confirmed' && maturityToMonth(d) === month)
        .reduce((s, d) => s + (d.actualGrossInterest || 0), 0),
      'Account interest': snapshots.filter(s => s.month === month).reduce((s, x) => s + x.interestGross, 0),
      'Premium fee': premiums.filter(p => p.month === month).reduce((s, p) => s + p.amount, 0) || null,
    })),
  [allMonths, snapshots, deposits, premiums]);

  // Chart 4: account TAE line + deposit TAE scatter
  const chart4Data = useMemo(() => {
    const snapByMonth = {};
    snapshots.forEach(s => { snapByMonth[s.month] = s.tae; });
    const depByMonth = {};
    deposits.forEach(d => {
      const m = depositToMonth(d);
      if (!depByMonth[m] || d.tae > depByMonth[m]) depByMonth[m] = d.tae;
    });
    const months = [...new Set([...Object.keys(snapByMonth), ...Object.keys(depByMonth)])].sort();
    return months.map(month => ({
      month,
      'Account TAE': snapByMonth[month] ?? null,
      'Deposit TAE': depByMonth[month] ?? null,
    }));
  }, [snapshots, deposits]);

  // ── Sorted tables ────────────────────────────────────────────────────────────
  const sortedDeposits = useMemo(() =>
    [...deposits].sort((a, b) => b.date.localeCompare(a.date)),
  [deposits]);

  const sortedSnapshots = useMemo(() =>
    [...snapshots].sort((a, b) => b.month.localeCompare(a.month)),
  [snapshots]);

  const sortedPremiums = useMemo(() =>
    [...premiums].sort((a, b) => b.month.localeCompare(a.month)),
  [premiums]);

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col md:flex-row gap-3 md:gap-4 overflow-y-auto md:overflow-hidden p-3 md:p-0">

      {/* ── Left panel ─────────────────────────────────────────────────────── */}
      <div className="w-full md:w-1/5 md:flex-shrink-0 md:overflow-y-auto md:custom-scrollbar space-y-3 md:pr-1">

        <Section title="Log a deposit">
          <Field label="Date">
            <input type="date" value={depDate} onChange={e => setDepDate(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Amount (€)">
            <input type="number" value={depAmount} onChange={e => setDepAmount(e.target.value)}
              placeholder="0" className={inputCls} />
          </Field>
          <Field label="Duration">
            <select value={depDuration} onChange={e => setDepDuration(e.target.value)} className={inputCls}>
              <option value={1}>1 month</option>
              <option value={3}>3 months</option>
              <option value={6}>6 months</option>
              <option value={12}>12 months</option>
            </select>
          </Field>
          <Field label="TAE (%)">
            <input type="number" step="0.01" value={depTae} onChange={e => setDepTae(e.target.value)}
              placeholder="2.75" className={inputCls} />
          </Field>
          <Field label="IRPF (%)">
            <input type="number" step="0.01" value={depIrpf} onChange={e => setDepIrpf(e.target.value)}
              className={inputCls} />
          </Field>
          {depPreview && (
            <div className="bg-elevated/60 rounded-lg px-3 py-2 text-xs text-secondary space-y-0.5">
              <p>Expected gross: <span className="text-accent-green">{fmtEur(depPreview.gross)}</span></p>
              <p>Expected net: <span className="text-accent-green">{fmtEur(depPreview.net)}</span></p>
              <p>Matures: <span className="text-white">{fmtDate(depPreview.maturity)}</span></p>
            </div>
          )}
          <button onClick={addDeposit}
            className="w-full px-4 py-2 bg-accent-green/10 border border-accent-green/30 text-accent-green text-sm font-medium rounded-lg hover:bg-accent-green/20 transition-colors">
            Add deposit
          </button>
        </Section>

        <Section title="Log account snapshot" defaultOpen={false}>
          <Field label="Month">
            <input type="month" value={snapMonth} onChange={e => setSnapMonth(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Balance (€)">
            <input type="number" value={snapBalance} onChange={e => setSnapBalance(e.target.value)}
              placeholder="0" className={inputCls} />
          </Field>
          <Field label="TAE (%)">
            <input type="number" step="0.01" value={snapTae} onChange={e => setSnapTae(e.target.value)}
              placeholder="2.50" className={inputCls} />
          </Field>
          <Field label="Gross interest (€)">
            <input type="number" step="0.01" value={snapGross} onChange={e => setSnapGross(e.target.value)}
              placeholder="0" className={inputCls} />
          </Field>
          <Field label="IRPF (%)">
            <input type="number" step="0.01" value={snapIrpf} onChange={e => setSnapIrpf(e.target.value)}
              className={inputCls} />
          </Field>
          {snapPreviewNet != null && (
            <div className="bg-elevated/60 rounded-lg px-3 py-2 text-xs text-secondary">
              Net interest: <span className="text-accent-green">{fmtEur(snapPreviewNet)}</span>
            </div>
          )}
          <button onClick={addSnapshot}
            className="w-full px-4 py-2 bg-accent-blue/10 border border-accent-blue/30 text-accent-blue text-sm font-medium rounded-lg hover:bg-accent-blue/20 transition-colors">
            Save snapshot
          </button>
        </Section>

        <Section title="Log premium payment" defaultOpen={false}>
          <Field label="Month">
            <input type="month" value={premMonth} onChange={e => setPremMonth(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Amount (€)">
            <input type="number" step="0.01" value={premAmount} onChange={e => setPremAmount(e.target.value)}
              placeholder="0" className={inputCls} />
          </Field>
          <button onClick={addPremium}
            className="w-full px-4 py-2 bg-accent-gold/10 border border-accent-gold/30 text-accent-gold text-sm font-medium rounded-lg hover:bg-accent-gold/20 transition-colors">
            Add payment
          </button>
        </Section>

        {/* Transaction history */}
        {txHistory.length > 0 && (
          <Section title={`History (${txHistory.length})`} defaultOpen={false}>
            <div className="divide-y divide-white/[0.04] max-h-64 overflow-y-auto custom-scrollbar -mx-4 px-0">
              {txHistory.map(tx => (
                <div key={tx.id} className="flex items-start justify-between px-4 py-2 gap-2 hover:bg-white/[0.02]">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-white truncate">{tx.description}</p>
                    <p className="text-[10px] text-muted">{tx.date}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`text-xs tabular-nums font-medium private ${tx.type === 'income' ? 'text-accent-green' : 'text-red-400'}`}>
                      {tx.type === 'income' ? '+' : '-'}{fmtEur(tx.amount)}
                    </span>
                    <button
                      onClick={async () => {
                        if (!confirm('Delete this transaction?')) return;
                        await deleteTx(tx.id);
                        // clean up linked localStorage records
                        const newPremiums = premiums.filter(p => p.txId !== tx.id);
                        if (newPremiums.length !== premiums.length) persistPremiums(newPremiums);
                        const newSnaps = snapshots.filter(s => s.txId !== tx.id);
                        if (newSnaps.length !== snapshots.length) persistSnapshots(newSnaps);
                        const newDeps = deposits.map(d =>
                          d.txId === tx.id ? { ...d, actualGrossInterest: null, actualNetInterest: null, status: 'active', txId: null } : d
                        );
                        if (newDeps.some((d, i) => d !== deposits[i])) persistDeposits(newDeps);
                        refreshBalance();
                      }}
                      className="text-muted hover:text-red-400 transition-colors leading-none inline-flex items-center"
                      title="Delete"><IconTrash size={14} /></button>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Current account balance (from backend) */}
        {balance != null && (
          <div className="bg-surface border border-white/10 rounded-xl p-4 text-center"
            style={{ borderLeft: '2px solid var(--accent-gold)' }}>
            <p className="text-[10px] text-muted uppercase tracking-widest mb-1">Account balance</p>
            <p className="text-2xl font-bold tabular-nums private"
              style={{ color: balance >= 0 ? '#f0b429' : '#ff5c5c' }}>
              {fmtEur(balance)}
            </p>
          </div>
        )}
      </div>

      {/* ── Right panel ────────────────────────────────────────────────────── */}
      <div className="flex-1 md:overflow-y-auto md:custom-scrollbar space-y-3 md:space-y-4 min-w-0">

        {/* Summary bar */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-7 gap-2">
          {[
            { label: 'Total gross interest', value: fmtEur(summary.totalGross), color: 'text-accent-green' },
            { label: 'Total net interest', value: fmtEur(summary.totalNet), color: 'text-accent-green' },
            { label: 'In deposits', value: fmtEur(summary.inDeposits), color: 'text-white' },
            { label: 'In account', value: summary.inAccount != null ? fmtEur(summary.inAccount) : '—', color: 'text-white' },
            { label: 'Premium fees paid', value: fmtEur(summary.totalPremiums), color: 'text-red-400' },
            {
              label: 'Net benefit',
              value: fmtEur(summary.netBenefit),
              color: summary.netBenefit >= 0 ? 'text-accent-green' : 'text-red-400',
            },
            { label: 'Active deposits', value: summary.activeCount, color: 'text-accent-blue' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-surface border border-white/10 rounded-xl p-3 text-center">
              <p className="text-[9px] text-muted uppercase tracking-widest mb-1 leading-tight">{label}</p>
              <p className={`text-base font-bold tabular-nums private ${color}`}>{value}</p>
            </div>
          ))}
        </div>

        {/* Deposits table */}
        <div className="bg-surface border border-white/10 rounded-xl p-3 md:p-5">
          <h3 className="text-[11px] font-semibold text-secondary uppercase tracking-widest mb-3 md:mb-4">Deposits</h3>
          {sortedDeposits.length === 0 ? (
            <p className="text-muted text-sm">No deposits logged yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[960px]">
                <thead>
                  <tr className="text-left text-[10px] text-muted uppercase tracking-widest border-b border-white/[0.06]">
                    {['Date','Dur.','Amount','TAE','IRPF','Maturity','Exp. gross','Exp. net','Act. gross','Act. net','Status','Actions'].map(h => (
                      <th key={h} className="pb-2 pr-3 font-medium whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedDeposits.map(dep => {
                    const status = displayStatus(dep);
                    const isAmber = status === 'matured';
                    return (
                      <Fragment key={dep.id}>
                        <tr className={`border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors ${isAmber ? 'bg-accent-gold/[0.05]' : ''}`}>
                          <td className="py-2 pr-3 text-secondary whitespace-nowrap">{fmtDate(dep.date)}</td>
                          <td className="py-2 pr-3 text-white">{dep.durationMonths}m</td>
                          <td className="py-2 pr-3 text-white tabular-nums private">{fmtEur(dep.amount)}</td>
                          <td className="py-2 pr-3 text-white tabular-nums">{dep.tae}%</td>
                          <td className="py-2 pr-3 text-secondary tabular-nums">{dep.irpf}%</td>
                          <td className="py-2 pr-3 text-secondary whitespace-nowrap">{fmtDate(dep.maturityDate)}</td>
                          <td className="py-2 pr-3 text-accent-green tabular-nums private">{fmtEur(dep.expectedGrossInterest)}</td>
                          <td className="py-2 pr-3 text-accent-green tabular-nums private">{fmtEur(dep.expectedNetInterest)}</td>
                          <td className="py-2 pr-3 tabular-nums private">
                            {dep.actualGrossInterest != null
                              ? <span className="text-accent-green">{fmtEur(dep.actualGrossInterest)}</span>
                              : <span className="text-muted">—</span>}
                          </td>
                          <td className="py-2 pr-3 tabular-nums private">
                            {dep.actualNetInterest != null
                              ? <span className="text-accent-green">{fmtEur(dep.actualNetInterest)}</span>
                              : <span className="text-muted">—</span>}
                          </td>
                          <td className="py-2 pr-3"><StatusBadge status={status} /></td>
                          <td className="py-2">
                            {(status === 'active' || status === 'matured') && (
                              <button
                                onClick={() => { setConfirmingId(dep.id); setConfirmGross(''); }}
                                className="text-xs px-2 py-1 bg-accent-green/10 border border-accent-green/30 text-accent-green rounded-lg hover:bg-accent-green/20 transition-colors whitespace-nowrap">
                                Confirm maturity
                              </button>
                            )}
                          </td>
                        </tr>
                        {confirmingId === dep.id && (
                          <tr className="bg-accent-green/[0.04]">
                            <td colSpan={12} className="px-4 py-3">
                              <div className="flex items-center gap-3 flex-wrap">
                                <span className="text-xs text-secondary">Actual gross interest received:</span>
                                <input type="number" step="0.01" value={confirmGross}
                                  onChange={e => setConfirmGross(e.target.value)}
                                  placeholder="0.00"
                                  className="w-32 bg-elevated border border-white/10 rounded-lg px-2 py-1 text-sm text-white focus:outline-none focus:border-accent-green/50" />
                                {confirmGross && (
                                  <span className="text-xs text-secondary">
                                    Net: <span className="text-accent-green">{fmtEur(parseFloat(confirmGross) * (1 - dep.irpf / 100))}</span>
                                  </span>
                                )}
                                <button onClick={() => confirmMaturity(dep.id)}
                                  className="px-3 py-1 bg-accent-green/10 border border-accent-green/30 text-accent-green text-sm rounded-lg hover:bg-accent-green/20 transition-colors">
                                  Confirm
                                </button>
                                <button onClick={() => setConfirmingId(null)}
                                  className="px-3 py-1 border border-white/10 text-secondary text-sm rounded-lg hover:bg-white/[0.04] transition-colors">
                                  Cancel
                                </button>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Account snapshots table */}
        <div className="bg-surface border border-white/10 rounded-xl p-3 md:p-5">
          <h3 className="text-[11px] font-semibold text-secondary uppercase tracking-widest mb-3 md:mb-4">Account snapshots</h3>
          {sortedSnapshots.length === 0 ? (
            <p className="text-muted text-sm">No snapshots logged yet.</p>
          ) : (
            <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="text-left text-[10px] text-muted uppercase tracking-widest border-b border-white/[0.06]">
                  {['Month','Balance','TAE','Gross interest','IRPF','Net interest','Actions'].map(h => (
                    <th key={h} className="pb-2 pr-4 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedSnapshots.map(sn => {
                  const isEditing = editingSnapId === sn.id;
                  const editNetPreview = isEditing
                    ? (parseFloat(editSnap.interestGross) || 0) * (1 - (parseFloat(editSnap.irpf) || 0) / 100)
                    : null;
                  return (
                    <tr key={sn.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                      <td className="py-2 pr-4 text-secondary">{sn.month}</td>
                      <td className="py-2 pr-4 tabular-nums private">
                        {isEditing
                          ? <input type="number" value={editSnap.balance}
                              onChange={e => setEditSnap(s => ({ ...s, balance: e.target.value }))}
                              className="w-28 bg-elevated border border-white/10 rounded px-2 py-1 text-sm text-white focus:outline-none" />
                          : <span className="text-white">{fmtEur(sn.balance)}</span>}
                      </td>
                      <td className="py-2 pr-4 tabular-nums">
                        {isEditing
                          ? <input type="number" step="0.01" value={editSnap.tae}
                              onChange={e => setEditSnap(s => ({ ...s, tae: e.target.value }))}
                              className="w-20 bg-elevated border border-white/10 rounded px-2 py-1 text-sm text-white focus:outline-none" />
                          : <span className="text-white">{sn.tae}%</span>}
                      </td>
                      <td className="py-2 pr-4 tabular-nums private">
                        {isEditing
                          ? <input type="number" step="0.01" value={editSnap.interestGross}
                              onChange={e => setEditSnap(s => ({ ...s, interestGross: e.target.value }))}
                              className="w-24 bg-elevated border border-white/10 rounded px-2 py-1 text-sm text-white focus:outline-none" />
                          : <span className="text-accent-green">{fmtEur(sn.interestGross)}</span>}
                      </td>
                      <td className="py-2 pr-4 tabular-nums">
                        {isEditing
                          ? <input type="number" step="0.01" value={editSnap.irpf}
                              onChange={e => setEditSnap(s => ({ ...s, irpf: e.target.value }))}
                              className="w-20 bg-elevated border border-white/10 rounded px-2 py-1 text-sm text-white focus:outline-none" />
                          : <span className="text-secondary">{sn.irpf}%</span>}
                      </td>
                      <td className="py-2 pr-4 tabular-nums private">
                        <span className="text-accent-green">
                          {fmtEur(isEditing ? editNetPreview : sn.interestNet)}
                        </span>
                      </td>
                      <td className="py-2">
                        {isEditing ? (
                          <div className="flex gap-2">
                            <button onClick={saveEditSnap}
                              className="text-xs px-2 py-1 bg-accent-green/10 border border-accent-green/30 text-accent-green rounded-lg hover:bg-accent-green/20">
                              Save
                            </button>
                            <button onClick={() => setEditingSnapId(null)}
                              className="text-xs px-2 py-1 border border-white/10 text-secondary rounded-lg hover:bg-white/[0.04]">
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <button onClick={() => startEditSnap(sn)}
                              className="text-xs px-2 py-1 bg-accent-blue/10 border border-accent-blue/30 text-accent-blue rounded-lg hover:bg-accent-blue/20">
                              Edit
                            </button>
                            <button onClick={() => deleteSnapshot(sn.id)}
                              className="text-xs px-2 py-1 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg hover:bg-red-500/20">
                              Del
                            </button>
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

        {/* Premium payments table */}
        {sortedPremiums.length > 0 && (
          <div className="bg-surface border border-white/10 rounded-xl p-3 md:p-5">
            <h3 className="text-[11px] font-semibold text-secondary uppercase tracking-widest mb-3 md:mb-4">Premium fee payments</h3>
            <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[480px]">
              <thead>
                <tr className="text-left text-[10px] text-muted uppercase tracking-widest border-b border-white/[0.06]">
                  <th className="pb-2 pr-4 font-medium">Month</th>
                  <th className="pb-2 pr-4 font-medium">Amount</th>
                  <th className="pb-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedPremiums.map(p => (
                  <tr key={p.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                    <td className="py-2 pr-4 text-secondary">{p.month}</td>
                    <td className="py-2 pr-4 text-red-400 tabular-nums private">{fmtEur(p.amount)}</td>
                    <td className="py-2">
                      <button
                        onClick={async () => {
                          if (!confirm('Delete this premium payment?')) return;
                          await deleteTx(p.txId);
                          persistPremiums(premiums.filter(x => x.id !== p.id));
                          refreshBalance();
                        }}
                        className="text-xs px-2 py-1 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg hover:bg-red-500/20 transition-colors">
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        )}

        {/* Charts 2×2 grid */}
        {allMonths.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">

            {/* Chart 1: Cumulative interest */}
            <div className="bg-surface border border-white/10 rounded-xl p-3 md:p-5">
              <h3 className="text-[11px] font-semibold text-secondary uppercase tracking-widest mb-4">
                Cumulative interest earned
              </h3>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chart1Data}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis dataKey="month" tick={{ fill: '#3d5a78', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#3d5a78', fontSize: 11 }} axisLine={false} tickLine={false} width={55}
                    tickFormatter={v => `€${v.toFixed(0)}`} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12, color: '#7a95b2' }} />
                  <Line type="monotone" dataKey="Gross (cum.)" stroke="#00c896" strokeWidth={2}
                    dot={{ fill: '#00c896', r: 3 }} />
                  <Line type="monotone" dataKey="Net (cum.)" stroke="#3d9eff" strokeWidth={2}
                    dot={{ fill: '#3d9eff', r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Chart 2: Balance + locked in deposits */}
            <div className="bg-surface border border-white/10 rounded-xl p-3 md:p-5">
              <h3 className="text-[11px] font-semibold text-secondary uppercase tracking-widest mb-4">
                Balance & locked in deposits
              </h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={chart2Data}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis dataKey="month" tick={{ fill: '#3d5a78', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#3d5a78', fontSize: 11 }} axisLine={false} tickLine={false} width={55}
                    tickFormatter={v => `€${v.toFixed(0)}`} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12, color: '#7a95b2' }} />
                  <Bar dataKey="Account balance" fill="#f0b429" radius={[4, 4, 0, 0]} stackId="a" />
                  <Bar dataKey="Locked in deposits" fill="#8b5cf6" radius={[0, 0, 0, 0]} stackId="a" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Chart 3: Monthly interest breakdown + premium fee */}
            <div className="bg-surface border border-white/10 rounded-xl p-3 md:p-5">
              <h3 className="text-[11px] font-semibold text-secondary uppercase tracking-widest mb-4">
                Monthly interest breakdown
              </h3>
              <ResponsiveContainer width="100%" height={200}>
                <ComposedChart data={chart3Data}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis dataKey="month" tick={{ fill: '#3d5a78', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#3d5a78', fontSize: 11 }} axisLine={false} tickLine={false} width={55}
                    tickFormatter={v => `€${v.toFixed(0)}`} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12, color: '#7a95b2' }} />
                  <Bar dataKey="Deposit interest" fill="#00c896" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Account interest" fill="#3d9eff" radius={[4, 4, 0, 0]} />
                  <Line type="monotone" dataKey="Premium fee" stroke="#ff5c5c" strokeWidth={2}
                    dot={{ fill: '#ff5c5c', r: 3 }} connectNulls={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* Chart 4: TAE evolution */}
            <div className="bg-surface border border-white/10 rounded-xl p-3 md:p-5">
              <h3 className="text-[11px] font-semibold text-secondary uppercase tracking-widest mb-4">
                TAE evolution
              </h3>
              <ResponsiveContainer width="100%" height={200}>
                <ComposedChart data={chart4Data}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis dataKey="month" tick={{ fill: '#3d5a78', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#3d5a78', fontSize: 11 }} axisLine={false} tickLine={false} width={40}
                    tickFormatter={v => `${v}%`} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12, color: '#7a95b2' }} />
                  <Line type="monotone" dataKey="Account TAE" stroke="#f0b429" strokeWidth={2}
                    dot={{ fill: '#f0b429', r: 3 }} connectNulls />
                  <Line dataKey="Deposit TAE" stroke="#8b5cf6" strokeWidth={0}
                    dot={{ fill: '#8b5cf6', r: 6, strokeWidth: 0 }}
                    activeDot={{ r: 8 }} legendType="circle" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

          </div>
        ) : (
          <div className="bg-surface border border-white/10 rounded-xl p-10 text-center text-muted text-sm">
            Add deposits or account snapshots to see charts.
          </div>
        )}

      </div>
    </div>
  );
}
