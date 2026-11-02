import { useState, useEffect, useMemo } from 'react';
import { API_URL } from '../constants';
import { useStore } from '../hooks/useStore';
import { buildHoldings } from '../utils/holdings';

const DCA_KEY = 'rr-finance-dca-contributions';
const EVO_KEY = 'rr-finance-evolution-data';
const SAVINGS_ID = 3;
const INVESTMENTS_ID = 4;

const fmtEur = (v) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(v ?? 0);
const round2 = (v) => Math.round(v * 100) / 100;
const inputCls = 'w-full bg-elevated border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent-green/50';

/**
 * Books a relocation of Savings cash into the existing DCA assets. Amounts and
 * participations are typed by hand (fees and transfer losses make exact targets
 * impossible); the preview only shows the resulting mix, it never blocks.
 */
export default function RelocatePage() {
  const [contributions, persistContributions] = useStore(DCA_KEY, []);
  const [evData] = useStore(EVO_KEY, {});
  const [savings, setSavings] = useState(null);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [amounts, setAmounts] = useState({});   // assetName -> € actually spent
  const [parts, setParts] = useState({});       // assetName -> participations bought
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch(`${API_URL}/balances`)
      .then(r => (r.ok ? r.json() : []))
      .then(d => setSavings(d.find(a => a.id === SAVINGS_ID)?.balance ?? null))
      .catch(() => {});
  }, [done]);

  const { assetRows, grandTotalEur } = useMemo(
    () => buildHoldings(contributions, evData), [contributions, evData]);

  const num = (v) => parseFloat(v) || 0;
  const total = round2(assetRows.reduce((s, r) => s + num(amounts[r.name]), 0));
  const newTotal = grandTotalEur + total;
  const rows = assetRows.map(r => {
    const amount = num(amounts[r.name]);
    return {
      ...r, amount, participations: num(parts[r.name]),
      before: grandTotalEur > 0 ? (r.totalEur / grandTotalEur) * 100 : 0,
      after: newTotal > 0 ? ((r.totalEur + amount) / newTotal) * 100 : 0,
    };
  });

  const confirm_ = async () => {
    setBusy(true);
    try {
      const planned = rows.filter(r => r.amount > 0);
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
          assetName: r.name, ticker: r.meta.ticker, type: r.meta.type, broker: r.meta.broker,
          month: date.slice(0, 7), amount: r.amount, participations: r.participations,
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
              <p className="text-xs text-secondary mb-1">Savings balance</p>
              <p className="text-white tabular-nums private py-2">{savings == null ? '—' : fmtEur(savings)}</p>
            </div>
            <div>
              <p className="text-xs text-secondary mb-1">Left in Savings after</p>
              <p className="text-accent-green font-semibold tabular-nums private py-2">{savings == null ? '—' : fmtEur(savings - total)}</p>
            </div>
          </div>
        </div>

        <div className="bg-surface border border-white/10 rounded-xl p-5 overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="text-left text-[10px] text-muted uppercase tracking-widest border-b border-white/[0.06]">
                {['Asset', 'Spent (€)', 'Participations', 'Avg price', 'Weight now → after'].map(h => (
                  <th key={h} className="pb-2 pr-4 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.name} className="border-b border-white/[0.04]">
                  <td className="py-2 pr-4 text-white">{r.name}</td>
                  <td className="py-2 pr-4">
                    <input type="number" step="0.01" value={amounts[r.name] ?? ''}
                      onChange={e => setAmounts(a => ({ ...a, [r.name]: e.target.value }))}
                      className="w-28 bg-elevated border border-white/10 rounded px-2 py-1 text-white" />
                  </td>
                  <td className="py-2 pr-4">
                    <input type="number" step="any" value={parts[r.name] ?? ''}
                      onChange={e => setParts(p => ({ ...p, [r.name]: e.target.value }))}
                      className="w-32 bg-elevated border border-white/10 rounded px-2 py-1 text-white" />
                  </td>
                  <td className="py-2 pr-4 tabular-nums text-secondary private">
                    {r.amount > 0 && r.participations > 0 ? fmtEur(r.amount / r.participations) : '—'}
                  </td>
                  <td className="py-2 tabular-nums text-secondary">
                    {r.before.toFixed(1)}% → <span className="text-white">{r.after.toFixed(1)}%</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs mt-3 text-muted">
            Total to book: <span className="tabular-nums private text-white">{fmtEur(total)}</span>. The preview is only
            indicative; amounts don’t need to match any target.
          </p>
        </div>

        <button onClick={confirm_} disabled={total <= 0 || busy}
          className="w-full px-4 py-2.5 bg-accent-green/10 border border-accent-green/30 text-accent-green text-sm font-semibold rounded-lg hover:bg-accent-green/20 transition-colors disabled:opacity-40">
          {busy ? 'Booking…' : 'Book relocation'}
        </button>
      </div>
    </div>
  );
}
