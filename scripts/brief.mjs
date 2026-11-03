import { readFileSync, writeFileSync } from 'node:fs';

// Builds data/brief.json from files already committed to the repo.
// Zero upstream requests: daily bars come from data/bars/*_D.json, live fields from data/quotes.json.
// Purpose: replace ~7.8k tokens of raw candles with ~724 tokens of derived stats.
const SYMBOLS = ['XAUUSD', 'SILVER', 'USOIL', 'UKOIL', 'EURUSD', 'GBPUSD', 'USDJPY', 'BTCUSD'];

const COLS = ['last', 'chg_pct', 'd_high', 'd_low', 'prev_close', 'bid', 'ask',
              'atr14', 'atr_pct', 'pday_h', 'pday_l', 'd20_h', 'd20_l',
              'ma20', 'ma50', 'rng_pos'];

const r5 = (x) => {
  if (x === null || x === undefined) return null;
  const n = Number(x);
  if (!Number.isFinite(n)) return null;
  if (Math.abs(n) >= 1e12) return null;   // TVC feeds emit 1e+100 as a "no volume" sentinel
  return Math.round(n * 1e5) / 1e5;
};

const NOW_SEC = Math.floor(Date.now() / 1000);
const readJson = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };
const sma = (a, n) => (a.length < n ? null : a.slice(-n).reduce((x, y) => x + y, 0) / n);

// Wilder's ATR over completed daily bars only.
function atr14(bars) {
  if (bars.length < 15) return null;
  const tr = [];
  for (let i = 1; i < bars.length; i++) {
    const h = bars[i].high, l = bars[i].low, pc = bars[i - 1].close;
    tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  let a = tr.slice(0, 14).reduce((x, y) => x + y, 0) / 14;
  for (let i = 14; i < tr.length; i++) a = (a * 13 + tr[i]) / 14;
  return a;
}

const quotes = readJson('data/quotes.json') ?? { rows: {} };
const brief = { u: new Date().toISOString(), cols: COLS, rows: {} };
let ok = 0, failed = 0;

// quotes.json stores cols + array rows, so map them back to named fields once.
const qcols = quotes.cols ?? [];
const qget = (sym) => {
  const row = quotes.rows?.[sym];
  if (!Array.isArray(row)) return null;
  const o = {};
  qcols.forEach((c, i) => { o[c] = row[i]; });
  return o;
};

for (const sym of SYMBOLS) {
  const q = qget(sym);
  const bf = readJson(`data/bars/${sym}_D.json`);
  const bars = Array.isArray(bf?.bars) ? bf.bars : [];
  // A daily bar is closed when a later bar exists, or when its 24h window has run out.
  // Never blind-slice: bars-daily runs 22:30 UTC, 30 minutes BEFORE the 23:00 UTC
  // (18:00 ET) boundary, so for ~23.5h of every 24 the newest bar on disk has already
  // closed and slice(0,-1) throws away a finished session -- pday_* goes a full day
  // stale and atr14 loses the newest closed TR. Ask the clock, not the array index.
  const done = bars.filter((b, i) => bars[i + 1] !== undefined || b.time + 86400 <= NOW_SEC);

  // An object in a map of arrays survives zip() and yields {'last':'error'} -- no
  // exception, a shape that looks fine, and a string where a price belongs.
  if (!done.length && !q) {
    brief.rows[sym] = COLS.map(() => null);
    (brief.bad ??= []).push(sym);
    failed++;
    continue;
  }

  const closes = done.map((b) => b.close);
  const win20 = done.slice(-20);
  const d20h = win20.length ? Math.max(...win20.map((b) => b.high)) : null;
  const d20l = win20.length ? Math.min(...win20.map((b) => b.low)) : null;
  const prev = done.at(-1);
  const a = atr14(done);
  // No fallback to the forming bar's close: that would make `last` a quote in one
  // row and a candle close in another, with s.ok counting both. Missing quote -> null.
  const last = q?.last ?? null;
  const rng = d20h != null && d20l != null && d20h !== d20l && last != null
    ? (last - d20l) / (d20h - d20l) : null;

  brief.rows[sym] = [
    r5(last), r5(q?.chg_pct), r5(q?.high), r5(q?.low), r5(q?.prev_close),
    r5(q?.bid), r5(q?.ask),
    r5(a), a != null && last ? r5((a / last) * 100) : null,
    r5(prev?.high), r5(prev?.low),
    r5(d20h), r5(d20l),
    r5(sma(closes, 20)), r5(sma(closes, 50)),
    r5(rng),
  ];
  if (brief.rows[sym].length !== COLS.length) {
    throw new Error(`${sym}: row length ${brief.rows[sym].length} !== COLS.length ${COLS.length}`);
  }
  ok++;
}

brief.s = { ok, failed };
// `u` is the last time the CONTENT changed, not the last successful build -- every
// writer here skips on no-change, so on a closed market `u` goes days stale while the
// relay is perfectly healthy. A >30min freshness gate on `u` therefore fires every
// weekend. Do NOT add an `hb` field to this payload: it would be excluded from `sig`
// like `u` and inherit the same defect. Liveness is read out of band, from the Actions
// API -- the last completed run of .github/workflows/fetch.yml. `u` answers "fresh",
// the Actions run answers "alive"; this payload cannot answer the second.
brief.asof = quotes.u ?? null;

// Only rewrite when the numbers actually moved. 'u' is excluded: restamping it
// every 15 minutes would make the tree dirty forever and defeat the quote-side guard.
const sig = (b) => (b ? JSON.stringify([b.cols, b.rows, b.s, b.asof]) : null);
const prevBrief = readJson('data/brief.json');

if (sig(prevBrief) === sig(brief)) {
  console.log('brief', JSON.stringify(brief.s), 'UNCHANGED - skip write');
} else {
  writeFileSync('data/brief.json', JSON.stringify(brief));
  console.log('brief', JSON.stringify(brief.s), 'written asof', brief.asof);
}
