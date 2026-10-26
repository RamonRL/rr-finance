import { useState, useEffect, useMemo } from 'react';
import { API_URL } from '../constants';
import { useStore } from '../hooks/useStore';

const DCA_KEY = 'rr-finance-dca-contributions';
const START_MONTH = '2026-02';
const SAVINGS_ID = 3;
const INVESTMENTS_ID = 4;

const fmtEur = (v) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(v ?? 0);
const round2 = (v) => Math.round(v * 100) / 100;
const inputCls = 'w-full bg-elevated border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent-green/50';

/**
 * Moves freed-up Savings cash into the existing DCA assets. Weights default to
 * each asset's share of what has been invested so far, so the current mix is kept.
 */
export default function RelocatePage() {
  const [contributions, persistContributions] = useStore(DCA_KEY, []);
  const [savings, setSavings] = useState(null);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [emergency, setEmergency] = useState('4500');
  const [weights, setWeights] = useState({});   // assetName -> % override
  const [parts, setParts] = useState({});       // assetName -> participations bought
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch(`${API_URL}/balances`)
      .then(r => (r.ok ? r.json() : []))
      .then(d => setSavings(d.find(a => a.id === SAVINGS_ID)?.balance ?? null))
      .catch(() => {});
  }, [done]);

  const assets = useMemo(() => {
    const map = {};
    contributions.filter(c => c.month >= START_MONTH).forEach(c => {
      const a = (map[c.assetName] ??= { ...c, cost: 0 });
      a.cost += c.amount;
      a.ticker = c.ticker || a.ticker;
      a.broker = c.broker || a.broker;
    });
    return Object.values(map);
  }, [contributions]);

  const totalCost = assets.reduce((s, a) => s + a.cost, 0);
  const available = Math.max(0, round2((savings ?? 0) - (parseFloat(emergency) || 0)));

  const rows = assets.map(a => {
    const pct = weights[a.assetName] != null
      ? parseFloat(weights[a.assetName]) || 0
      : (totalCost > 0 ? (a.cost / totalCost) * 100 : 0);
    return { ...a, pct, amount: round2((available * pct) / 100) };
  });
  const pctSum = rows.reduce((s, r) => s + r.pct, 0);
  const valid = available > 0 && Math.abs(pctSum - 100) < 0.01 && !busy;

  const confirm_ = async () => {
    setBusy(true);
    try {
      const planned = rows.filter(r => r.amount > 0);
      const total = round2(planned.reduce((s, r) => s + r.amount, 0));
      const res = await fetch(`${API_URL}/transfers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from_account_id: SAVINGS_ID, to_account_id: INVESTMENTS_ID,
          amount: total, date, notes: 'Relocation of Savings into investments',
        }),
      });
      if (!res.ok) throw new Error('Could not create the transfer');
      persistContributions([
        ...contributions,
        ...planned.map(r => ({
          id: crypto.randomUUID(),
          assetName: r.assetName, ticker: r.ticker, type: r.type, broker: r.broker,
          month: date.slice(0, 7), amount: r.amount,
          participations: parseFloat(parts[r.assetName]) || 0,
        })),
      ]);
      setDone(true);
    } catch (e) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="bg-surface border border-white/10 rounded-xl p-6 text-sm text-secondary">
        Relocation booked: transfer Savings → Investments and one DCA entry per asset.
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto custom-scrollbar p-3 md:p-6">
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="bg-surface border border-white/10 rounded-xl p-5 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <p className="text-xs text-secondary mb-1">Date</p>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputCls} />
            </div>
            <div>
              <p className="text-xs text-secondary mb-1">Emergency fund to keep (€)</p>
              <input type="number" value={emergency} onChange={e => setEmergency(e.target.value)} className={inputCls} />
            </div>
            <div>
              <p className="text-xs text-secondary mb-1">Savings balance</p>
              <p className="text-white tabular-nums private py-2">{savings == null ? '—' : fmtEur(savings)}</p>
            </div>
          </div>
          <p className="text-sm text-secondary">
            To relocate: <span className="text-accent-green font-semibold tabular-nums private">{fmtEur(available)}</span>
          </p>
        </div>

        <div className="bg-surface border border-white/10 rounded-xl p-5 overflow-x-auto">
          <table className="w-full text-sm min-w-[520px]">
            <thead>
              <tr className="text-left text-[10px] text-muted uppercase tracking-widest border-b border-white/[0.06]">
                {['Asset', 'Weight %', 'Amount', 'Participations'].map(h => (
                  <th key={h} className="pb-2 pr-4 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.assetName} className="border-b border-white/[0.04]">
                  <td className="py-2 pr-4 text-white">{r.assetName}</td>
                  <td className="py-2 pr-4">
                    <input type="number" step="0.01" value={weights[r.assetName] ?? r.pct.toFixed(2)}
                      onChange={e => setWeights(w => ({ ...w, [r.assetName]: e.target.value }))}
                      className="w-24 bg-elevated border border-white/10 rounded px-2 py-1 text-white" />
                  </td>
                  <td className="py-2 pr-4 tabular-nums private text-white">{fmtEur(r.amount)}</td>
                  <td className="py-2">
                    <input type="number" step="any" value={parts[r.assetName] ?? ''}
                      onChange={e => setParts(p => ({ ...p, [r.assetName]: e.target.value }))}
                      placeholder="needed for valuation"
                      className="w-36 bg-elevated border border-white/10 rounded px-2 py-1 text-white" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className={`text-xs mt-3 ${Math.abs(pctSum - 100) < 0.01 ? 'text-muted' : 'text-red-400'}`}>
            Weights add up to {pctSum.toFixed(2)}% (must be 100%).
          </p>
        </div>

        <button onClick={confirm_} disabled={!valid}
          className="w-full px-4 py-2.5 bg-accent-green/10 border border-accent-green/30 text-accent-green text-sm font-semibold rounded-lg hover:bg-accent-green/20 transition-colors disabled:opacity-40">
          {busy ? 'Booking…' : 'Book relocation'}
        </button>
      </div>
    </div>
  );
}
