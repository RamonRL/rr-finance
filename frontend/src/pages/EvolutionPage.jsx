import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useStore } from '../hooks/useStore';
import {
  ComposedChart, Area, LineChart, Line,
  PieChart, Pie, Cell,
  BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  ReferenceLine,
} from 'recharts';

const ASSET_PALETTE = [
  '#6366f1', '#00c896', '#f0b429', '#ec4899', '#f97316',
  '#06b6d4', '#8b5cf6', '#ff5c5c', '#14b8a6', '#a855f7',
  '#84cc16', '#e879f9', '#fb923c', '#2dd4bf', '#f472b6',
];

const DCA_KEY = 'rr-finance-dca-contributions';
const EVO_KEY = 'rr-finance-evolution-data';
const START_MONTH = '2026-02';

const TYPE_COLORS = {
  'Indexed Fund': '#6366f1',
  ETF: '#00c896',
  Crypto: '#f97316',
  Gold: '#f0b429',
  Other: '#7a95b2',
};

const fmtEur = (v) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(v ?? 0);

const fmtN = (v) =>
  v == null || v === '' || (typeof v === 'number' && v === 0)
    ? '—'
    : Number(v).toFixed(3);

const fmtMonth = (ym) => {
  const [y, m] = ym.split('-');
  return new Date(Number(y), Number(m) - 1).toLocaleString('en-US', { month: 'short', year: '2-digit' });
};


const FIXED_COLS = [
  { key: 'asset',    label: 'Asset',    width: 180, align: 'left'  },
  { key: 'totalN',   label: 'Total N',  width: 100,  align: 'right' },
  { key: 'price',    label: 'Price',    width: 100, align: 'right' },
  { key: 'totalEur', label: 'Total €',  width: 110, align: 'right' },
  { key: 'totalPct', label: '% total',  width: 75,  align: 'right' },
  { key: 'pnlEur',   label: '+/- €',    width: 110, align: 'right' },
  { key: 'pnlPct',   label: '+/- %',    width: 75,  align: 'right' },
];

const FIXED_OFFSETS = FIXED_COLS.reduce((acc, col, i) => {
  acc.push(i === 0 ? 0 : acc[i - 1] + FIXED_COLS[i - 1].width);
  return acc;
}, []);

const FIXED_TOTAL_WIDTH =
  FIXED_OFFSETS[FIXED_OFFSETS.length - 1] + FIXED_COLS[FIXED_COLS.length - 1].width;

const stickyStyle = (i, extra = {}) => ({
  position: 'sticky',
  left: FIXED_OFFSETS[i],
  zIndex: 10,
  minWidth: FIXED_COLS[i].width,
  maxWidth: FIXED_COLS[i].width,
  background: '#0e1c2f',
  ...(i === FIXED_COLS.length - 1 ? { boxShadow: '4px 0 8px -4px rgba(0,0,0,0.3)' } : {}),
  ...extra,
});

const pnlColor = (v) =>
  v == null ? '#7a95b2' : v >= 0 ? '#00c896' : '#ff5c5c';
const pnlSign = (v) => (v != null && v > 0 ? '+' : '');

const ChartTooltip = ({ active, payload, label, fmtVal, getValueColor }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-elevated border border-white/10 rounded-lg p-3 text-sm">
      <p className="text-secondary mb-1">{label}</p>
      {payload.map((p) => {
        const color = getValueColor ? getValueColor(p.value) : (p.color || p.stroke);
        return (
          <p key={p.name} style={{ color }}>
            {p.name}: {fmtVal ? fmtVal(p.value) : p.value}
          </p>
        );
      })}
    </div>
  );
};

const PieTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div className="bg-elevated border border-white/10 rounded-lg p-3 text-sm">
      <p style={{ color: d.payload.fill }}>{d.name}</p>
      <p className="text-white private">{new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(d.value)}</p>
      <p className="text-secondary">{d.payload.pct.toFixed(1)}%</p>
    </div>
  );
};

const DistBarTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-elevated border border-white/10 rounded-lg p-3 text-sm">
      <p className="text-secondary mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.fill || p.color }}>{p.name}: {new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(p.value)}</p>
      ))}
    </div>
  );
};

const pnlDotColor = (v) => (v >= 0 ? '#00c896' : '#ff5c5c');
const PnlDot = ({ cx, cy, value }) => (
  <circle cx={cx} cy={cy} r={3} fill={pnlDotColor(value)} />
);
const PnlActiveDot = ({ cx, cy, value }) => (
  <circle cx={cx} cy={cy} r={5} fill={pnlDotColor(value)} />
);

// ── Price-fetch helpers ───────────────────────────────────────────────────────

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

// Returns true if the string looks like an ISIN (2-letter country code + 9 alphanumeric + 1 digit, 12 chars total).
function looksLikeIsin(s) {
  return /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(s);
}

