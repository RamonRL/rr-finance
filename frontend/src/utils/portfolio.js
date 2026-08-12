// Pure portfolio maths for the Savings → Portfolio tab. Kept free of React and
// of any rendering concern so it can be reasoned about — and tested — on its own.

export const byDate = (a, b) => a.date.localeCompare(b.date);

export const contributedBy = (contribs, date) =>
  contribs.filter(c => c.date <= date).reduce((s, c) => s + c.amount, 0);

/**
 * Market value on a given date — the one place that decides what the portfolio
 * was worth, so tiles, tables and charts can never disagree.
 *
 * Money paid in after the last valuation is carried at cost, not treated as a
 * gain: without that, every contribution date would show up as a sudden loss,
 * because contributed jumped while the last known value did not.
 *
 * Before the first valuation there is nothing to mark against, so the position
 * is carried at cost.
 */
export function valueAt(valuations, contribs, date) {
  const last = [...valuations].sort(byDate).filter(v => v.date <= date).pop();
  if (!last) return contributedBy(contribs, date);
  const addedSince = contribs
    .filter(c => c.date > last.date && c.date <= date)
    .reduce((s, c) => s + c.amount, 0);
  return last.value + addedSince;
}

/**
 * Time-weighted performance between consecutive valuations. Contributions
 * inside a period are treated as arriving at its end, so new money never counts
 * as a return.
 *
 * Chaining the period returns gives an index that drawdown can be read off. The
 * raw value series cannot be used for that: contributions make it rise on their
 * own, which would mask real falls.
 */
export function performance(valuations, contribs) {
  const vs = [...valuations].sort(byDate);
  const periods = [];
  let index = 1, peak = 1, maxDrawdown = 0;

  for (let i = 1; i < vs.length; i++) {
    const prev = vs[i - 1], cur = vs[i];
    if (!(prev.value > 0)) continue;
    const flows = contribs
      .filter(c => c.date > prev.date && c.date <= cur.date)
      .reduce((s, c) => s + c.amount, 0);
    const ret = (cur.value - flows) / prev.value - 1;
    index *= 1 + ret;
    peak = Math.max(peak, index);
    maxDrawdown = Math.min(maxDrawdown, index / peak - 1);
    periods.push({ date: cur.date, ret: ret * 100 });
  }

  return { periods, index, maxDrawdown: periods.length ? maxDrawdown * 100 : null };
}

const DAY_MS = 86400000;
const toDate = (s) => new Date(s + 'T00:00:00');

/**
 * Money-weighted annualised return (XIRR) by bisection. Returns null when the
 * flows do not bracket a root, which happens for degenerate inputs.
 */
export function xirr(flows) {
  if (flows.length < 2) return null;
  const t0 = toDate(flows[0].date).getTime();
  const npv = (rate) => flows.reduce((s, f) => {
    const years = (toDate(f.date).getTime() - t0) / (365 * DAY_MS);
    return s + f.amount / Math.pow(1 + rate, years);
  }, 0);

  let lo = -0.9999, hi = 10;
  const nLo = npv(lo), nHi = npv(hi);
  if (!isFinite(nLo) || !isFinite(nHi) || nLo * nHi > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (npv(lo) * npv(mid) <= 0) hi = mid; else lo = mid;
  }
  return ((lo + hi) / 2) * 100;
}
