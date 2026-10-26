// Pure maths for the DCA portfolio, shared by every page that values it.
// Contributions live in the `rr-finance-dca-contributions` store and prices in
// `rr-finance-evolution-data`; nothing here touches React.

export const START_MONTH = '2026-02';

export function buildHoldings(contributions, evData = {}) {
  const rel = contributions.filter(c => c.month >= START_MONTH);

  const dcaByAsset = {};
  rel.forEach(c => {
    const a = (dcaByAsset[c.assetName] ??= {
      assetName: c.assetName, ticker: c.ticker,
      type: c.type, broker: c.broker, months: {}, participations: {},
    });
    a.months[c.month] = (a.months[c.month] || 0) + c.amount;
    a.participations[c.month] = (a.participations[c.month] || 0) + (c.participations || 0);
    if (c.ticker) a.ticker = c.ticker;
    a.type = c.type;
    if (c.broker) a.broker = c.broker;
  });

  const allMonths = [...new Set(rel.map(c => c.month))].sort();
  const assetNames = Object.keys(dcaByAsset);

  // Price an asset had in a month: a typed price wins, then the buy price
  // (amount / participations), then any stored price.
  const getPrice = (name, month) => {
    const ev = evData[`${name}___${month}`];
    if (ev?.priceIsManual && ev.priceSource !== 'refresh' && ev.price != null) return ev.price;
    const n = dcaByAsset[name]?.participations?.[month] || 0;
    const amt = dcaByAsset[name]?.months[month];
    if (n > 0 && amt != null) return amt / n;
    return ev?.price ?? null;
  };

  // Units, last known price and cost up to and including `upto` (a YYYY-MM).
  const position = (name, upto = '9999-12') => {
    let units = 0, price = null, cost = 0;
    allMonths.forEach(m => {
      if (m > upto) return;
      units += dcaByAsset[name].participations[m] || 0;
      const p = getPrice(name, m);
      if (p != null) price = p;
      cost += dcaByAsset[name].months[m] || 0;
    });
    return { units, price, cost };
  };

  const assetRows = assetNames.map(name => {
    const { units, price, cost } = position(name);
    const override = evData[`${name}___current`]?.price;
    const latestPrice = override != null ? override : price;
    const totalEur = units * (latestPrice ?? 0);
    const pnlEur = totalEur - cost;
    return {
      name, meta: dcaByAsset[name], totalN: units, latestPrice,
      totalContributed: cost, totalEur, pnlEur,
      pnlPct: cost > 0 ? (pnlEur / cost) * 100 : null,
    };
  });

  const grandTotalEur = assetRows.reduce((s, r) => s + r.totalEur, 0);
  const grandContributed = assetRows.reduce((s, r) => s + r.totalContributed, 0);

  // Portfolio value at the end of a past month, ignoring the "current price" override.
  const valueAt = (upto) =>
    assetNames.reduce((s, n) => { const p = position(n, upto); return s + p.units * (p.price ?? 0); }, 0);

  return { dcaByAsset, allMonths, assetNames, assetRows, grandTotalEur, grandContributed, getPrice, valueAt };
}

// Share of the portfolio value held in each value of `key` ('type' | 'broker').
export function shareBy(assetRows, key) {
  const total = assetRows.reduce((s, r) => s + r.totalEur, 0);
  const map = {};
  assetRows.forEach(r => {
    const k = r.meta[key] || 'Other';
    map[k] = (map[k] || 0) + r.totalEur;
  });
  return Object.entries(map)
    .map(([name, value]) => ({ name, value, pct: total > 0 ? (value / total) * 100 : 0 }))
    .sort((a, b) => b.value - a.value);
}

if (typeof process !== 'undefined' && process.argv?.[1]?.endsWith('holdings.js')) {
  const h = buildHoldings([
    { assetName: 'A', type: 'ETF', broker: 'X', month: '2026-03', amount: 100, participations: 10 },
    { assetName: 'A', type: 'ETF', broker: 'X', month: '2026-04', amount: 120, participations: 10 },
  ], { 'A___current': { price: 15 } });
  console.assert(h.grandContributed === 220, 'cost');
  console.assert(h.grandTotalEur === 300, 'value uses current override');
  console.assert(h.valueAt('2026-03') === 100, 'past value at buy price');
  console.assert(Math.round(shareBy(h.assetRows, 'broker')[0].pct) === 100, 'share');
  console.log('holdings ok');
}
