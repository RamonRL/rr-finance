import React, { useState, useEffect } from 'react';
import { API_URL } from '../constants';
import { useAccount } from '../AccountContext';

const fmtEur = (v) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(v);

export default function AdminPage() {
  const { accounts, selectedAccount, setSelectedAccount, refreshAccounts } = useAccount();
  const [balances, setBalances] = useState({});
  const [saving, setSaving] = useState(null);
  const [saved, setSaved] = useState(null);

  // Initialise input values from account data
  useEffect(() => {
    const init = {};
    accounts.forEach(a => { init[a.id] = String(a.initial_balance ?? 0); });
    setBalances(init);
  }, [accounts]);

  const handleSave = async (account) => {
    const value = parseFloat(balances[account.id]);
    if (isNaN(value)) return;
    setSaving(account.id);
    const res = await fetch(`${API_URL}/accounts/${account.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initial_balance: value }),
    });
    if (res.ok) {
      refreshAccounts();
      setSaved(account.id);
      setTimeout(() => setSaved(null), 2000);
    }
    setSaving(null);
  };

  return (
    <div className="h-full overflow-y-auto custom-scrollbar p-3 md:p-6">
      <div className="max-w-2xl mx-auto space-y-4 md:space-y-6">

        <div>
          <h2 className="text-lg md:text-xl font-bold text-white">Admin</h2>
          <p className="text-xs md:text-sm text-secondary mt-1">Set the starting balance for each account before you began tracking transactions.</p>
        </div>

        <div className="space-y-3">
          <h3 className="text-[11px] text-secondary uppercase tracking-widest">Active account</h3>
          <div className="flex flex-wrap gap-2">
            {accounts.map(account => (
              <button
                key={account.id}
                onClick={() => setSelectedAccount(account)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-colors"
                style={selectedAccount?.id === account.id ? {
                  backgroundColor: account.color + '22',
                  borderColor: account.color + '66',
                  color: account.color,
                } : {
                  backgroundColor: 'transparent',
                  borderColor: 'rgba(255,255,255,0.1)',
                  color: '#9ca3af',
                }}
              >
                <span>{account.icon}</span>
                <span>{account.name}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <h3 className="text-[11px] text-secondary uppercase tracking-widest">Initial balances</h3>

          {accounts.map(account => (
            <div
              key={account.id}
              className="bg-surface border border-white/10 rounded-xl p-3 md:p-5 flex flex-wrap md:flex-nowrap items-center gap-3 md:gap-4"
              style={{ borderLeftColor: account.color, borderLeftWidth: 3 }}
            >
              <div className="text-2xl md:text-3xl">{account.icon}</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate">{account.name}</p>
                <p className="text-xs text-secondary mt-0.5 truncate">
                  Current: <span className="text-gray-300">{fmtEur(account.initial_balance ?? 0)}</span>
                </p>
              </div>
              <div className="flex items-center gap-2 w-full md:w-auto">
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={balances[account.id] ?? ''}
                  onChange={e => setBalances(prev => ({ ...prev, [account.id]: e.target.value }))}
                  className="bg-elevated border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-muted focus:outline-none focus:border-primary/50 flex-1 md:flex-none md:w-36"
                />
                <button
                  onClick={() => handleSave(account)}
                  disabled={saving === account.id}
                  className="px-4 py-2 text-sm font-semibold rounded-lg transition-colors border"
                  style={{
                    backgroundColor: account.color + '22',
                    borderColor: account.color + '66',
                    color: account.color,
                  }}
                >
                  {saving === account.id ? '...' : saved === account.id ? '✓ Saved' : 'Save'}
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="bg-surface border border-white/10 rounded-xl p-3 md:p-5 text-xs md:text-sm text-secondary space-y-1">
          <p className="font-semibold text-white">What is the initial balance?</p>
          <p>This is the amount you had in each account before you started recording transactions here. It acts as a baseline so balance calculations are accurate from day one.</p>
        </div>

      </div>
    </div>
  );
}
