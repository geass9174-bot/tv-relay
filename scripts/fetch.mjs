import { getQuote, getCandles } from '@mathieuc/tradingview';
import { writeFileSync, mkdirSync } from 'node:fs';

const SYMBOLS = [
  'OANDA:XAUUSD', 'OANDA:XAGUSD',
  'FX:GBPUSD', 'FX:EURUSD', 'FX:USDJPY',
  'BINANCE:BTCUSDT',
  'TVC:USOIL', 'TVC:UKOIL',
];
const TIMEFRAMES = ['D', '60'];
const COUNT = 200;

// Compact tabular layout: one row per symbol, column order fixed by COLS.
// Keeps the payload around 1 KB (~500 tokens) instead of 3 KB pretty-printed.
const COLS = ['last', 'bid', 'ask', 'spread', 'chg', 'chg_pct',
              'open', 'high', 'low', 'prev_close', 'volume', 'ts', 'provider'];

const r5 = (x) => {
  if (x === null || x === undefined) return null;
  const n = Number(x);
  return Number.isFinite(n) ? Math.round(n * 1e5) / 1e5 : null;
};

mkdirSync('data/bars', { recursive: true });
const now = new Date().toISOString();

const quotes = { u: now, cols: COLS, rows: {} };
const index = { u: now, bars: [] };
let ok = 0, failed = 0;

// ---- quotes ----
for (const symbol of SYMBOLS) {
  const key = symbol.split(':')[1];
  try {
    const q = await getQuote(symbol, { timeoutMs: 20000 });
    const bid = q.bid ?? null;
    const ask = q.ask ?? null;
    quotes.rows[key] = [
      r5(q.lp), r5(bid), r5(ask),
      bid != null && ask != null ? r5(ask - bid) : null,
      r5(q.ch), r5(q.chp),
      r5(q.open_price), r5(q.high_price), r5(q.low_price), r5(q.prev_close_price),
      q.volume ?? null, q.lp_time ?? null, q.provider_id ?? null,
    ];
    ok++;
  } catch (e) {
    quotes.rows[key] = { error: e.code || String(e.message) };
    failed++;
  }
}

// ---- bars ----
for (const symbol of SYMBOLS) {
  for (const tf of TIMEFRAMES) {
    const slug = `${symbol.replace(':', '_')}_${tf}`;
    const path = `data/bars/${slug}.json`;
    try {
      const bars = await getCandles({ symbol, timeframe: tf, count: COUNT, timeoutMs: 30000 });
      writeFileSync(path, JSON.stringify({
        symbol, timeframe: tf, updated_at: now, count: bars.length, bars,
      }));
      index.bars.push([slug, bars.length, bars.at(-1)?.time ?? null, bars.at(-1)?.close ?? null]);
      ok++;
    } catch (e) {
      index.bars.push([slug, 0, null, e.code || String(e.message)]);
      failed++;
    }
  }
}

quotes.s = { ok, failed };
writeFileSync('data/quotes.json', JSON.stringify(quotes));
writeFileSync('data/index.json', JSON.stringify(index));
console.log('done', JSON.stringify(quotes.s));
