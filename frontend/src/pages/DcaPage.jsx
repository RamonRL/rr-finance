import React, { useState, useMemo } from 'react';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Legend,
} from 'recharts';
import { useStore } from '../hooks/useStore';
import { getStore, setStore } from '../api/store';
import { IconClose, IconPlus, IconCheck, IconPencil, IconTrash } from '../components/icons';

const EVO_KEY = 'rr-finance-evolution-data';
const START_MONTH = '2026-02';

const DCA_TYPES = ['Indexed Fund', 'ETF', 'Crypto', 'Gold', 'Other'];

const TYPE_COLORS = {
  'Indexed Fund': '#6366f1',
  'ETF':          '#00c896',
  'Crypto':       '#f97316',
  'Gold':         '#f0b429',
  'Other':        '#7a95b2',
};

const ASSET_PALETTE = [
  '#6366f1', '#00c896', '#f0b429', '#ec4899', '#f97316',
  '#06b6d4', '#8b5cf6', '#ff5c5c', '#14b8a6', '#a855f7',
  '#84cc16', '#e879f9', '#fb923c', '#2dd4bf', '#f472b6',
];

const fmtEur = (v) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(v);

const fmtMonth = (ym) => {
  const [y, m] = ym.split('-');
  return new Date(y, m - 1).toLocaleString('en-US', { month: 'short', year: 'numeric' });
};


const CURRENT_MONTH = new Date().toISOString().slice(0, 7);

const EMPTY_EXISTING_FORM = { assetName: '', month: CURRENT_MONTH, amount: '', participations: '' };

const EMPTY_NEW_FORM = {
  assetName: '',
  ticker: '',
  type: 'Indexed Fund',
  broker: '',
  month: CURRENT_MONTH,
  amount: '',
  participations: '',
};

const FIXED_COLS = [
  { key: 'actions', label: '',           width: 72,  align: 'center' },
  { key: 'asset',   label: 'Asset',      width: 389, align: 'left'   },
  { key: 'total',   label: 'Total (€)',  width: 110, align: 'right'  },
  { key: 'pct',     label: '% of total', width: 110,  align: 'right'  },
];

const FIXED_OFFSETS = FIXED_COLS.reduce((acc, col, i) => {
  acc.push(i === 0 ? 0 : acc[i - 1] + FIXED_COLS[i - 1].width);
  return acc;
}, []);

const FIXED_TOTAL_WIDTH =
  FIXED_OFFSETS[FIXED_OFFSETS.length - 1] + FIXED_COLS[FIXED_COLS.length - 1].width;

const stickyStyle = (i, extra) => ({
  position: 'sticky',
  left: FIXED_OFFSETS[i],
  zIndex: 10,
  minWidth: FIXED_COLS[i].width,
  maxWidth: FIXED_COLS[i].width,
  background: '#0e1c2f',
  ...(i === FIXED_COLS.length - 1 ? { boxShadow: '4px 0 8px -4px rgba(0,0,0,0.3)' } : {}),
  ...extra,
});

const PieTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div className="bg-elevated border border-white/10 rounded-lg p-3 text-sm">
      <p style={{ color: d.payload.fill }}>{d.name}</p>
      <p className="text-white">{fmtEur(d.value)}</p>
      <p className="text-secondary">{d.payload.pct.toFixed(1)}%</p>
    </div>
  );
};

const BarTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-elevated border border-white/10 rounded-lg p-3 text-sm">
      <p className="text-secondary mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.fill || p.color }}>{p.name}: {fmtEur(p.value)}</p>
      ))}
    </div>
  );
};

