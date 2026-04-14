import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useStore } from '../hooks/useStore';

const DCA_KEY    = 'rr-finance-dca-contributions';
const EVO_KEY    = 'rr-finance-evolution-data';
const DIST_KEY   = 'rr-finance-distribution-targets';
const START_MONTH = '2026-02';

const TYPE_COLORS = {
  'Indexed Fund': '#6366f1',
  ETF:    '#00c896',
  Crypto: '#f97316',
  Gold:   '#f0b429',
  Other:  '#7a95b2',
};

const fmtEur = (v) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(v ?? 0);


const devColor = (dev) => {
  if (dev == null) return '#7a95b2';
  const a = Math.abs(dev);
  if (a <= 2) return '#00c896';
  if (a <= 5) return '#f0b429';
  return '#ff5c5c';
};

const fmtDev = (dev) =>
  dev == null ? '—' : `${dev >= 0 ? '+' : ''}${dev.toFixed(2)}%`;

export default function DistributionPage() {
  const [contributions] = useStore(DCA_KEY, []);
  const [evData]        = useStore(EVO_KEY, {});
  const [savedTargets, persistTargets]    = useStore(DIST_KEY, null);
  const [justSaved, setJustSaved]         = useState(false);

  // ── DCA-derived data ──────────────────────────────────────────────────────
  const dcaByAsset = useMemo(() => {
    const map = {};
    contributions.filter(c => c.month >= START_MONTH).forEach(c => {
      if (!map[c.assetName]) {
        map[c.assetName] = {
          assetName: c.assetName, ticker: c.ticker,
          type: c.type, broker: c.broker, months: {}, participations: {},
        };
      }
      const a = map[c.assetName];
      a.months[c.month] = (a.months[c.month] || 0) + c.amount;
      a.participations[c.month] = (a.participations[c.month] || 0) + (c.participations || 0);
      if (c.ticker) a.ticker = c.ticker;
      a.type = c.type;
      if (c.broker) a.broker = c.broker;
    });
    return map;
  }, [contributions]);

  const assetNames = useMemo(() => Object.keys(dcaByAsset), [dcaByAsset]);

  const typeGroups = useMemo(() => {
    const map = {};
    assetNames.forEach(name => {
      const type = dcaByAsset[name].type;
      if (!map[type]) map[type] = [];
      map[type].push(name);
    });
    return map;
  }, [assetNames, dcaByAsset]);

  const typeNames = useMemo(() => Object.keys(typeGroups), [typeGroups]);

  // ── Evolution-derived values (price + totalN per asset) ───────────────────
  const allMonths = useMemo(() =>
    [...new Set(contributions.filter(c => c.month >= START_MONTH).map(c => c.month))].sort(),
  [contributions]);

  const getPrice = useCallback((assetName, month) => {
    const ev = evData[`${assetName}___${month}`];
    if (ev?.priceIsManual && ev.price != null) return ev.price;
    const n = dcaByAsset[assetName]?.participations?.[month] || 0;
    const dcaAmt = dcaByAsset[assetName]?.months[month];
    if (n > 0 && dcaAmt != null) return dcaAmt / n;
    if (ev?.price != null) return ev.price;
    return null;
  }, [evData, dcaByAsset]);

  const assetValueMap = useMemo(() => {
    const map = {};
    assetNames.forEach(name => {
      let totalN = 0;
      let latestPrice = null;
      allMonths.forEach(m => {
        totalN += dcaByAsset[name]?.participations?.[m] || 0;
        const p = getPrice(name, m);
        if (p != null) latestPrice = p;
      });
      map[name] = { totalN, latestPrice, totalEur: totalN * (latestPrice ?? 0) };
    });
    return map;
  }, [assetNames, dcaByAsset, allMonths, getPrice]);

  const grandTotalEur = useMemo(() =>
    assetNames.reduce((s, a) => s + (assetValueMap[a]?.totalEur || 0), 0),
  [assetNames, assetValueMap]);

  // ── Left panel inputs ─────────────────────────────────────────────────────
  const [typeInputs, setTypeInputs] = useState({});
  const [assetInputs, setAssetInputs] = useState({});

  // Seed inputs from saved targets once they load from the backend
  useEffect(() => {
    if (!savedTargets) return;
    if (savedTargets.typeTargets) {
      setTypeInputs(Object.fromEntries(
        Object.entries(savedTargets.typeTargets).map(([k, v]) => [k, String(v)])
      ));
    }
    if (savedTargets.assetTargets) {
      setAssetInputs(Object.fromEntries(
        Object.entries(savedTargets.assetTargets).map(([type, assets]) => [
          type,
          Object.fromEntries(Object.entries(assets).map(([a, v]) => [a, String(v)])),
        ])
      ));
    }
  }, [savedTargets]); // eslint-disable-line react-hooks/exhaustive-deps

  // Seed inputs for types/assets added since last save
  useEffect(() => {
    setTypeInputs(prev => {
      const next = { ...prev };
      typeNames.forEach(t => { if (!(t in next)) next[t] = ''; });
      return next;
    });
    setAssetInputs(prev => {
      const next = { ...prev };
      typeNames.forEach(t => {
        if (!next[t]) next[t] = {};
        typeGroups[t].forEach(a => {
          if (!(a in next[t])) next[t][a] = typeGroups[t].length === 1 ? '100' : '';
        });
      });
      return next;
    });
  }, [typeNames, typeGroups]);

  // ── Validation ────────────────────────────────────────────────────────────
  const typeTotal = useMemo(() =>
    typeNames.reduce((s, t) => s + (parseFloat(typeInputs[t]) || 0), 0),
  [typeNames, typeInputs]);

  const assetTotals = useMemo(() => {
    const totals = {};
    typeNames.forEach(t => {
      totals[t] = typeGroups[t].reduce(
        (s, a) => s + (parseFloat(assetInputs[t]?.[a]) || 0), 0
      );
    });
    return totals;
  }, [typeNames, typeGroups, assetInputs]);

  const isValid = useMemo(() =>
    typeNames.length > 0
    && Math.abs(typeTotal - 100) < 0.01
    && typeNames.every(t => Math.abs(assetTotals[t] - 100) < 0.01),
  [typeNames, typeTotal, assetTotals]);

  // ── Save targets ──────────────────────────────────────────────────────────
  const handleSave = useCallback(() => {
    if (!isValid) return;
    const typeTargets = Object.fromEntries(
      typeNames.map(t => [t, parseFloat(typeInputs[t]) || 0])
    );
    const assetTargets = Object.fromEntries(
      typeNames.map(t => [
        t,
        Object.fromEntries(
          typeGroups[t].map(a => [
            a,
            typeGroups[t].length === 1 ? 100 : (parseFloat(assetInputs[t]?.[a]) || 0),
          ])
        ),
      ])
    );
    const targets = { typeTargets, assetTargets };
    persistTargets(targets);
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2000);
  }, [isValid, typeNames, typeInputs, typeGroups, assetInputs]);

  // ── Target weights per asset (0–1) ────────────────────────────────────────
  const targetWeights = useMemo(() => {
    if (!savedTargets) return {};
    const weights = {};
    typeNames.forEach(t => {
      const typeW = (savedTargets.typeTargets?.[t] || 0) / 100;
      typeGroups[t].forEach(a => {
        const assetW = (savedTargets.assetTargets?.[t]?.[a] || 0) / 100;
        weights[a] = typeW * assetW;
      });
    });
    return weights;
  }, [savedTargets, typeNames, typeGroups]);

  // ── Current distribution rows ─────────────────────────────────────────────
  const distRows = useMemo(() =>
    typeNames.map(type => {
      const typeColor = TYPE_COLORS[type] || TYPE_COLORS.Other;
      const typeTotalEur = typeGroups[type].reduce(
        (s, name) => s + (assetValueMap[name]?.totalEur || 0), 0
      );
      const typeCurrentPct = grandTotalEur > 0 ? (typeTotalEur / grandTotalEur) * 100 : 0;
      const typeTargetPct  = savedTargets ? (savedTargets.typeTargets?.[type] || 0) : null;

      const assets = typeGroups[type].map(name => {
        const { totalEur } = assetValueMap[name] || { totalEur: 0 };
        const currentPct       = grandTotalEur > 0 ? (totalEur / grandTotalEur) * 100 : 0;
        const currentWithin    = typeTotalEur  > 0 ? (totalEur / typeTotalEur)  * 100 : 0;
        const targetWithin     = savedTargets ? (savedTargets.assetTargets?.[type]?.[name] || 0) : null;
        const deviationWithin  = targetWithin != null ? currentWithin - targetWithin : null;
        return { name, meta: dcaByAsset[name], totalEur, currentPct, currentWithin, targetWithin, deviationWithin };
      });

      return {
        type, typeColor, assets,
        totalEur:   typeTotalEur,
        currentPct: typeCurrentPct,
        targetPct:  typeTargetPct,
        deviation:  typeTargetPct != null ? typeCurrentPct - typeTargetPct : null,
      };
    }),
  [typeNames, typeGroups, assetValueMap, grandTotalEur, savedTargets, dcaByAsset]);

  // ── Simulator state ───────────────────────────────────────────────────────
  const [simAmount, setSimAmount] = useState('');
  const [simPrices, setSimPrices] = useState({});

  useEffect(() => {
    setSimPrices(prev => {
      const next = { ...prev };
      assetNames.forEach(a => {
        if (!next[a]) {
          const p = assetValueMap[a]?.latestPrice;
          if (p != null) next[a] = p.toFixed(4);
        }
      });
      return next;
    });
  }, [assetNames, assetValueMap]);

  // ── Simulation results ────────────────────────────────────────────────────
  const simResults = useMemo(() => {
    const T = parseFloat(simAmount);
    if (!T || T <= 0 || !savedTargets) return null;

    const V_total = grandTotalEur;

    const clamped = {};
    assetNames.forEach(a => {
      const W = targetWeights[a] || 0;
      const V = assetValueMap[a]?.totalEur || 0;
      clamped[a] = Math.max(0, W * (V_total + T) - V);
    });

    const sumClamped = assetNames.reduce((s, a) => s + clamped[a], 0);
    const scale = sumClamped > T && sumClamped > 0 ? T / sumClamped : 1;

    // Base allocations after scaling
    const allocs = {};
    assetNames.forEach(a => { allocs[a] = clamped[a] * scale; });

    // For Gold assets that can't reach a whole unit, zero them out and
    // redistribute their allocation proportionally to the other assets
    // that have a valid price (non-zero alloc preferred, but any with P > 0).
    let freed = 0;
    assetNames.forEach(a => {
      if (dcaByAsset[a]?.type !== 'Gold') return;
      const P = parseFloat(simPrices[a]);
      if (!P || P <= 0) return;
      if (Math.floor(allocs[a] / P) < 1) {
        freed += allocs[a];
        allocs[a] = 0;
      }
    });
    if (freed > 0) {
      const eligible = assetNames.filter(a =>
        dcaByAsset[a]?.type !== 'Gold' && parseFloat(simPrices[a]) > 0
      );
      const eligibleSum = eligible.reduce((s, a) => s + allocs[a], 0);
      if (eligibleSum > 0) {
        eligible.forEach(a => { allocs[a] += freed * (allocs[a] / eligibleSum); });
      }
      // if eligibleSum === 0 (all non-Gold clamped to 0), freed stays as leftover
    }

    const rows = assetNames.map(a => {
      const P         = parseFloat(simPrices[a]);
      const V         = assetValueMap[a]?.totalEur || 0;
      const alloc     = allocs[a];
      const targetPct = (targetWeights[a] || 0) * 100;

      if (!P || P <= 0) return { name: a, alloc, units: null, spend: 0, P: null, V, targetPct };
      const isGold = dcaByAsset[a]?.type === 'Gold';
      const units  = isGold ? Math.floor(alloc / P) : alloc / P;
      const spend  = isGold ? units * P : alloc;
      return { name: a, alloc, units, spend, P, V, targetPct };
    });

    const totalSpend = rows.reduce((s, r) => s + r.spend, 0);
    const leftover   = T - totalSpend;
    const newVTotal  = V_total + totalSpend;

    return {
      rows: rows.map(r => {
        const newV         = r.V + r.spend;
        const resultingPct = newVTotal > 0 ? (newV / newVTotal) * 100 : 0;
        return { ...r, newV, resultingPct, deviation: resultingPct - r.targetPct };
      }),
      totalSpend, leftover, newVTotal, T,
    };
  }, [simAmount, savedTargets, assetNames, assetValueMap, targetWeights, grandTotalEur, simPrices]);

  // ── Exact-fit calculator ──────────────────────────────────────────────────
  // X* = max(0, max_i( V_i / W_i − V_total ))   for W_i > 0
  const exactFit = useMemo(() => {
    if (!savedTargets) return null;
    const V_total = grandTotalEur;

    let X = 0;
    assetNames.forEach(a => {
      const W = targetWeights[a] || 0;
      if (W <= 0) return;
      const V = assetValueMap[a]?.totalEur || 0;
      const needed = V / W - V_total;
      if (needed > X) X = needed;
    });

    const breakdown = assetNames
      .map(a => ({
        name:  a,
        alloc: Math.max(0, (targetWeights[a] || 0) * (V_total + X) - (assetValueMap[a]?.totalEur || 0)),
      }))
      .filter(r => r.alloc > 0.005);

    return { X, breakdown };
  }, [savedTargets, assetNames, assetValueMap, targetWeights, grandTotalEur]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const numInputCls =
    'bg-elevated border border-white/10 rounded px-2 py-1 text-xs text-white text-right ' +
    'focus:outline-none focus:border-primary/50 tabular-nums';

  const remainingLabel = (total) => {
    const r = 100 - total;
    if (Math.abs(r) < 0.01) return null;
    return r > 0 ? `${r.toFixed(1)}% remaining` : `${(-r).toFixed(1)}% over`;
  };

  if (contributions.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-muted text-sm">
        No DCA data yet. Log contributions in the DCA tab first.
      </div>
    );
  }

  return (
    <div className="h-full flex gap-6 overflow-hidden">

      {/* ── Left panel: target editor ─────────────────────────────────────── */}
      <div className="w-1/5 flex-shrink-0 overflow-y-auto custom-scrollbar">
        <div className="bg-surface border border-white/10 rounded-xl p-5 space-y-5">

          <h3 className="text-[11px] font-semibold text-secondary uppercase tracking-widest">
            Target distribution
          </h3>

          <div className="space-y-5">
            {typeNames.map(type => {
              const typeColor  = TYPE_COLORS[type] || TYPE_COLORS.Other;
              const isSingle   = typeGroups[type].length === 1;
              const aTotal     = assetTotals[type];
              const subOk      = Math.abs(aTotal - 100) < 0.01;

              return (
                <div key={type}>
                  {/* Type row */}
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: typeColor }} />
                    <span className="text-xs text-white flex-1 truncate">{type}</span>
                    <input
                      type="number" min="0" max="100" step="0.1" placeholder="0"
                      value={typeInputs[type] ?? ''}
                      onChange={e => setTypeInputs(p => ({ ...p, [type]: e.target.value }))}
                      className={numInputCls}
                      style={{ width: 52, minWidth: 0 }}
                    />
                    <span className="text-xs text-secondary">%</span>
                  </div>

                  {/* Asset sub-rows */}
                  <div className="pl-4 space-y-1.5 border-l border-white/[0.06]">
                    {typeGroups[type].map(assetName => (
                      <div key={assetName} className="flex items-center gap-2">
                        <span className="text-[11px] text-secondary flex-1 truncate" title={assetName}>
                          {assetName}
                        </span>
                        {isSingle ? (
                          <span className="text-[11px] text-muted tabular-nums">100%</span>
                        ) : (
                          <>
                            <input
                              type="number" min="0" max="100" step="0.1" placeholder="0"
                              value={assetInputs[type]?.[assetName] ?? ''}
                              onChange={e => setAssetInputs(p => ({
                                ...p, [type]: { ...(p[type] || {}), [assetName]: e.target.value },
                              }))}
                              className={numInputCls}
                              style={{ width: 52, minWidth: 0 }}
                            />
                            <span className="text-[11px] text-secondary">%</span>
                          </>
                        )}
                      </div>
                    ))}

                    {!isSingle && (
                      <div className="flex justify-between pt-1 border-t border-white/[0.04]">
                        <span className="text-[10px] text-muted">Sub-total</span>
                        <span className="text-[10px] tabular-nums font-medium"
                          style={{ color: subOk ? '#00c896' : '#ff5c5c' }}>
                          {aTotal.toFixed(1)}%
                          {!subOk && (
                            <span className="text-[9px] opacity-60 ml-1">{remainingLabel(aTotal)}</span>
                          )}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Grand total */}
          <div className="flex justify-between items-center pt-2 border-t border-white/[0.06]">
            <span className="text-xs text-secondary">Total</span>
            <div className="text-right">
              <span className="text-sm font-bold tabular-nums"
                style={{ color: Math.abs(typeTotal - 100) < 0.01 ? '#00c896' : '#ff5c5c' }}>
                {typeTotal.toFixed(1)}%
              </span>
              {remainingLabel(typeTotal) && (
                <p className="text-[10px] text-muted leading-tight">{remainingLabel(typeTotal)}</p>
              )}
            </div>
          </div>

          <button
            onClick={handleSave}
            disabled={!isValid}
            className="w-full py-2 rounded-lg text-sm font-medium transition-all"
            style={{
              background: isValid ? 'rgba(0,200,150,0.12)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${isValid ? 'rgba(0,200,150,0.35)' : 'rgba(255,255,255,0.07)'}`,
              color:  isValid ? '#00c896' : '#3d5a78',
              cursor: isValid ? 'pointer' : 'not-allowed',
            }}
          >
            {justSaved ? '✓ Saved' : 'Save targets'}
          </button>

        </div>
      </div>

      {/* ── Right panel ───────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-6">

        {/* Current distribution */}
        <div className="bg-surface border border-white/10 rounded-xl overflow-hidden">
          <div className="p-5 border-b border-white/[0.06]">
            <h3 className="text-[11px] font-semibold text-secondary uppercase tracking-widest">
              Current distribution
              {!savedTargets && (
                <span className="ml-2 font-normal text-muted normal-case tracking-normal">
                  — save targets to see deviations
                </span>
              )}
            </h3>
          </div>

          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-xs min-w-[560px]">
              <thead>
                <tr className="text-[10px] text-muted uppercase tracking-widest border-b border-white/[0.06]">
                  <th className="px-5 py-2.5 text-left">Asset</th>
                  <th className="px-4 py-2.5 text-right">Value</th>
                  <th className="px-4 py-2.5 text-right">% portfolio</th>
                  <th className="px-4 py-2.5 text-right">% in type</th>
                  <th className="px-4 py-2.5 text-right">Target in type</th>
                  <th className="px-4 py-2.5 text-right pr-5">Deviation</th>
                </tr>
              </thead>
              <tbody>
                {distRows.map(typeRow => (
                  <React.Fragment key={typeRow.type}>

                    {/* Type summary row */}
                    <tr className="border-t border-white/[0.07] bg-white/[0.02]">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ background: typeRow.typeColor }} />
                          <span className="text-xs font-semibold text-white">{typeRow.type}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-white tabular-nums private">
                        {fmtEur(typeRow.totalEur)}
                      </td>
                      <td className="px-4 py-3 text-right text-secondary tabular-nums">
                        {typeRow.currentPct.toFixed(1)}%
                      </td>
                      <td className="px-4 py-3 text-right text-muted">—</td>
                      <td className="px-4 py-3 text-right text-muted tabular-nums">
                        {typeRow.targetPct != null ? `${typeRow.targetPct.toFixed(1)}%` : '—'}
                      </td>
                      <td className="px-4 py-3 pr-5 text-right tabular-nums font-semibold"
                        style={{ color: devColor(typeRow.deviation) }}>
                        {fmtDev(typeRow.deviation)}
                      </td>
                    </tr>

                    {/* Asset rows */}
                    {typeRow.assets.map(asset => (
                      <tr key={asset.name}
                        className="border-t border-white/[0.025] hover:bg-white/[0.01]">
                        <td className="px-5 py-2.5 pl-10">
                          <span className="text-white">{asset.name}</span>
                          {asset.meta.ticker && (
                            <span className="text-[10px] text-muted font-mono ml-2">
                              {asset.meta.ticker}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right text-white tabular-nums private">
                          {fmtEur(asset.totalEur)}
                        </td>
                        <td className="px-4 py-2.5 text-right text-secondary tabular-nums">
                          {asset.currentPct.toFixed(1)}%
                        </td>
                        <td className="px-4 py-2.5 text-right text-secondary tabular-nums">
                          {asset.currentWithin.toFixed(1)}%
                        </td>
                        <td className="px-4 py-2.5 text-right text-muted tabular-nums">
                          {asset.targetWithin != null ? `${asset.targetWithin.toFixed(1)}%` : '—'}
                        </td>
                        <td className="px-4 py-2.5 pr-5 text-right tabular-nums font-medium"
                          style={{ color: devColor(asset.deviationWithin) }}>
                          {fmtDev(asset.deviationWithin)}
                        </td>
                      </tr>
                    ))}

                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Contribution simulator */}
        <div className="bg-surface border border-white/10 rounded-xl overflow-hidden">
          <div className="p-5 border-b border-white/[0.06]">
            <h3 className="text-[11px] font-semibold text-secondary uppercase tracking-widest">
              Contribution simulator
            </h3>
          </div>

          <div className="p-5 space-y-5">

            {/* Amount input */}
            <div className="flex items-end gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-secondary">Total to invest (€)</label>
                <input
                  type="number" min="0.01" step="0.01" placeholder="0.00"
                  value={simAmount}
                  onChange={e => setSimAmount(e.target.value)}
                  className="bg-elevated border border-white/10 rounded-lg px-3 py-2 text-sm text-white
                    focus:outline-none focus:border-primary/50 w-40"
                />
              </div>
              {!savedTargets && (
                <p className="text-xs text-muted pb-2">Save targets first to enable simulation.</p>
              )}
            </div>

            {/* Price overrides */}
            <div>
              <p className="text-[10px] text-muted uppercase tracking-widest mb-3">
                Price per asset (€) — pre-filled from Evolution data
              </p>
              <div className="grid gap-x-6 gap-y-2"
                style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
                {assetNames.map(a => (
                  <div key={a} className="flex items-center gap-2">
                    <span className="text-[11px] text-secondary flex-1 truncate" title={a}>{a}</span>
                    <input
                      type="number" step="any" min="0" placeholder="—"
                      value={simPrices[a] ?? ''}
                      onChange={e => setSimPrices(p => ({ ...p, [a]: e.target.value }))}
                      className={numInputCls}
                      style={{ width: 80, minWidth: 0 }}
                    />
                    <span className="text-[11px] text-muted">€</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Results */}
            {simResults && (
              <div className="space-y-4 pt-4 border-t border-white/[0.06]">
                <p className="text-[10px] text-muted uppercase tracking-widest">Simulation results</p>

                <div className="overflow-x-auto custom-scrollbar">
                  <table className="w-full text-xs min-w-[580px]">
                    <thead>
                      <tr className="text-[10px] text-muted uppercase tracking-widest
                        border-b border-white/[0.06]">
                        <th className="py-2 text-left pr-3">Asset</th>
                        <th className="py-2 text-right pr-3">Target %</th>
                        <th className="py-2 text-right pr-3">Allocation</th>
                        <th className="py-2 text-right pr-3">Units</th>
                        <th className="py-2 text-right pr-3">Price used</th>
                        <th className="py-2 text-right pr-3">Resulting %</th>
                        <th className="py-2 text-right">Deviation</th>
                      </tr>
                    </thead>
                    <tbody>
                      {simResults.rows.map(r => (
                        <tr key={r.name} className="border-b border-white/[0.03]">
                          <td className="py-2 pr-3 text-white">{r.name}</td>
                          <td className="py-2 pr-3 text-right text-secondary tabular-nums">
                            {r.targetPct.toFixed(1)}%
                          </td>
                          <td className="py-2 pr-3 text-right text-white tabular-nums private">
                            {fmtEur(r.alloc)}
                          </td>
                          <td className="py-2 pr-3 text-right tabular-nums">
                            {r.units != null
                              ? <span className="text-white font-medium">
                                  {Number.isInteger(r.units) ? r.units : r.units.toFixed(6)}
                                </span>
                              : <span className="text-muted">—</span>}
                          </td>
                          <td className="py-2 pr-3 text-right text-secondary tabular-nums private">
                            {r.P != null ? fmtEur(r.P) : <span className="text-muted">—</span>}
                          </td>
                          <td className="py-2 pr-3 text-right tabular-nums text-white">
                            {r.resultingPct.toFixed(1)}%
                          </td>
                          <td className="py-2 text-right tabular-nums font-medium"
                            style={{ color: devColor(r.deviation) }}>
                            {fmtDev(r.deviation)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex gap-8 pt-1">
                  <div>
                    <p className="text-[10px] text-muted uppercase tracking-widest mb-0.5">
                      Total allocated
                    </p>
                    <p className="text-sm font-semibold text-white tabular-nums private">
                      {fmtEur(simResults.totalSpend)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted uppercase tracking-widest mb-0.5">
                      Unallocated remainder
                    </p>
                    <p className="text-sm font-semibold tabular-nums private"
                      style={{ color: simResults.leftover > 0.005 ? '#f0b429' : '#7a95b2' }}>
                      {fmtEur(simResults.leftover)}
                    </p>
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>

        {/* Exact-fit calculator */}
        {exactFit && (
          <div className="bg-surface border border-white/10 rounded-xl p-5 space-y-4">
            <div>
              <h3 className="text-[11px] font-semibold text-secondary uppercase tracking-widest mb-1">
                Exact-fit calculator
              </h3>
              <p className="text-xs text-secondary">
                To reach your exact target distribution from the current portfolio, you would need
                to invest a total of:
              </p>
            </div>

            <p className="text-2xl font-bold text-white tabular-nums private">
              {fmtEur(exactFit.X)}
            </p>

            {exactFit.breakdown.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] text-muted uppercase tracking-widest">Breakdown</p>
                {exactFit.breakdown.map(r => (
                  <div key={r.name} className="flex justify-between text-xs">
                    <span className="text-secondary">{r.name}</span>
                    <span className="text-white tabular-nums private">{fmtEur(r.alloc)}</span>
                  </div>
                ))}
              </div>
            )}

            <p className="text-[10px] text-muted leading-snug">
              Assumes continuous allocation without unit rounding. Actual spend will differ
              because assets are bought in whole units.
            </p>
          </div>
        )}

      </div>
    </div>
  );
}
