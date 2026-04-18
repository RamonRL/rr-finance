import { useState, useMemo } from 'react';
import {
  PieChart, Pie, Cell,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

const fmtEur = (v) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(v ?? 0);

const FREQUENCIES = [
  { label: 'Monthly',     perYear: 12 },
  { label: 'Quarterly',   perYear: 4  },
  { label: 'Semi-annual', perYear: 2  },
  { label: 'Annual',      perYear: 1  },
];

const C = {
  initial:  '#8b5cf6',
  deposits: '#3d9eff',
  interest: '#00c896',
};

function computeYearly(initialBalance, periodicDeposit, annualRate, duration, perYear, beginning) {
  const r = (annualRate / 100) / perYear;
  const rows = [];
  let balance = initialBalance;
  let cumDeposits = 0;
  let cumInterest = 0;

  for (let year = 1; year <= duration; year++) {
    let yearDeposits = 0;
    let yearInterest = 0;

    for (let p = 0; p < perYear; p++) {
      if (beginning) {
        balance += periodicDeposit;
        yearDeposits += periodicDeposit;
        const int = balance * r;
        balance += int;
        yearInterest += int;
      } else {
        const int = balance * r;
        balance += int;
        yearInterest += int;
        balance += periodicDeposit;
        yearDeposits += periodicDeposit;
      }
    }

    cumDeposits += yearDeposits;
    cumInterest += yearInterest;
    rows.push({ year, yearDeposits, cumDeposits, yearInterest, cumInterest, balance });
  }

  return rows;
}

const inputCls =
  'bg-elevated border border-white/10 rounded-lg px-3 py-2 text-sm text-white ' +
  'placeholder-muted focus:outline-none focus:border-primary/50 w-full';

const PieTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div className="bg-elevated border border-white/10 rounded-lg p-3 text-sm">
      <p style={{ color: d.payload.fill }}>{d.name}</p>
      <p className="text-white private">{fmtEur(d.value)}</p>
    </div>
  );
};

const BarTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-elevated border border-white/10 rounded-lg p-3 text-sm">
      <p className="text-secondary mb-1">Year {label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color: p.fill }}>{p.name}: {fmtEur(p.value)}</p>
      ))}
    </div>
  );
};

