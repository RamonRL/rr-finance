import { useState, useMemo } from 'react';
import { API_URL } from '../constants';
import { useStore } from '../hooks/useStore';
import { buildHoldings } from '../utils/holdings';
import { fetchFmpPrice } from '../utils/prices';

const DCA_KEY = 'rr-finance-dca-contributions';
const EVO_KEY = 'rr-finance-evolution-data';
const PICKS_KEY = 'rr-picks';
const STOCK_CAP = 4; // % of the portfolio

const fmtEur = (v) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(v ?? 0);
const inputCls = 'w-full bg-elevated border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent-green/50 placeholder-muted';
const EMPTY = { ticker: '', name: '', thesis: '', targetPrice: '', stopPrice: '' };

const QUICK = [
  'Analiza esta watchlist: tesis, riesgos y cuál tiene mejor encaje con mi cartera.',
  'Revisa mi cartera completa: concentración, solapamientos y qué aportaría diversificar.',
  'Propón 3 ideas de ETFs o acciones para mi cesta experimental con su tesis y riesgos.',
];

export default function PicksPage() {
  const [contributions] = useStore(DCA_KEY, []);
  const [evData] = useStore(EVO_KEY, {});
  const [picks, setPicks] = useStore(PICKS_KEY, []);
  const [apiKeys] = useStore('rr_finance_api_keys', { fmp: '' });
  const [form, setForm] = useState(EMPTY);
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState('');
  const [search, setSearch] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const { assetRows, grandTotalEur } = useMemo(
    () => buildHoldings(contributions, evData), [contributions, evData]);
  const stocks = assetRows.filter(r => r.meta.type === 'Stock');
  const stockValue = stocks.reduce((s, r) => s + r.totalEur, 0);
  const stockPct = grandTotalEur > 0 ? (stockValue / grandTotalEur) * 100 : 0;

  const add = () => {
    const ticker = form.ticker.trim().toUpperCase();
    if (!ticker) return;
    setPicks([...picks, {
      id: crypto.randomUUID(), ticker, name: form.name.trim(), thesis: form.thesis.trim(),
      targetPrice: parseFloat(form.targetPrice) || null, stopPrice: parseFloat(form.stopPrice) || null,
      price: null, addedOn: new Date().toISOString().slice(0, 10),
    }]);
    setForm(EMPTY);
  };

  const refreshPrices = async () => {
    if (!apiKeys?.fmp) { setErr('Configure the FMP key in Investments → Evolution first.'); return; }
    setErr('');
    const next = await Promise.all(picks.map(async p => {
      try {
        const r = await fetchFmpPrice(p.ticker, apiKeys.fmp);
        return r?.price != null ? { ...p, price: r.price, currency: r.currency } : p;
      } catch { return p; }
    }));
    setPicks(next);
  };

  const context = () => JSON.stringify({
    patrimonio_invertido_eur: Math.round(grandTotalEur),
    cesta_acciones_pct: Number(stockPct.toFixed(2)),
    tope_cesta_pct: STOCK_CAP,
    posiciones: assetRows.map(r => ({
      activo: r.name, tipo: r.meta.type, broker: r.meta.broker,
      valor_eur: Math.round(r.totalEur),
      pct: grandTotalEur > 0 ? Number(((r.totalEur / grandTotalEur) * 100).toFixed(1)) : 0,
      pnl_pct: r.pnlPct != null ? Number(r.pnlPct.toFixed(1)) : null,
    })),
    watchlist: picks.map(p => ({
      ticker: p.ticker, nombre: p.name, tesis: p.thesis,
      precio: p.price, objetivo: p.targetPrice, stop: p.stopPrice,
    })),
  });

  const send = async (text) => {
    const content = (text ?? input).trim();
    if (!content || busy) return;
    const next = [...msgs, { role: 'user', content }];
    setMsgs(next); setInput(''); setBusy(true); setErr('');
    try {
      const res = await fetch(`${API_URL}/ai/chat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next, context: context(), search }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'AI request failed');
      setMsgs([...next, { role: 'assistant', content: data.reply }]);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto custom-scrollbar p-3 md:p-6">
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-4">

        <div className="space-y-4 min-w-0">
          <div className="bg-surface border border-white/10 rounded-xl p-4 space-y-2">
            <h3 className="text-[11px] font-semibold text-secondary uppercase tracking-widest">Stock basket</h3>
            <p className="text-sm text-white">
              <span className={`tabular-nums ${stockPct > STOCK_CAP ? 'text-red-400' : 'text-accent-green'}`}>{stockPct.toFixed(2)}%</span>
              <span className="text-secondary"> of portfolio · cap {STOCK_CAP}% · </span>
              <span className="tabular-nums private">{fmtEur(stockValue)}</span>
            </p>
            {stocks.length === 0
              ? <p className="text-xs text-muted">No single stocks yet. Add one in Investments → DCA with type “Stock”.</p>
              : stocks.map(r => (
                <div key={r.name} className="flex justify-between text-sm">
                  <span className="text-white">{r.name}</span>
                  <span className="tabular-nums private text-secondary">
                    {fmtEur(r.totalEur)} · {r.pnlPct != null ? `${r.pnlPct >= 0 ? '+' : ''}${r.pnlPct.toFixed(1)}%` : '—'}
                  </span>
                </div>))}
          </div>

          <div className="bg-surface border border-white/10 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-[11px] font-semibold text-secondary uppercase tracking-widest">Watchlist</h3>
              <button onClick={refreshPrices} className="text-xs text-accent-blue hover:underline">Refresh prices</button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input className={inputCls} placeholder="Ticker / ISIN" value={form.ticker} onChange={e => setForm({ ...form, ticker: e.target.value })} />
              <input className={inputCls} placeholder="Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              <input className={inputCls} type="number" placeholder="Target price" value={form.targetPrice} onChange={e => setForm({ ...form, targetPrice: e.target.value })} />
              <input className={inputCls} type="number" placeholder="Stop price" value={form.stopPrice} onChange={e => setForm({ ...form, stopPrice: e.target.value })} />
              <textarea className={`${inputCls} col-span-2`} rows={2} placeholder="Thesis" value={form.thesis} onChange={e => setForm({ ...form, thesis: e.target.value })} />
            </div>
            <button onClick={add} className="w-full px-4 py-2 bg-accent-green/10 border border-accent-green/30 text-accent-green text-sm font-medium rounded-lg hover:bg-accent-green/20">Add to watchlist</button>

            {picks.map(p => {
              const upside = p.price && p.targetPrice ? (p.targetPrice / p.price - 1) * 100 : null;
              return (
                <div key={p.id} className="border-t border-white/[0.06] pt-2 text-sm">
                  <div className="flex justify-between gap-2">
                    <span className="text-white font-medium">{p.ticker} <span className="text-secondary font-normal">{p.name}</span></span>
                    <button onClick={() => setPicks(picks.filter(x => x.id !== p.id))} className="text-muted hover:text-red-400 text-xs">remove</button>
                  </div>
                  <p className="text-xs text-secondary tabular-nums">
                    {p.price != null ? `${p.price} ${p.currency || ''}` : 'no price'}
                    {p.targetPrice && ` · target ${p.targetPrice}`}{p.stopPrice && ` · stop ${p.stopPrice}`}
                    {upside != null && ` · upside ${upside.toFixed(1)}%`}
                  </p>
                  {p.thesis && <p className="text-xs text-muted mt-1">{p.thesis}</p>}
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-surface border border-white/10 rounded-xl p-4 flex flex-col gap-3 min-w-0">
          <div className="flex items-center justify-between">
            <h3 className="text-[11px] font-semibold text-secondary uppercase tracking-widest">Claude assistant</h3>
            <label className="text-xs text-secondary flex items-center gap-1.5">
              <input type="checkbox" checked={search} onChange={e => setSearch(e.target.checked)} /> Search the web
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            {QUICK.map(q => (
              <button key={q} onClick={() => send(q)} disabled={busy}
                className="text-xs text-left px-2 py-1 border border-white/10 rounded-lg text-secondary hover:text-white disabled:opacity-40">{q}</button>
            ))}
          </div>
          <div className="flex-1 space-y-3 min-h-[200px] max-h-[55vh] overflow-y-auto custom-scrollbar">
            {msgs.map((m, i) => (
              <div key={i} className={`text-sm whitespace-pre-wrap rounded-lg p-3 ${m.role === 'user' ? 'bg-elevated text-white' : 'bg-white/[0.03] text-secondary'}`}>{m.content}</div>
            ))}
            {busy && <p className="text-xs text-muted">Thinking…</p>}
          </div>
          {err && <p className="text-xs text-red-400">{err}</p>}
          <div className="flex gap-2">
            <input className={inputCls} placeholder="Ask about a stock, ETF or your portfolio…" value={input}
              onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} />
            <button onClick={() => send()} disabled={busy}
              className="px-4 bg-accent-green/10 border border-accent-green/30 text-accent-green text-sm rounded-lg disabled:opacity-40">Send</button>
          </div>
          <p className="text-[10px] text-muted">Decision support, not financial advice. Your portfolio and watchlist are sent to Claude as context.</p>
        </div>
      </div>
    </div>
  );
}