// Financial Modeling Prep — Indexed Funds, ETFs, Gold, Other.
// Returns { price: number, currency: string } on success,
//         { price: null, reason: string }      if ISIN lookup returned empty,
//         null                                 on network/parse error.
async function fetchFmpPrice(tickerOrIsin, apiKey) {
  let symbol = tickerOrIsin;

  if (looksLikeIsin(tickerOrIsin)) {
    // Step 1: resolve ISIN → ticker symbol
    const isinRes = await withTimeout(
      fetch(`https://financialmodelingprep.com/stable/search-isin?isin=${encodeURIComponent(tickerOrIsin)}&apikey=${encodeURIComponent(apiKey)}`, { credentials: 'omit' }),
      8000
    );
    if (!isinRes.ok) return null;
    const isinData = await isinRes.json();
    if (!Array.isArray(isinData) || isinData.length === 0)
      return { price: null, reason: 'ISIN not found in FMP' };
    symbol = isinData[0].symbol;
    if (!symbol) return null;
  }

  // Step 2: fetch current quote
  const quoteRes = await withTimeout(
    fetch(`https://financialmodelingprep.com/stable/quote/${encodeURIComponent(symbol)}?apikey=${encodeURIComponent(apiKey)}`, { credentials: 'omit' }),
    8000
  );
  if (!quoteRes.ok) return null;
  const quoteData = await quoteRes.json();
  const quote = Array.isArray(quoteData) ? quoteData[0] : quoteData;
  if (quote?.price == null) return null;
  return { price: quote.price, currency: quote.currency || 'USD' };
}

// CoinGecko free API — search resolves coin ID, then fetches EUR price.
// Retries once after 2 s on HTTP 429.
async function fetchCoinGeckoPrice(ticker) {
  const searchRes = await withTimeout(
    fetch(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(ticker)}`, { credentials: 'omit' }),
    8000
  );
  if (!searchRes.ok) return null;
  const coinId = (await searchRes.json())?.coins?.[0]?.id;
  if (!coinId) return null;

  const doFetch = () => withTimeout(
    fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(coinId)}&vs_currencies=eur`, { credentials: 'omit' }),
    8000
  );

  let priceRes = await doFetch();
  if (priceRes.status === 429) {
    await new Promise((r) => setTimeout(r, 2000));
    priceRes = await doFetch();
  }
  if (!priceRes.ok) return null;
  return (await priceRes.json())?.[coinId]?.eur ?? null;
}

