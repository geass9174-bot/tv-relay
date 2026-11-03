import { getQuote } from '@mathieuc/tradingview';
import { writeFileSync, mkdirSync } from 'node:fs';

// Quotes only. Candles live in scripts/bars.mjs on their own slower clock.
// Canonical TradingView codes, verified 2026-11-03 against a 25-symbol probe.
const QUOTE_SYMBOLS = [
  'FX_IDC:XAUUSD',   // gold   (TVC:GOLD is the same instrument, lags ~$1 in fast tape)
  'TVC:SILVER',      // silver (NOT XAGUSD per house convention)
  'FX:USOIL',        // WTI    (NOT TVC:USOIL: volume always 0, printed a $1.5 stale tick)
  'FX:UKOIL',        // Brent  (NOT NYMEX:BZ1!: continuous contract, rolls)
  'FX:EURUSD', 'FX:GBPUSD', 'FX:USDJPY', 'FX:USDCHF',
  'FX:GBPCAD', 'FX:GBPAUD', 'FX:GBPNZD', 'FX:GBPJPY',
  'FX:EURJPY', 'FX:EURGBP',
  'TVC:DXY',
  'BITSTAMP:BTCUSD', // NOT BINANCE:BTCUSDT (USDT, ~0.18% premium)
];

const COLS = ['last', 'bid', 'ask', 'spread', 'chg', 'chg_pct',
              'open', 'high', 'low', 'prev_close', 'volume', 'ts', 'provider'];

const r5 = (x) => {
  if (x === null || x === undefined) return null;
  const n = Number(x);
  if (!Number.isFinite(n)) return null;
  if (Math.abs(n) >= 1e12) return null;   // TVC feeds emit 1e+100 as a "no volume" sentinel
  return Math.round(n * 1e5) / 1e5;
};

const key = (s) => s.replace(/^(FX_IDC|FX|TVC|BITSTAMP|NYMEX):/, '');

// FX change / intraday position is unreliable for ~1h after the 17:00 ET day cut.
// Gold and silver use a different day cut and are unaffected.
const etHour = Number(new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York', hour: '2-digit', hour12: false,
}).format(new Date()));
const fxRollover = etHour === 17;

mkdirSync('data', { recursive: true });
const quotes = { u: new Date().toISOString(), cols: COLS, rows: {} };
let ok = 0, failed = 0;

for (const symbol of QUOTE_SYMBOLS) {
  try {
    const q = await getQuote(symbol, { timeoutMs: 20000 });
    const bid = q.bid ?? null;
    const ask = q.ask ?? null;
    quotes.rows[key(symbol)] = [
      r5(q.lp), r5(bid), r5(ask),
      bid != null && ask != null ? r5(ask - bid) : null,
      r5(q.ch), r5(q.chp),
      r5(q.open_price), r5(q.high_price), r5(q.low_price), r5(q.prev_close_price),
      r5(q.volume), q.lp_time ?? null, q.provider_id ?? null,
    ];
    ok++;
  } catch (e) {
    quotes.rows[key(symbol)] = { error: e.code || String(e.message) };
    failed++;
  }
}

quotes.s = { ok, failed };
if (fxRollover) quotes.warn = 'fx_change_unreliable_et_rollover';
writeFileSync('data/quotes.json', JSON.stringify(quotes));
console.log('quotes', JSON.stringify(quotes.s), fxRollover ? 'FX_ROLLOVER' : '');
