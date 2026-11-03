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

mkdirSync('data/bars', { recursive: true });

const now = new Date().toISOString();
const quotesOut = { updated_at: now, quotes: {} };
const index = { updated_at: now, quotes_file: 'data/quotes.json', bars: [] };
let ok = 0;
let failed = 0;

// --- compact quotes: only the fields a report actually needs ---
for (const symbol of SYMBOLS) {
  let row;
  try {
    const q = await getQuote(symbol, { timeoutMs: 20000 });
    const bid = q.bid ?? null;
    const ask = q.ask ?? null;
    row = {
      last: q.lp ?? null,
      bid,
      ask,
      spread: bid != null && ask != null ? Number((ask - bid).toFixed(6)) : null,
      chg: q.ch ?? null,
      chg_pct: q.chp ?? null,
      open: q.open_price ?? null,
      high: q.high_price ?? null,
      low: q.low_price ?? null,
      prev_close: q.prev_close_price ?? null,
      volume: q.volume ?? null,
      ts: q.lp_time ?? null,
      currency: q.currency_code ?? null,
      provider: q.provider_id ?? null,
    };
    ok++;
  } catch (e) {
    row = { error: e.code || String(e.message) };
    failed++;
  }
  quotesOut.quotes[symbol] = row;
}

// --- bars: one file per symbol/timeframe so consumers fetch only what they need ---
for (const symbol of SYMBOLS) {
  for (const tf of TIMEFRAMES) {
    const slug = `${symbol.replace(':', '_')}_${tf}`;
    const path = `data/bars/${slug}.json`;
    try {
      const bars = await getCandles({
        symbol,
        timeframe: tf,
        count: COUNT,
        timeoutMs: 30000,
      });
      writeFileSync(
        path,
        JSON.stringify(
          {
            symbol,
            timeframe: tf,
            updated_at: now,
            count: bars.length,
            first: bars[0] || null,
            last: bars.at(-1) || null,
            bars,
          },
          null,
          0,
        ),
      );
      index.bars.push({
        symbol,
        timeframe: tf,
        path,
        count: bars.length,
        last_time: bars.at(-1)?.time ?? null,
        last_close: bars.at(-1)?.close ?? null,
      });
      ok++;
    } catch (e) {
      index.bars.push({ symbol, timeframe: tf, path, error: e.code || String(e.message) });
      failed++;
    }
  }
}

quotesOut.summary = { ok, failed };
writeFileSync('data/quotes.json', JSON.stringify(quotesOut, null, 2));
writeFileSync('data/index.json', JSON.stringify(index, null, 2));
console.log(`done ok=${ok} failed=${failed}`);
