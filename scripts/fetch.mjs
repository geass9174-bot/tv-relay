import { getCandles, getQuote } from '@mathieuc/tradingview/data';
import { mkdirSync, writeFileSync } from 'node:fs';

const SYMBOLS = [
  'OANDA:XAUUSD',
  'OANDA:XAGUSD',
  'FX:GBPUSD',
  'FX:EURUSD',
  'FX:USDJPY',
  'BINANCE:BTCUSDT',
  'TVC:USOIL',
  'TVC:UKOIL',
];

const TIMEFRAMES = ['D', '60'];
const COUNT = 200;

mkdirSync('data', { recursive: true });

const out = {
  fetched_at: new Date().toISOString(),
  symbols: SYMBOLS,
  timeframes: TIMEFRAMES,
  quotes: {},
  candles: {},
};

let ok = 0;
let failed = 0;

for (const symbol of SYMBOLS) {
  try {
    out.quotes[symbol] = await getQuote(symbol, { timeoutMs: 20000 });
    ok++;
  } catch (e) {
    out.quotes[symbol] = { error: e.code || String(e.message) };
    failed++;
  }
}

for (const symbol of SYMBOLS) {
  for (const tf of TIMEFRAMES) {
    const key = `${symbol}|${tf}`;
    try {
      const c = await getCandles({
        symbol,
        timeframe: tf,
        count: COUNT,
        timeoutMs: 30000,
      });
      out.candles[key] = {
        count: c.length,
        first: c[0] || null,
        last: c.at(-1) || null,
        bars: c,
      };
      ok++;
    } catch (e) {
      out.candles[key] = { error: e.code || String(e.message) };
      failed++;
    }
  }
}

out.summary = { ok, failed };

writeFileSync('data/latest.json', JSON.stringify(out, null, 2));
console.log(`done ok=${ok} failed=${failed}`);