export default function EvolutionPage() {
  const [contributions] = useStore(DCA_KEY, []);
  const [evData, persistEv] = useStore(EVO_KEY, {});
  const [selectedAsset, setSelectedAsset] = useState('');

  // DCA meta per asset
  const dcaByAsset = useMemo(() => {
    const map = {};
    contributions.filter((c) => c.month >= START_MONTH).forEach((c) => {
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

  const allMonths = useMemo(() =>
    [...new Set(contributions.filter((c) => c.month >= START_MONTH).map((c) => c.month))].sort(),
  [contributions]);

  const assetNames = useMemo(() => Object.keys(dcaByAsset), [dcaByAsset]);

  const ALL_ASSETS = '__all__';

  useEffect(() => {
    if (!selectedAsset && assetNames.length > 0) setSelectedAsset(ALL_ASSETS);
  }, [assetNames, selectedAsset]);

  // Resolve price for a given asset + month.
  // User-typed manual prices (priceSource !== 'refresh') take priority and show the ✎ indicator.
  // Refresh-written prices (priceSource === 'refresh') are treated as non-manual for display purposes.
  const getPrice = useCallback((assetName, month) => {
    const n = dcaByAsset[assetName]?.participations?.[month] || 0;
    const dcaAmt = dcaByAsset[assetName]?.months[month];
    // Participation months always use the DCA buy price — no overrides
    if (n > 0 && dcaAmt != null) return { value: dcaAmt / n, isManual: false };
    // No-participation months: manual input takes priority
    const ev = evData[`${assetName}___${month}`];
    if (ev?.priceIsManual && ev.priceSource !== 'refresh' && ev.price != null)
      return { value: ev.price, isManual: true };
    if (ev?.price != null) return { value: ev.price, isManual: false };
    return { value: null, isManual: false };
  }, [evData, dcaByAsset]);

  const handleCellChange = useCallback((assetName, month, rawValue) => {
    const key = `${assetName}___${month}`;
    const prev = evData[key] || { price: null, priceIsManual: false };
    const p = rawValue === '' ? null : parseFloat(rawValue);
    persistEv({ ...evData, [key]: { ...prev, price: isNaN(p) ? null : p, priceIsManual: p != null } });
  }, [evData, persistEv]);  // eslint-disable-line react-hooks/exhaustive-deps

  const handleCurrentPriceChange = useCallback((assetName, rawValue) => {
    const key = `${assetName}___current`;
    const p = rawValue === '' ? null : parseFloat(rawValue);
    persistEv({ ...evData, [key]: { price: isNaN(p) ? null : p } });
  }, [evData, persistEv]);  // eslint-disable-line react-hooks/exhaustive-deps

  // One-time cleanup: remove any ___month keys that were written by Refresh prices
  const cleanedRefreshRef = React.useRef(false);
  useEffect(() => {
    if (cleanedRefreshRef.current || Object.keys(evData).length === 0) return;
    const stale = Object.keys(evData).filter(
      k => !k.endsWith('___current') && evData[k]?.priceSource === 'refresh'
    );
    cleanedRefreshRef.current = true;
    if (stale.length === 0) return;
    const cleaned = { ...evData };
    stale.forEach(k => delete cleaned[k]);
    persistEv(cleaned);
  }, [evData]); // eslint-disable-line react-hooks/exhaustive-deps

  const [apiKeys, persistApiKeys] = useStore('rr_finance_api_keys', { fmp: '' });
  const [showKeyConfig, setShowKeyConfig] = useState(false);
  const [fmpKeyInput, setFmpKeyInput] = useState('');

  // Seed fmpKeyInput once apiKeys loads
  useEffect(() => {
    if (apiKeys?.fmp && !fmpKeyInput) setFmpKeyInput(apiKeys.fmp);
  }, [apiKeys]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveApiKeys = useCallback(() => {
    const next = { fmp: fmpKeyInput.trim() };
    persistApiKeys(next);
    setShowKeyConfig(false);
  }, [fmpKeyInput, persistApiKeys]);

  const [refreshing, setRefreshing] = useState(false);
  // refreshResult: { items: [{ name, status: 'updated'|'skipped'|'unavailable', reason?, price?, currency? }] }
  const [refreshResult, setRefreshResult] = useState(null);

  const handleRefreshPrices = useCallback(async () => {
    if (!allMonths.length) return;
    const latestMonth = allMonths[allMonths.length - 1];
    setRefreshing(true);
    setRefreshResult(null);

    const items = [];
    const newPrices = {};

    await Promise.all(assetNames.map(async (name) => {
      const meta = dcaByAsset[name];

      if (!meta?.ticker) {
        items.push({ name, status: 'skipped', reason: 'no ticker' });
        return;
      }

      const isCrypto = meta.type === 'Crypto';
      if (!isCrypto && !apiKeys.fmp) {
        items.push({ name, status: 'skipped', reason: 'FMP key not configured' });
        return;
      }

      try {
        if (isCrypto) {
          const price = await fetchCoinGeckoPrice(meta.ticker);
          if (price != null) {
            newPrices[`${name}___current`] = { price };
            items.push({ name, status: 'updated', price, currency: 'EUR' });
          } else {
            items.push({ name, status: 'unavailable', reason: 'no data returned' });
          }
        } else {
          const result = await fetchFmpPrice(meta.ticker, apiKeys.fmp);
          if (result == null) {
            items.push({ name, status: 'unavailable', reason: 'no data returned' });
          } else if (result.price == null) {
            items.push({ name, status: 'unavailable', reason: result.reason || 'no price' });
          } else {
            newPrices[`${name}___current`] = { price: result.price };
            items.push({ name, status: 'updated', price: result.price, currency: result.currency });
          }
        }
      } catch (e) {
        items.push({ name, status: 'unavailable', reason: e.message === 'timeout' ? 'timeout' : 'fetch error' });
      }
    }));

    if (Object.keys(newPrices).length > 0) persistEv({ ...evData, ...newPrices });
    setRefreshResult({ items });
    setRefreshing(false);
  }, [allMonths, assetNames, dcaByAsset, evData, apiKeys, persistEv]);

  // Per-asset derived rows
  const assetRows = useMemo(() => {
    return assetNames.map((name) => {
      const meta = dcaByAsset[name];
      let totalN = 0;
      let lastMonthPrice = null;
      let totalContributed = 0;

      allMonths.forEach((m) => {
        const n = dcaByAsset[name]?.participations?.[m] || 0;
        totalN += n;
        const { value: p } = getPrice(name, m);
        if (p != null) lastMonthPrice = p;
        totalContributed += meta.months[m] || 0;
      });

      const currentOverride = evData[`${name}___current`]?.price;
      const latestPrice = currentOverride != null ? currentOverride : lastMonthPrice;

      const totalEur = totalN * (latestPrice ?? 0);
      const pnlEur = totalEur - totalContributed;
      const pnlPct = totalContributed > 0 ? (pnlEur / totalContributed) * 100 : null;

      return { name, meta, totalN, latestPrice, totalContributed, totalEur, pnlEur, pnlPct };
    });
  }, [assetNames, dcaByAsset, allMonths, evData, getPrice]);

  const grandTotalEur = useMemo(() => assetRows.reduce((s, r) => s + r.totalEur, 0), [assetRows]);
  const grandContributed = useMemo(() => assetRows.reduce((s, r) => s + r.totalContributed, 0), [assetRows]);
  const grandPnlEur = grandTotalEur - grandContributed;
  const grandPnlPct = grandContributed > 0 ? (grandPnlEur / grandContributed) * 100 : null;

  const typeData = useMemo(() => {
    const map = {};
    assetRows.forEach((r) => {
      map[r.meta.type] = (map[r.meta.type] || 0) + r.totalEur;
    });
    return Object.entries(map)
      .map(([type, value]) => ({
        name: type, value,
        fill: TYPE_COLORS[type] || TYPE_COLORS.Other,
        pct: grandTotalEur > 0 ? (value / grandTotalEur) * 100 : 0,
      }))
      .sort((a, b) => b.value - a.value);
  }, [assetRows, grandTotalEur]);

  const { assetBarData, assetNameList, assetColorMap } = useMemo(() => {
    const byType = {};
    assetRows.forEach((r) => {
      if (!byType[r.meta.type]) byType[r.meta.type] = [];
      byType[r.meta.type].push(r);
    });
    const data = Object.entries(byType).map(([type, list]) => {
      const entry = { type };
      list.forEach((r) => { entry[r.name] = r.totalEur; });
      return entry;
    });
    const names = assetRows.map((r) => r.name);
    const colorMap = {};
    names.forEach((n, i) => { colorMap[n] = ASSET_PALETTE[i % ASSET_PALETTE.length]; });
    return { assetBarData: data, assetNameList: names, assetColorMap: colorMap };
  }, [assetRows]);

  const monthlyTotalN = useMemo(() => {
    const t = {};
    allMonths.forEach((m) => {
      t[m] = assetNames.reduce((s, name) =>
        s + (dcaByAsset[name]?.participations?.[m] || 0), 0);
    });
    return t;
  }, [allMonths, assetNames, evData]);

  // Chart data for selected asset (or all assets aggregated)
  const chartData = useMemo(() => {
    if (!selectedAsset) return [];

    if (selectedAsset === ALL_ASSETS) {
      // Per-asset state: cumulative N and last known price
      const cumNByAsset = {};
      const lastPriceByAsset = {};
      assetNames.forEach(name => { cumNByAsset[name] = 0; lastPriceByAsset[name] = null; });

      let cumContributed = 0;
      return allMonths.map((m) => {
        assetNames.forEach(name => {
          cumNByAsset[name] += dcaByAsset[name]?.participations?.[m] || 0;
          const { value: p } = getPrice(name, m);
          if (p != null) lastPriceByAsset[name] = p;
        });
        cumContributed += assetNames.reduce((s, name) => s + (dcaByAsset[name]?.months[m] || 0), 0);
        // For current price: use ___current override if set, else last month price
        const value = assetNames.reduce((s, name) => {
          const currentOverride = evData[`${name}___current`]?.price;
          const price = currentOverride != null ? currentOverride : (lastPriceByAsset[name] ?? 0);
          return s + cumNByAsset[name] * price;
        }, 0);
        const pnlEur = value - cumContributed;
        const pnlPct = cumContributed > 0 ? (pnlEur / cumContributed) * 100 : 0;
        return { label: fmtMonth(m), contributed: cumContributed, value, pnlEur, pnlPct };
      });
    }

    if (!dcaByAsset[selectedAsset]) return [];
    let cumContributed = 0;
    let cumN = 0;
    let lastPrice = null;

    return allMonths.map((m) => {
      cumContributed += dcaByAsset[selectedAsset].months[m] || 0;
      cumN += dcaByAsset[selectedAsset].participations?.[m] || 0;
      const { value: p } = getPrice(selectedAsset, m);
      if (p != null) lastPrice = p;
      // Use ___current override for the latest value
      const currentOverride = evData[`${selectedAsset}___current`]?.price;
      const priceToUse = currentOverride != null ? currentOverride : (lastPrice ?? 0);
      const value = cumN * priceToUse;
      const pnlEur = value - cumContributed;
      const pnlPct = cumContributed > 0 ? (pnlEur / cumContributed) * 100 : 0;
      return { label: fmtMonth(m), contributed: cumContributed, value, pnlEur, pnlPct };
    });
  }, [selectedAsset, dcaByAsset, assetNames, allMonths, evData, getPrice]);

  const inputCls = 'w-full bg-background/60 border border-white/10 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-primary/60 tabular-nums';

  if (contributions.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-muted text-sm">
        No DCA data yet. Log contributions in the DCA tab first.
      </div>
    );
  }

  return (
    <div className="h-full flex gap-6 overflow-hidden">

      {/* Left panel */}
      <div className="w-1/5 flex-shrink-0 overflow-y-auto custom-scrollbar">
        <div className="bg-surface border border-white/10 rounded-xl p-5 sticky top-0 space-y-4">

          {/* Summary cards */}
          <div className="space-y-2">
            {[
              {
                label: 'Portfolio value',
                value: fmtEur(grandTotalEur),
                sub: `Contributed: ${fmtEur(grandContributed)}`,
                accentVar: '--accent-blue',
                color: '#e8f0f8',
              },
              {
                label: 'Total +/- €',
                value: `${pnlSign(grandPnlEur)}${fmtEur(grandPnlEur)}`,
                sub: grandPnlEur >= 0 ? 'Profit' : 'Loss',
                accentVar: grandPnlEur >= 0 ? '--accent-green' : '--accent-red',
                color: pnlColor(grandPnlEur),
              },
              {
                label: 'Total +/- %',
                value: grandPnlPct != null ? `${pnlSign(grandPnlPct)}${grandPnlPct.toFixed(2)}%` : '—',
                sub: 'Overall return',
                accentVar: grandPnlPct == null || grandPnlPct >= 0 ? '--accent-green' : '--accent-red',
                color: pnlColor(grandPnlPct),
              },
            ].map((card) => (
              <div key={card.label}
                className="bg-background/50 border border-white/[0.06] rounded-lg px-3 py-2.5"
                style={{ borderLeft: `2px solid var(${card.accentVar})` }}>
                <p className="text-[10px] text-secondary uppercase tracking-widest mb-0.5">{card.label}</p>
                <p className="text-base font-bold tabular-nums private leading-tight" style={{ color: card.color }}>{card.value}</p>
                <p className="text-[10px] text-muted mt-0.5 private">{card.sub}</p>
              </div>
            ))}
          </div>

          <div className="border-t border-white/[0.06]" />

          <h3 className="text-[11px] font-semibold text-secondary uppercase tracking-widest">
            Chart asset
          </h3>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-secondary">Asset</label>
            <select value={selectedAsset} onChange={(e) => setSelectedAsset(e.target.value)}
              className="bg-elevated border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-primary">
              <option value={ALL_ASSETS}>All Assets</option>
              {assetNames.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </div>

          {selectedAsset && selectedAsset !== ALL_ASSETS && (() => {
            const row = assetRows.find((r) => r.name === selectedAsset);
            if (!row) return null;
            const typeColor = TYPE_COLORS[row.meta.type] || TYPE_COLORS.Other;
            return (
              <div className="mt-4 space-y-2 text-xs">
                {row.meta.ticker && (
                  <div className="flex justify-between">
                    <span className="text-secondary">Ticker</span>
                    <span className="font-mono text-white">{row.meta.ticker}</span>
                  </div>
                )}
                <div className="flex justify-between items-center">
                  <span className="text-secondary">Type</span>
                  <span className="px-1.5 py-px rounded text-[10px] font-medium"
                    style={{ background: typeColor + '22', color: typeColor }}>{row.meta.type}</span>
                </div>
                {row.meta.broker && (
                  <div className="flex justify-between">
                    <span className="text-secondary">Broker</span>
                    <span className="text-white">{row.meta.broker}</span>
                  </div>
                )}
                <div className="border-t border-white/[0.06] pt-2 space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-secondary">Total N</span>
                    <span className="text-white tabular-nums">{fmtN(row.totalN)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-secondary">Current price</span>
                    <span className="text-white tabular-nums private">
                      {row.latestPrice != null ? fmtEur(row.latestPrice) : '—'}
                      {evData[`${row.name}___current`]?.price != null && (
                        <span className="ml-1 text-[9px] text-accent-gold/70">✎</span>
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-secondary">Total €</span>
                    <span className="text-white tabular-nums private">{fmtEur(row.totalEur)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-secondary">+/- €</span>
                    <span className="tabular-nums private" style={{ color: pnlColor(row.pnlEur) }}>
                      {pnlSign(row.pnlEur)}{fmtEur(row.pnlEur)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-secondary">+/- %</span>
                    <span className="tabular-nums" style={{ color: pnlColor(row.pnlPct) }}>
                      {row.pnlPct != null ? `${pnlSign(row.pnlPct)}${row.pnlPct.toFixed(2)}%` : '—'}
                    </span>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-6">

        {/* Evolution table */}
        <div className="bg-surface border border-white/10 rounded-xl overflow-hidden">
          <div className="p-5 border-b border-white/[0.06] flex items-center justify-between">
            <h3 className="text-[11px] font-semibold text-secondary uppercase tracking-widest">
              Evolution
              {assetNames.length > 0 && (
                <span className="ml-2 font-normal text-muted">
                  {assetNames.length} assets · {allMonths.length} months
                </span>
              )}
            </h3>
            <div className="flex items-center gap-3">
              <button
                onClick={() => { setShowKeyConfig((v) => !v); setRefreshResult(null); }}
                className="text-xs transition-colors"
                style={{ color: showKeyConfig ? '#00c896' : '#3d5a78' }}
                title="Configure API keys for price refresh"
              >
                API keys
              </button>
              <button
                onClick={handleRefreshPrices}
                disabled={refreshing || !allMonths.length}
                className="text-xs transition-colors"
                style={{
                  color: refreshing ? '#3d5a78'
                    : !refreshResult ? '#3d9eff'
                    : refreshResult.items.every((i) => i.status === 'updated') ? '#00c896'
                    : refreshResult.items.some((i) => i.status === 'updated') ? '#f0b429'
                    : '#ff5c5c',
                  cursor: refreshing ? 'not-allowed' : 'pointer',
                }}
                title={`Fetch current prices for the latest month (${allMonths[allMonths.length - 1] ?? '—'})`}
              >
                {refreshing ? 'Fetching prices…'
                  : !refreshResult ? 'Refresh prices'
                  : refreshResult.items.every((i) => i.status === 'updated') ? '✓ All updated'
                  : refreshResult.items.some((i) => i.status === 'updated') ? '⚠ Partial update'
                  : '✗ All failed'}
              </button>
              {Object.values(evData).some((e) => e.priceIsManual && e.priceSource !== 'refresh') && (
                <button
                  onClick={() => persistEv(Object.fromEntries(
                    Object.entries(evData).filter(([, e]) => !(e.priceIsManual && e.priceSource !== 'refresh'))
                  ))}
                  className="text-xs text-muted hover:text-red-400 transition-colors"
                  title="Remove all manually entered prices"
                >
                  Clear manual prices
                </button>
              )}
            </div>
          </div>

          {/* API key config panel */}
          {showKeyConfig && (
            <div className="px-5 py-4 border-b border-white/[0.06] bg-background/30 flex items-end gap-3 flex-wrap">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-secondary uppercase tracking-widest">FMP API Key</label>
                <input
                  type="password"
                  value={fmpKeyInput}
                  onChange={(e) => setFmpKeyInput(e.target.value)}
                  placeholder="Enter your Financial Modeling Prep key…"
                  className="bg-elevated border border-white/10 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-primary/50 w-80"
                />
                <p className="text-[10px] text-muted">Used for Indexed Funds, ETFs, Gold, Other. Crypto uses CoinGecko (free, no key needed).</p>
              </div>
              <div className="flex items-center gap-2 pb-5">
                <button
                  onClick={saveApiKeys}
                  className="text-xs px-3 py-1.5 rounded-lg transition-colors"
                  style={{ background: '#00c89622', color: '#00c896', border: '1px solid #00c89633' }}
                >
                  Save
                </button>
                <button
                  onClick={() => setShowKeyConfig(false)}
                  className="text-xs text-muted hover:text-white transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Refresh results panel */}
          {refreshResult && (
            <div className="px-5 py-3 border-b border-white/[0.06] bg-background/20">
              <div className="flex flex-wrap gap-x-4 gap-y-1 items-start">
                {refreshResult.items.map((item) => {
                  const icon = item.status === 'updated' ? '✓' : item.status === 'skipped' ? '⚠' : '✗';
                  const color = item.status === 'updated' ? '#00c896' : item.status === 'skipped' ? '#f0b429' : '#ff5c5c';
                  const notEur = item.status === 'updated' && item.currency !== 'EUR';
                  const detail = item.status === 'updated'
                    ? ` ${item.price?.toFixed(2)} ${item.currency}${notEur ? ' ⚠ not EUR' : ''}`
                    : ` ${item.reason}`;
                  return (
                    <span key={item.name} className="text-[11px] tabular-nums whitespace-nowrap" style={{ color }}>
                      {icon} <span className="text-white">{item.name}</span>{detail}
                    </span>
                  );
                })}
                <button
                  onClick={() => setRefreshResult(null)}
                  className="text-[11px] text-muted hover:text-white transition-colors ml-auto"
                >
                  ✕
                </button>
              </div>
            </div>
          )}

          <div className="overflow-x-auto custom-scrollbar">
            <table className="text-sm"
              style={{ minWidth: FIXED_TOTAL_WIDTH + allMonths.length * 175 }}>

              <thead>
                {/* Row 1: fixed col headers (rowSpan=2) + month group headers */}
                <tr className="text-xs text-secondary uppercase tracking-widest border-b border-white/[0.04]">
                  {FIXED_COLS.map((col, i) => (
                    <th key={col.key} rowSpan={2}
                      className={`px-4 py-3 whitespace-nowrap align-middle border-b border-white/[0.06] ${col.align === 'right' ? 'text-right' : 'text-left'}`}
                      style={stickyStyle(i)}>
                      {col.label}
                    </th>
                  ))}
                  {allMonths.map((m) => (
                    <th key={m} colSpan={2}
                      className="px-4 py-2 text-center whitespace-nowrap border-l border-white/[0.06]"
                      style={{ minWidth: 175 }}>
                      {fmtMonth(m)}
                    </th>
                  ))}
                </tr>
                {/* Row 2: N / Price sub-headers per month */}
                <tr className="text-xs text-muted uppercase tracking-widest border-b border-white/[0.06]">
                  {allMonths.map((m) => (
                    <React.Fragment key={m}>
                      <th className="px-3 py-2 text-center whitespace-nowrap border-l border-white/[0.06]"
                        style={{ minWidth: 65 }}>N</th>
                      <th className="px-3 py-2 text-center whitespace-nowrap"
                        style={{ minWidth: 110 }}>Price (€)</th>
                    </React.Fragment>
                  ))}
                </tr>
              </thead>

              <tbody>
                {assetRows.map((row) => {
                  const typeColor = TYPE_COLORS[row.meta.type] || TYPE_COLORS.Other;
                  return (
                    <tr key={row.name} className="border-b border-white/[0.06] hover:bg-white/[0.02]">

                      {/* Asset */}
                      <td className="px-4 py-3" style={stickyStyle(0)}>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-white font-medium text-xs leading-snug truncate">{row.name}</span>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {row.meta.ticker && (
                              <span className="font-mono text-[11px] text-secondary">{row.meta.ticker}</span>
                            )}
                            <span className="px-1.5 py-px rounded text-[10px] font-medium"
                              style={{ background: typeColor + '22', color: typeColor }}>{row.meta.type}</span>
                          </div>
                        </div>
                      </td>

                      {/* Total N */}
                      <td className="px-4 py-3 text-right tabular-nums text-white" style={stickyStyle(1)}>
                        {fmtN(row.totalN)}
                      </td>
                      {/* Latest price — editable */}
                      <td className="px-2 py-2 text-right tabular-nums text-white private" style={stickyStyle(2)}>
                        <div className="relative">
                          <input
                            type="number"
                            step="any"
                            min="0"
                            placeholder={row.latestPrice != null ? row.latestPrice.toFixed(2) : '—'}
                            value={evData[`${row.name}___current`]?.price != null ? evData[`${row.name}___current`].price : ''}
                            onChange={(e) => handleCurrentPriceChange(row.name, e.target.value)}
                            title="Current price — leave blank to use last month's price"
                            className={[inputCls, evData[`${row.name}___current`]?.price != null ? 'border-accent-gold/40' : ''].join(' ')}
                            style={{ minWidth: 0, width: '100%' }}
                          />
                          {evData[`${row.name}___current`]?.price != null && (
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] text-accent-gold/60 pointer-events-none" title="Current price override">✎</span>
                          )}
                        </div>
                      </td>
                      {/* Total € */}
                      <td className="px-4 py-3 text-right tabular-nums text-white private" style={stickyStyle(3)}>
                        {fmtEur(row.totalEur)}
                      </td>
                      {/* % total */}
                      <td className="px-4 py-3 text-right tabular-nums text-secondary" style={stickyStyle(4)}>
                        {grandTotalEur > 0 ? ((row.totalEur / grandTotalEur) * 100).toFixed(1) + '%' : '—'}
                      </td>
                      {/* +/- € */}
                      <td className="px-4 py-3 text-right tabular-nums private" style={{ ...stickyStyle(5), color: pnlColor(row.pnlEur) }}>
                        {pnlSign(row.pnlEur)}{fmtEur(row.pnlEur)}
                      </td>
                      {/* +/- % */}
                      <td className="px-4 py-3 text-right tabular-nums" style={{ ...stickyStyle(6), color: pnlColor(row.pnlPct) }}>
                        {row.pnlPct != null ? `${pnlSign(row.pnlPct)}${row.pnlPct.toFixed(2)}%` : '—'}
                      </td>

                      {/* Month cells */}
                      {allMonths.map((m) => {
                        const nVal = dcaByAsset[row.name]?.participations?.[m] || 0;
                        const dcaAmt = dcaByAsset[row.name]?.months?.[m];
                        const isDcaAuto = nVal > 0 && dcaAmt != null;
                        const { value: resolvedPrice, isManual } = getPrice(row.name, m);
                        const priceDisplayVal = resolvedPrice != null ? resolvedPrice.toFixed(2) : '';

                        return (
                          <React.Fragment key={m}>
                            <td className="px-2 py-3 text-center tabular-nums text-white border-l border-white/[0.06]" style={{ minWidth: 65 }}>
                              {nVal > 0 ? fmtN(nVal) : '—'}
                            </td>
                            <td className="py-2 px-1 text-center tabular-nums" style={{ minWidth: 110, maxWidth: 110 }}>
                              {isDcaAuto ? (
                                <span className="text-xs text-secondary tabular-nums private" title="Auto-calculated from DCA (amount ÷ N)">
                                  {priceDisplayVal || '—'}
                                </span>
                              ) : (
                                <div className="relative">
                                  <input
                                    type="number"
                                    step="any"
                                    min="0"
                                    placeholder="—"
                                    value={priceDisplayVal}
                                    onChange={(e) => handleCellChange(row.name, m, e.target.value)}
                                    title={isManual ? 'Manual override — clear to remove' : 'Enter price manually'}
                                    className={[
                                      inputCls,
                                      isManual ? 'border-primary/40' : '',
                                    ].join(' ')}
                                    style={{ minWidth: 0, width: '100%' }}
                                  />
                                  {isManual && (
                                    <span
                                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] text-primary/60 pointer-events-none"
                                      title="Manual override">✎</span>
                                  )}
                                </div>
                              )}
                            </td>
                          </React.Fragment>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>

              <tfoot>
                <tr className="border-t border-white/10 text-sm font-semibold">
                  <td className="px-4 py-3 text-secondary" style={stickyStyle(0)}>Total</td>
                  <td className="px-4 py-3 text-right tabular-nums text-white" style={stickyStyle(1)}>
                    {fmtN(assetRows.reduce((s, r) => s + r.totalN, 0))}
                  </td>
                  <td className="px-4 py-3 text-right text-secondary" style={stickyStyle(2)}>—</td>
                  <td className="px-4 py-3 text-right tabular-nums text-white private" style={stickyStyle(3)}>
                    {fmtEur(grandTotalEur)}
                  </td>
                  <td className="px-4 py-3 text-right text-secondary" style={stickyStyle(4)}>100%</td>
                  <td className="px-4 py-3 text-right tabular-nums private" style={{ ...stickyStyle(5), color: pnlColor(grandPnlEur) }}>
                    {pnlSign(grandPnlEur)}{fmtEur(grandPnlEur)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums" style={{ ...stickyStyle(6), color: pnlColor(grandPnlPct) }}>
                    {grandPnlPct != null ? `${pnlSign(grandPnlPct)}${grandPnlPct.toFixed(2)}%` : '—'}
                  </td>
                  {allMonths.map((m) => (
                    <React.Fragment key={m}>
                      <td className="px-2 py-3 text-center tabular-nums text-secondary border-l border-white/[0.06]"
                        style={{ minWidth: 65 }}>
                        {monthlyTotalN[m] > 0 ? fmtN(monthlyTotalN[m]) : '—'}
                      </td>
                      <td className="px-2 py-3 text-center text-secondary" style={{ minWidth: 110 }}>—</td>
                    </React.Fragment>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Distribution charts */}
        {assetRows.some((r) => r.totalEur > 0) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            <div className="bg-surface border border-white/10 rounded-xl p-5">
              <h3 className="text-[11px] font-semibold text-secondary uppercase tracking-widest mb-4">
                Portfolio by type
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

            <div className="bg-surface border border-white/10 rounded-xl p-5">
              <h3 className="text-[11px] font-semibold text-secondary uppercase tracking-widest mb-4">
                Assets by type
              </h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={assetBarData} barGap={4}>
                  <XAxis dataKey="type" tick={{ fill: '#3d5a78', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#3d5a78', fontSize: 11 }} axisLine={false} tickLine={false} width={60}
                    tickFormatter={(v) => v >= 1000 ? `€${(v / 1000).toFixed(0)}k` : `€${v}`} />
                  <Tooltip content={<DistBarTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11, color: '#7a95b2' }} />
                  {assetNameList.map((name) => (
                    <Bar key={name} dataKey={name} stackId="a" fill={assetColorMap[name]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>

          </div>
        )}

        {/* Charts */}
        {selectedAsset && chartData.length > 0 && (
          <div className="space-y-4">
            <p className="text-[11px] font-semibold text-secondary uppercase tracking-widest">
              {selectedAsset} — performance over time
            </p>

            {/* Chart 1: Contributed vs Value */}
            <div className="bg-surface border border-white/10 rounded-xl p-5">
              <h4 className="text-xs text-secondary uppercase tracking-widest mb-4">
                Capital invested vs actual value
              </h4>
              <ResponsiveContainer width="100%" height={240}>
                <ComposedChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: '#3d5a78', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#3d5a78', fontSize: 11 }} axisLine={false} tickLine={false} width={70}
                    tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`} />
                  <Tooltip content={<ChartTooltip fmtVal={fmtEur} />} />
                  <Legend wrapperStyle={{ fontSize: 11, color: '#7a95b2' }} />
                  <Area type="monotone" dataKey="contributed" name="Contributed"
                    fill="rgba(0,200,150,0.10)" stroke="rgba(0,200,150,0.35)" strokeWidth={1.5} />
                  <Line type="monotone" dataKey="value" name="Value"
                    stroke="#00c896" strokeWidth={2} dot={{ fill: '#00c896', r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* Chart 2: +/- € */}
            <div className="bg-surface border border-white/10 rounded-xl p-5">
              <h4 className="text-xs text-secondary uppercase tracking-widest mb-4">+/- € over time</h4>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: '#3d5a78', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#3d5a78', fontSize: 11 }} axisLine={false} tickLine={false} width={70}
                    tickFormatter={(v) => `€${(v / 1000).toFixed(1)}k`} />
                  <Tooltip content={<ChartTooltip
                    fmtVal={(v) => `${v >= 0 ? '+' : ''}${fmtEur(v)}`}
                    getValueColor={pnlDotColor}
                  />} />
                  <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" strokeDasharray="4 3" />
                  <Line type="monotone" dataKey="pnlEur" name="+/- €"
                    stroke="#3d9eff" strokeWidth={2} dot={<PnlDot />} activeDot={<PnlActiveDot />} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Chart 3: +/- % */}
            <div className="bg-surface border border-white/10 rounded-xl p-5">
              <h4 className="text-xs text-secondary uppercase tracking-widest mb-4">+/- % over time</h4>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: '#3d5a78', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#3d5a78', fontSize: 11 }} axisLine={false} tickLine={false} width={55}
                    tickFormatter={(v) => `${v.toFixed(0)}%`} />
                  <Tooltip content={<ChartTooltip
                    fmtVal={(v) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`}
                    getValueColor={pnlDotColor}
                  />} />
                  <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" strokeDasharray="4 3" />
                  <Line type="monotone" dataKey="pnlPct" name="+/- %"
                    stroke="#3d9eff" strokeWidth={2} dot={<PnlDot />} activeDot={<PnlActiveDot />} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {selectedAsset && chartData.length > 0 && chartData.every((d) => d.value === 0) && (
          <div className="bg-surface border border-white/10 rounded-xl p-8 text-center text-muted text-sm">
            Enter N values in the table above to see performance charts.
          </div>
        )}

      </div>
    </div>
  );
}