const DcaPage = () => {
  const [contributions, persistContributions] = useStore('rr-finance-dca-contributions', []);
  const [activeTab, setActiveTab] = useState('existing');
  const [mobileFormOpen, setMobileFormOpen] = useState(false);
  const [existingForm, setExistingForm] = useState(EMPTY_EXISTING_FORM);
  const [newForm, setNewForm] = useState(EMPTY_NEW_FORM);

  const persist = (next) => { persistContributions(next); };

  const handleSubmitExisting = (e) => {
    e.preventDefault();
    const meta = assets.find((a) => a.assetName === existingForm.assetName);
    if (!meta) return;
    const entry = {
      id: crypto.randomUUID(),
      assetName: meta.assetName,
      ticker: meta.ticker,
      type: meta.type,
      broker: meta.broker,
      month: existingForm.month,
      amount: parseFloat(existingForm.amount),
      participations: existingForm.participations !== '' ? parseFloat(existingForm.participations) : 0,
    };
    persist([...contributions, entry]);
    setExistingForm(EMPTY_EXISTING_FORM);
  };

  const handleSubmitNew = (e) => {
    e.preventDefault();
    const entry = {
      id: crypto.randomUUID(),
      assetName: newForm.assetName.trim(),
      ticker: newForm.ticker.trim(),
      type: newForm.type,
      broker: newForm.broker.trim(),
      month: newForm.month,
      amount: parseFloat(newForm.amount),
      participations: newForm.participations !== '' ? parseFloat(newForm.participations) : 0,
    };
    persist([...contributions, entry]);
    setNewForm(EMPTY_NEW_FORM);
  };

  const handleDelete = (assetName) => {
    persist(contributions.filter((c) => c.assetName !== assetName));
  };

  const handleDeleteContribution = (id) => {
    persist(contributions.filter((c) => c.id !== id));
  };

  const [editingAsset, setEditingAsset] = useState(null);
  const [editForm, setEditForm] = useState({ assetName: '', ticker: '', type: 'Indexed Fund', broker: '' });

  const startEdit = (a) => {
    setEditingAsset(a.assetName);
    setEditForm({ assetName: a.assetName, ticker: a.ticker || '', type: a.type, broker: a.broker || '' });
  };

  const handleSaveEdit = () => {
    const oldName = editingAsset;
    const newName = editForm.assetName.trim();
    if (!newName) return;

    persist(contributions.map((c) => c.assetName !== oldName ? c : {
      ...c,
      assetName: newName,
      ticker:    editForm.ticker.trim(),
      type:      editForm.type,
      broker:    editForm.broker.trim(),
    }));

    // Migrate Evolution price keys if name changed
    if (newName !== oldName) {
      getStore(EVO_KEY, {}).then(evRaw => {
        const evNext = {};
        Object.entries(evRaw).forEach(([k, v]) => {
          evNext[k.startsWith(`${oldName}___`) ? `${newName}___${k.slice(oldName.length + 3)}` : k] = v;
        });
        setStore(EVO_KEY, evNext);
      });
    }

    setEditingAsset(null);
  };

  const { assets, months, grandTotal } = useMemo(() => {
    const map = {};
    const monthSet = new Set();

    contributions.filter((c) => c.month >= START_MONTH).forEach((c) => {
      if (!map[c.assetName]) {
        map[c.assetName] = {
          assetName: c.assetName, ticker: c.ticker,
          type: c.type, broker: c.broker, months: {}, total: 0,
        };
      }
      const a = map[c.assetName];
      a.ticker = c.ticker || a.ticker;
      a.type   = c.type;
      a.broker = c.broker || a.broker;
      a.months[c.month] = (a.months[c.month] || 0) + c.amount;
      a.total += c.amount;
      monthSet.add(c.month);
    });

    const assets = Object.values(map);
    const months = [...monthSet].sort();
    const grandTotal = assets.reduce((s, a) => s + a.total, 0);
    return { assets, months, grandTotal };
  }, [contributions]);

  const monthlyTotals = useMemo(() => {
    const t = {};
    months.forEach((m) => { t[m] = assets.reduce((s, a) => s + (a.months[m] || 0), 0); });
    return t;
  }, [assets, months]);

  const typeData = useMemo(() => {
    const map = {};
    assets.forEach((a) => { map[a.type] = (map[a.type] || 0) + a.total; });
    return Object.entries(map)
      .map(([type, value]) => ({
        name: type, value,
        fill: TYPE_COLORS[type] || TYPE_COLORS.Other,
        pct: grandTotal > 0 ? (value / grandTotal) * 100 : 0,
      }))
      .sort((a, b) => b.value - a.value);
  }, [assets, grandTotal]);

  const { assetBarData, assetNames, assetColorMap } = useMemo(() => {
    const byType = {};
    assets.forEach((a) => {
      if (!byType[a.type]) byType[a.type] = [];
      byType[a.type].push(a);
    });
    const data = Object.entries(byType).map(([type, list]) => {
      const entry = { type };
      list.forEach((a) => { entry[a.assetName] = a.total; });
      return entry;
    });
    const names = assets.map((a) => a.assetName);
    const colorMap = {};
    names.forEach((n, i) => { colorMap[n] = ASSET_PALETTE[i % ASSET_PALETTE.length]; });
    return { assetBarData: data, assetNames: names, assetColorMap: colorMap };
  }, [assets]);

  const inputCls = 'bg-elevated border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-muted focus:outline-none focus:border-primary';

  return (
    <div className="h-full flex flex-col md:flex-row gap-3 md:gap-6 md:overflow-hidden overflow-y-auto">

      {/* ---- Left panel ---- */}
      <div className="w-full md:w-1/5 md:flex-shrink-0 md:overflow-y-auto md:custom-scrollbar space-y-3">
        {/* Mobile toggle */}
        <button
          onClick={() => setMobileFormOpen(o => !o)}
          className="md:hidden w-full flex items-center justify-between px-4 py-3 bg-surface border border-white/10 rounded-xl text-sm font-semibold text-white hover:border-accent-green/40 transition-colors"
        >
          <span className="flex items-center gap-2">
            <span className="text-accent-green leading-none">{mobileFormOpen ? <IconClose size={16} /> : <IconPlus size={16} />}</span>
            Log contribution
          </span>
          <span className="text-xs text-muted">{mobileFormOpen ? 'Close' : 'Tap to open'}</span>
        </button>

        <div className={`${mobileFormOpen ? 'block' : 'hidden'} md:block bg-surface border border-white/10 rounded-xl overflow-hidden md:sticky md:top-0`}>
          <h3 className="text-[11px] font-semibold text-secondary uppercase tracking-widest px-5 pt-5 pb-3">
            Log contribution
          </h3>

          {/* Tabs */}
          <div className="flex border-b border-white/[0.06]">
            {[
              { id: 'existing', label: 'Existing' },
              { id: 'new',      label: 'New asset' },
              { id: 'history',  label: 'History' },
            ].map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`flex-1 py-2 text-xs font-medium transition-colors ${
                  activeTab === id
                    ? 'text-primary border-b-2 border-primary'
                    : 'text-secondary hover:text-white border-b-2 border-transparent'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="p-5">
            {activeTab === 'existing' ? (
              assets.length === 0 ? (
                <p className="text-xs text-muted text-center py-4">
                  No assets yet. Add a new one first.
                </p>
              ) : (
                <form onSubmit={handleSubmitExisting} className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-secondary">Asset</label>
                    <select required value={existingForm.assetName}
                      onChange={(e) => setExistingForm((f) => ({ ...f, assetName: e.target.value }))}
                      className={inputCls}>
                      <option value="">Select asset…</option>
                      {assets.map((a) => (
                        <option key={a.assetName} value={a.assetName}>{a.assetName}</option>
                      ))}
                    </select>
                    {existingForm.assetName && (() => {
                      const meta = assets.find((a) => a.assetName === existingForm.assetName);
                      const typeColor = TYPE_COLORS[meta?.type] || TYPE_COLORS.Other;
                      return (
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {meta?.ticker && <span className="font-mono text-[11px] text-secondary">{meta.ticker}</span>}
                          <span className="px-1.5 py-px rounded text-[10px] font-medium"
                            style={{ background: typeColor + '22', color: typeColor }}>{meta?.type}</span>
                          {meta?.broker && <span className="text-[11px] text-muted">{meta.broker}</span>}
                        </div>
                      );
                    })()}
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-secondary">Month</label>
                    <input type="month" required value={existingForm.month}
                      onChange={(e) => setExistingForm((f) => ({ ...f, month: e.target.value }))}
                      className={inputCls} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-secondary">Amount (€)</label>
                    <input type="number" required step="any" min="0.01" placeholder="0.00"
                      value={existingForm.amount}
                      onChange={(e) => setExistingForm((f) => ({ ...f, amount: e.target.value }))}
                      className={inputCls} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-secondary">Participations (N)</label>
                    <input type="number" step="any" min="0" placeholder="0"
                      value={existingForm.participations}
                      onChange={(e) => setExistingForm((f) => ({ ...f, participations: e.target.value }))}
                      className={inputCls} />
                  </div>
                  <button type="submit"
                    className="mt-2 px-4 py-2 bg-primary hover:bg-primary/80 text-background rounded-lg text-sm font-medium transition-colors">
                    Add contribution
                  </button>
                </form>
              )
            ) : activeTab === 'new' ? (
              <form onSubmit={handleSubmitNew} className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-secondary">Asset name</label>
                  <input type="text" required placeholder="e.g. Vanguard S&P 500"
                    value={newForm.assetName}
                    onChange={(e) => setNewForm((f) => ({ ...f, assetName: e.target.value }))}
                    className={inputCls} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-secondary">Ticker / ISIN</label>
                  <input type="text" placeholder="e.g. VUSA or IE00B3XXRP09"
                    value={newForm.ticker}
                    onChange={(e) => setNewForm((f) => ({ ...f, ticker: e.target.value }))}
                    className={inputCls} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-secondary">Type</label>
                  <select value={newForm.type}
                    onChange={(e) => setNewForm((f) => ({ ...f, type: e.target.value }))}
                    className={inputCls}>
                    {DCA_TYPES.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-secondary">Broker</label>
                  <input type="text" placeholder="e.g. DEGIRO, Revolut"
                    value={newForm.broker}
                    onChange={(e) => setNewForm((f) => ({ ...f, broker: e.target.value }))}
                    className={inputCls} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-secondary">Month</label>
                  <input type="month" required value={newForm.month}
                    onChange={(e) => setNewForm((f) => ({ ...f, month: e.target.value }))}
                    className={inputCls} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-secondary">Amount (€)</label>
                  <input type="number" required step="any" min="0.01" placeholder="0.00"
                    value={newForm.amount}
                    onChange={(e) => setNewForm((f) => ({ ...f, amount: e.target.value }))}
                    className={inputCls} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-secondary">Participations (N)</label>
                  <input type="number" step="any" min="0" placeholder="0"
                    value={newForm.participations}
                    onChange={(e) => setNewForm((f) => ({ ...f, participations: e.target.value }))}
                    className={inputCls} />
                </div>
                <button type="submit"
                  className="mt-2 px-4 py-2 bg-primary hover:bg-primary/80 text-background rounded-lg text-sm font-medium transition-colors">
                  Add contribution
                </button>
              </form>
            ) : activeTab === 'history' ? (
              contributions.length === 0 ? (
                <p className="text-xs text-muted text-center py-4">No contributions logged yet.</p>
              ) : (
                <div className="flex flex-col gap-2 max-h-[calc(100vh-18rem)] overflow-y-auto custom-scrollbar -mx-1 px-1">
                  {[...contributions].reverse().map((c) => {
                    const typeColor = TYPE_COLORS[c.type] || TYPE_COLORS.Other;
                    return (
                      <div key={c.id}
                        className="flex items-start gap-2 bg-elevated/50 rounded-lg px-3 py-2.5 border border-white/[0.06]">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-white truncate leading-snug">{c.assetName}</p>
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            <span className="text-[10px] text-secondary">{fmtMonth(c.month)}</span>
                            <span className="text-[10px] text-muted">·</span>
                            <span className="text-[10px] text-white private">{fmtEur(c.amount)}</span>
                            {c.participations > 0 && (
                              <>
                                <span className="text-[10px] text-muted">·</span>
                                <span className="text-[10px] text-secondary">N {Number(c.participations).toFixed(3)}</span>
                              </>
                            )}
                            <span
                              className="px-1 py-px rounded text-[9px] font-medium"
                              style={{ background: typeColor + '22', color: typeColor }}>
                              {c.type}
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={() => handleDeleteContribution(c.id)}
                          className="text-muted hover:text-red-400 transition-colors leading-none mt-0.5 flex-shrink-0 inline-flex items-center"
                          title="Remove this contribution"
                        ><IconTrash size={14} /></button>
                      </div>
                    );
                  })}
                </div>
              )
            ) : null}
          </div>
        </div>
      </div>

      {/* ---- Right panel ---- */}
      <div className="flex-1 md:overflow-y-auto md:custom-scrollbar space-y-4 md:space-y-6 min-w-0">

        <div className="bg-surface border border-white/10 rounded-xl overflow-hidden">
          <div className="p-5 border-b border-white/[0.06]">
            <h3 className="text-[11px] font-semibold text-secondary uppercase tracking-widest">
              DCA Contributions {assets.length > 0 && `(${assets.length} assets)`}
            </h3>
          </div>

          {assets.length === 0 ? (
            <div className="p-10 text-center text-muted text-sm">
              No contributions yet. Log your first one using the form on the left.
            </div>
          ) : (
            <div className="overflow-x-auto custom-scrollbar">
              <table className="text-sm" style={{ minWidth: FIXED_TOTAL_WIDTH + months.length * 100 }}>
                <thead>
                  <tr className="text-xs text-secondary uppercase tracking-widest border-b border-white/[0.06]">
                    {FIXED_COLS.map((col, i) => (
                      <th key={col.key}
                        className={`px-4 py-3 whitespace-nowrap ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'}`}
                        style={stickyStyle(i)}>
                        {col.label}
                      </th>
                    ))}
                    {months.map((m) => (
                      <th key={m} className="px-4 py-3 text-right whitespace-nowrap" style={{ minWidth: 100 }}>
                        {fmtMonth(m)}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {assets.map((a) => {
                    const pct = grandTotal > 0 ? (a.total / grandTotal) * 100 : 0;
                    const typeColor = TYPE_COLORS[a.type] || TYPE_COLORS.Other;
                    return (
                      <tr key={a.assetName} className="border-b border-white/[0.06]">

                        {/* Actions — edit + delete */}
                        <td className="px-2 py-3 text-center" style={stickyStyle(0)}>
                          {editingAsset === a.assetName ? (
                            <div className="flex items-center justify-center gap-2">
                              <button onClick={handleSaveEdit}
                                className="text-accent-green hover:opacity-80 transition-opacity leading-none inline-flex items-center"
                                title="Save changes"><IconCheck size={14} /></button>
                              <button onClick={() => setEditingAsset(null)}
                                className="text-muted hover:text-white transition-colors leading-none inline-flex items-center"
                                title="Cancel"><IconClose size={12} /></button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-center gap-2">
                              <button onClick={() => startEdit(a)}
                                className="text-muted hover:text-white transition-colors leading-none inline-flex items-center"
                                title="Edit asset"><IconPencil size={12} /></button>
                              <button onClick={() => handleDelete(a.assetName)}
                                className="text-muted hover:text-red-400 transition-colors leading-none inline-flex items-center"
                                title="Remove asset"><IconTrash size={12} /></button>
                            </div>
                          )}
                        </td>

                        {/* Asset cell — display or inline edit */}
                        <td className="px-4 py-3" style={stickyStyle(1)}>
                          {editingAsset === a.assetName ? (
                            <div className="flex flex-col gap-1.5 min-w-0">
                              <input
                                type="text" placeholder="Asset name" autoFocus
                                value={editForm.assetName}
                                onChange={e => setEditForm(f => ({ ...f, assetName: e.target.value }))}
                                className="bg-elevated border border-white/10 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-primary/50 w-full"
                              />
                              <div className="flex gap-1.5">
                                <input
                                  type="text" placeholder="Ticker / ISIN"
                                  value={editForm.ticker}
                                  onChange={e => setEditForm(f => ({ ...f, ticker: e.target.value }))}
                                  className="bg-elevated border border-white/10 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-primary/50 flex-1 min-w-0"
                                />
                                <select
                                  value={editForm.type}
                                  onChange={e => setEditForm(f => ({ ...f, type: e.target.value }))}
                                  className="bg-elevated border border-white/10 rounded px-1.5 py-1 text-xs text-white focus:outline-none focus:border-primary/50 flex-shrink-0">
                                  {DCA_TYPES.map(t => <option key={t}>{t}</option>)}
                                </select>
                              </div>
                              <input
                                type="text" placeholder="Broker / provider"
                                value={editForm.broker}
                                onChange={e => setEditForm(f => ({ ...f, broker: e.target.value }))}
                                className="bg-elevated border border-white/10 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-primary/50 w-full"
                              />
                            </div>
                          ) : (
                            <div className="flex flex-col gap-0.5 min-w-0">
                              <span className="text-white font-medium truncate leading-snug">
                                {a.assetName}
                              </span>
                              <div className="flex items-center gap-2 flex-wrap">
                                {a.ticker && (
                                  <span className="font-mono text-[11px] text-secondary">
                                    {a.ticker}
                                  </span>
                                )}
                                <span
                                  className="px-1.5 py-px rounded text-[10px] font-medium leading-tight"
                                  style={{ background: typeColor + '22', color: typeColor }}>
                                  {a.type}
                                </span>
                                {a.broker && (
                                  <span className="text-[11px] text-muted truncate">
                                    {a.broker}
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                        </td>

                        <td className="px-4 py-3 text-right text-white font-medium tabular-nums private" style={stickyStyle(2)}>
                          {fmtEur(a.total)}
                        </td>
                        <td className="px-4 py-3 text-right text-secondary" style={stickyStyle(3)}>
                          {pct.toFixed(1)}%
                        </td>

                        {months.map((m) => (
                          <td key={m} className="px-4 py-3 text-right text-gray-300 tabular-nums private" style={{ minWidth: 100 }}>
                            {a.months[m] ? fmtEur(a.months[m]) : '—'}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>

                <tfoot>
                  <tr className="border-t border-white/10 text-sm font-semibold">
                    <td style={stickyStyle(0)} />
                    <td className="px-4 py-3 text-secondary" style={stickyStyle(1)}>Total</td>
                    <td className="px-4 py-3 text-right text-white tabular-nums private" style={stickyStyle(2)}>
                      {fmtEur(grandTotal)}
                    </td>
                    <td className="px-4 py-3 text-right text-secondary" style={stickyStyle(3)}>100%</td>
                    {months.map((m) => (
                      <td key={m} className="px-4 py-3 text-right text-gray-300 tabular-nums private" style={{ minWidth: 100 }}>
                        {fmtEur(monthlyTotals[m])}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {assets.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            <div className="bg-surface border border-white/10 rounded-xl p-3 md:p-5">
              <h3 className="text-[11px] font-semibold text-secondary uppercase tracking-widest mb-4">
                Distribution by type
              </h3>
              <div className="flex gap-6">
                <ResponsiveContainer width="55%" height={220}>
                  <PieChart>
                    <Pie data={typeData} dataKey="value" nameKey="name"
                      cx="50%" cy="50%" innerRadius={50} outerRadius={85} strokeWidth={0}>
                      {typeData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                    </Pie>
                    <Tooltip content={<PieTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-2 overflow-y-auto max-h-56 custom-scrollbar">
                  {typeData.map((d) => (
                    <div key={d.name} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: d.fill }} />
                        <span className="text-gray-300 truncate">{d.name}</span>
                      </div>
                      <div className="flex items-center gap-3 ml-2 flex-shrink-0">
                        <span className="text-white private">{fmtEur(d.value)}</span>
                        <span className="text-secondary w-12 text-right">{d.pct.toFixed(1)}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-surface border border-white/10 rounded-xl p-3 md:p-5">
              <h3 className="text-[11px] font-semibold text-secondary uppercase tracking-widest mb-4">
                Assets by type
              </h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={assetBarData} barGap={4}>
                  <XAxis dataKey="type" tick={{ fill: '#3d5a78', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#3d5a78', fontSize: 11 }} axisLine={false} tickLine={false} width={60}
                    tickFormatter={(v) => v >= 1000 ? `€${(v / 1000).toFixed(0)}k` : `€${v}`} />
                  <Tooltip content={<BarTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11, color: '#7a95b2' }} />
                  {assetNames.map((name) => (
                    <Bar key={name} dataKey={name} stackId="a" fill={assetColorMap[name]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DcaPage;