export default function CalculatorPage() {
  const [mobileFormOpen,   setMobileFormOpen]   = useState(false);
  const [initialBalance,   setInitialBalance]   = useState('1000');
  const [periodicDeposit,  setPeriodicDeposit]  = useState('100');
  const [freqIndex,        setFreqIndex]        = useState(0);       // Monthly
  const [beginning,        setBeginning]        = useState(true);
  const [annualRate,       setAnnualRate]       = useState('1');
  const [duration,         setDuration]         = useState('10');

  const freq = FREQUENCIES[freqIndex];

  const data = useMemo(() => {
    const ib  = parseFloat(initialBalance)  || 0;
    const pd  = parseFloat(periodicDeposit) || 0;
    const ar  = parseFloat(annualRate)      || 0;
    const dur = parseInt(duration, 10)      || 0;
    if (dur < 1) return [];
    return computeYearly(ib, pd, ar, dur, freq.perYear, beginning);
  }, [initialBalance, periodicDeposit, annualRate, duration, freq, beginning]);

  const last = data[data.length - 1];
  const ib   = parseFloat(initialBalance) || 0;
  const pd   = parseFloat(periodicDeposit) || 0;
  const dur  = parseInt(duration, 10) || 0;

  const pieData = last ? [
    { name: 'Initial balance',    value: ib,                 fill: C.initial  },
    { name: 'Periodic deposits',  value: last.cumDeposits,   fill: C.deposits },
    { name: 'Total interest',     value: last.cumInterest,   fill: C.interest },
  ] : [];

  const barData = data.map(r => ({
    year:              r.year,
    'Initial balance': ib,
    'Deposits':        r.cumDeposits,
    'Interest':        r.cumInterest,
  }));

  const yFmt = (v) => {
    if (v >= 1_000_000) return `€${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000)     return `€${(v / 1_000).toFixed(0)}k`;
    return `€${v.toFixed(0)}`;
  };

  const barSize = Math.max(6, Math.min(28, Math.floor(260 / Math.max(data.length, 1))));

  return (
    <div className="h-full flex flex-col md:flex-row gap-3 md:gap-6 md:overflow-hidden overflow-y-auto">

      {/* ── Left panel: inputs ─────────────────────────────────────────────── */}
      <div className="w-full md:w-1/5 md:flex-shrink-0 md:overflow-y-auto md:custom-scrollbar space-y-3">
        {/* Mobile toggle */}
        <button
          onClick={() => setMobileFormOpen(o => !o)}
          className="md:hidden w-full flex items-center justify-between px-4 py-3 bg-surface border border-white/10 rounded-xl text-sm font-semibold text-white hover:border-accent-green/40 transition-colors"
        >
          <span className="flex items-center gap-2">
            <span className="text-accent-green text-base leading-none">{mobileFormOpen ? '×' : '+'}</span>
            Compound interest
          </span>
          <span className="text-xs text-muted">{mobileFormOpen ? 'Close' : 'Tap to open'}</span>
        </button>

        <div className={`${mobileFormOpen ? 'block' : 'hidden'} md:block bg-surface border border-white/10 rounded-xl p-3 md:p-5 space-y-4`}>

          <h3 className="text-[11px] font-semibold text-secondary uppercase tracking-widest">
            Compound interest
          </h3>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-secondary">Initial balance (€)</label>
            <input type="number" min="0" step="0.01" placeholder="0.00"
              value={initialBalance} onChange={e => setInitialBalance(e.target.value)}
              className={inputCls} />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-secondary">Periodic deposit (€)</label>
            <input type="number" min="0" step="0.01" placeholder="0.00"
              value={periodicDeposit} onChange={e => setPeriodicDeposit(e.target.value)}
              className={inputCls} />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-secondary">Frequency</label>
            <select value={freqIndex} onChange={e => setFreqIndex(Number(e.target.value))}
              className={inputCls}>
              {FREQUENCIES.map((f, i) => <option key={f.label} value={i}>{f.label}</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-secondary">Deposit timing</label>
            <select value={beginning ? 'beg' : 'end'} onChange={e => setBeginning(e.target.value === 'beg')}
              className={inputCls}>
              <option value="beg">Beginning of period</option>
              <option value="end">End of period</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-secondary">Annual interest rate (%)</label>
            <input type="number" min="0" max="100" step="0.001" placeholder="0.000"
              value={annualRate} onChange={e => setAnnualRate(e.target.value)}
              className={inputCls} />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-secondary">Duration (years)</label>
            <input type="number" min="1" max="100" step="1" placeholder="10"
              value={duration} onChange={e => setDuration(e.target.value)}
              className={inputCls} />
          </div>

        </div>
      </div>

      {/* ── Right panel: results ───────────────────────────────────────────── */}
      <div className="flex-1 md:overflow-y-auto md:custom-scrollbar space-y-4 md:space-y-6 min-w-0">

        {data.length === 0 && (
          <div className="h-40 flex items-center justify-center text-muted text-sm">
            Enter a duration ≥ 1 year to see projections.
          </div>
        )}

        {/* Summary */}
        {last && (
          <div className="bg-surface border border-white/10 rounded-xl p-4 md:p-6">
            <p className="text-[11px] text-secondary uppercase tracking-widest mb-1">You can save</p>
            <p className="text-3xl font-bold text-white tabular-nums private mb-1">
              {fmtEur(last.balance)}
            </p>
            <p className="text-sm text-secondary">
              saving {fmtEur(pd)} {freq.label.toLowerCase()} for {dur} year{dur !== 1 ? 's' : ''}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 md:gap-3 mt-4 md:mt-5">
              {[
                { label: 'Initial balance',   value: fmtEur(ib),               color: C.initial  },
                { label: 'Periodic deposits', value: fmtEur(last.cumDeposits),  color: C.deposits },
                { label: 'Total interest',    value: fmtEur(last.cumInterest),  color: C.interest },
              ].map(card => (
                <div key={card.label}
                  className="bg-elevated/50 rounded-lg px-4 py-3 border border-white/[0.06]"
                  style={{ borderLeft: `2px solid ${card.color}` }}>
                  <p className="text-[10px] text-secondary uppercase tracking-widest mb-0.5">
                    {card.label}
                  </p>
                  <p className="text-sm font-bold tabular-nums private" style={{ color: card.color }}>
                    {card.value}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Charts */}
        {last && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">

            {/* Pie */}
            <div className="bg-surface border border-white/10 rounded-xl p-3 md:p-5">
              <h4 className="text-[11px] text-secondary uppercase tracking-widest mb-4">
                Distribution
              </h4>
              <div className="flex gap-4 items-center">
                <ResponsiveContainer width="50%" height={180}>
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name"
                      cx="50%" cy="50%" innerRadius={42} outerRadius={72} strokeWidth={0}>
                      {pieData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                    </Pie>
                    <Tooltip content={<PieTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-2.5">
                  {pieData.map(d => (
                    <div key={d.name}>
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: d.fill }} />
                        <span className="text-[11px] text-secondary">{d.name}</span>
                      </div>
                      <span className="text-xs font-semibold text-white tabular-nums private pl-3.5">
                        {fmtEur(d.value)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Bar */}
            <div className="bg-surface border border-white/10 rounded-xl p-3 md:p-5">
              <h4 className="text-[11px] text-secondary uppercase tracking-widest mb-4">
                Growth over time
              </h4>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={barData} barSize={barSize} barCategoryGap="20%">
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis dataKey="year" tick={{ fill: '#3d5a78', fontSize: 11 }}
                    axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#3d5a78', fontSize: 11 }}
                    axisLine={false} tickLine={false} width={55} tickFormatter={yFmt} />
                  <Tooltip content={<BarTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11, color: '#7a95b2' }} />
                  <Bar dataKey="Initial balance" stackId="a" fill={C.initial} />
                  <Bar dataKey="Deposits"        stackId="a" fill={C.deposits} />
                  <Bar dataKey="Interest"        stackId="a" fill={C.interest} radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

          </div>
        )}

        {/* Year-by-year table */}
        {data.length > 0 && (
          <div className="bg-surface border border-white/10 rounded-xl overflow-hidden">
            <div className="p-5 border-b border-white/[0.06]">
              <h4 className="text-[11px] text-secondary uppercase tracking-widest">Year by year</h4>
            </div>
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-secondary uppercase tracking-widest
                    border-b border-white/[0.06]">
                    <th className="px-5 py-3 text-left">Year</th>
                    <th className="px-5 py-3 text-right">Deposits this year</th>
                    <th className="px-5 py-3 text-right">Total deposits</th>
                    <th className="px-5 py-3 text-right">Total interest</th>
                    <th className="px-5 py-3 text-right pr-6">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map(row => (
                    <tr key={row.year}
                      className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                      <td className="px-5 py-3 text-secondary">{row.year}</td>
                      <td className="px-5 py-3 text-right tabular-nums text-white private">
                        {fmtEur(row.yearDeposits)}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums text-white private">
                        {fmtEur(row.cumDeposits)}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums private"
                        style={{ color: C.interest }}>
                        {fmtEur(row.cumInterest)}
                      </td>
                      <td className="px-5 py-3 pr-6 text-right tabular-nums text-white font-semibold private">
                        {fmtEur(row.balance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
