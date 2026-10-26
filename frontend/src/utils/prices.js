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
export async function fetchFmpPrice(tickerOrIsin, apiKey) {
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
export async function fetchCoinGeckoPrice(ticker) {
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
