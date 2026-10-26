import { useState, useEffect } from 'react';
import { API_URL } from '../constants';
import { useStore } from '../hooks/useStore';

const fmtEur = (v) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(v ?? 0);

// Emergency fund kept in AXA Trésor Court Terme C (MyInvestor); its balance is the Savings account.
export default function SavingsEmergencyPage() {
  const [config, setConfig] = useStore('rr-emergency-config', { target: 4500 });
  const [balance, setBalance] = useState(null);

  useEffect(() => {
    fetch(`${API_URL}/balances`)
      .then(r => (r.ok ? r.json() : []))
      .then(d => setBalance(d.find(a => a.name === 'Savings')?.balance ?? null))
      .catch(() => {});
  }, []);

  const target = Number(config?.target) || 0;
  const pct = target > 0 && balance != null ? Math.min(100, (balance / target) * 100) : 0;
  const gap = balance != null ? balance - target : null;

  return (
    <div className="h-full overflow-y-auto custom-scrollbar p-3 md:p-6">
      <div className="max-w-xl mx-auto bg-surface border border-white/10 rounded-xl p-5 space-y-4">
        <h3 className="text-[11px] font-semibold text-secondary uppercase tracking-widest">Emergency fund</h3>
        <p className="text-3xl font-bold tabular-nums text-accent-gold private">{balance == null ? '—' : fmtEur(balance)}</p>
        <div className="h-2 bg-white/[0.06] rounded-full">
          <div className="h-2 rounded-full bg-accent-gold" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-xs text-secondary">
          {pct.toFixed(0)}% of target
          {gap != null && <> · <span className={`private ${gap >= 0 ? 'text-accent-green' : 'text-red-400'}`}>
            {gap >= 0 ? '+' : ''}{fmtEur(gap)}</span> vs target</>}
        </p>
        <div>
          <p className="text-xs text-secondary mb-1">Target (€)</p>
          <input type="number" value={config?.target ?? ''}
            onChange={e => setConfig({ ...config, target: e.target.value })}
            className="w-40 bg-elevated border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none" />
        </div>
        <p className="text-[11px] text-muted leading-snug">
          Held in AXA Trésor Court Terme C (MyInvestor). Also the reserve to park money in if you
          ever want to reduce market exposure.
        </p>
      </div>
    </div>
  );
}
