import { getCandles } from '@mathieuc/tradingview';
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';

// Candles on their own clock. Usage: node scripts/bars.mjs <D|60>
//
// Writes only when a new bar has actually closed. Unchanged files are left untouched
// so `git diff --staged --quiet` can do its job. Deliberately no `updated_at` inside
// the payload: that field would differ on every run and defeat the change check.
const TF = process.argv[2];
if (TF !== 'D' && TF !== '60') {
  console.error('usage: node scripts/bars.mjs <D|60>');
  process.exit(1);
}

const BAR_SYMBOLS = [
  'FX_IDC:XAUUSD', 'TVC:SILVER', 'FX:USOIL', 'FX:UKOIL',
  'FX:EURUSD', 'FX:GBPUSD', 'FX:USDJPY', 'BITSTAMP:BTCUSD',
];
const COUNT = 200;

const key = (s) => s.replace(/^(FX_IDC|FX|TVC|BITSTAMP|NYMEX):/, '');
const readJson = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };
// A stable fingerprint of one bar. Numbers are rounded at the same 5 decimals fetch.mjs
// uses, so float jitter cannot be mistaken for a correction and turn every run into a
// commit. Everything else is taken as-is, on purpose -- see the note at `changed`.
const barKey = (b) => (b === null || b === undefined) ? null
  : JSON.stringify(b, (k, v) => (typeof v === 'number' && Number.isFinite(v)) ? Math.round(v * 1e5) / 1e5 : v);

mkdirSync('data/bars', { recursive: true });

const idxPath = 'data/index.json';
const idx = readJson(idxPath) ?? { bars: [] };
if (!Array.isArray(idx.bars)) idx.bars = [];

const rowOf = (slug, row) => {
  const i = idx.bars.findIndex((r) => Array.isArray(r) && r[0] === slug);
  if (i >= 0) idx.bars[i] = row; else idx.bars.push(row);
};

let wrote = 0, skipped = 0, failed = 0;

for (const symbol of BAR_SYMBOLS) {
  const slug = `${key(symbol)}_${TF}`;
  const path = `data/bars/${slug}.json`;
  try {
    const bars = await getCandles({ symbol, timeframe: TF, count: COUNT, timeoutMs: 30000 });
    const prev = readJson(path);
    const prevLast = prev?.bars?.at(-1)?.time ?? null;
    const nextLast = bars.at(-1)?.time ?? null;
    // A newly closed bar is the only thing worth a commit. Intra-bar OHLC drift is
    // ignored on purpose -- quotes.json already carries the live price.
    //
    // The newest bar's `time` is not enough on its own, and the failure is permanent:
    // if the provider settles the previous bar a minute AFTER the new one appears, the
    // write that sees the new bar stores the previous one short. Every later run then
    // sees the same `time`, `changed` is false, and nothing ever revisits it -- the
    // fetch happens and the write is suppressed, so fetching again cannot repair it.
    // That is the same defect as the old 22:30Z window at one sixth the magnitude.
    //
    // So the just-closed bar is compared too, and the WHOLE bar is compared, not a
    // list of fields. A field list is a promise that the list is complete: add a field
    // to the payload and the detector narrows silently with nothing failing. One string
    // compare has no list to go stale and catches a revision to any field, including
    // ones added later.
    //
    // Scope, stated so it is not overread: this reaches the second-newest bar only.
    // That is the one that can be wrong for our reason. A provider correcting bar N-5
    // is still dropped silently.
    const prevPenultKey = barKey(prev?.bars?.at(-2));
    const nextPenultKey = barKey(bars.at(-2));
    const penultMoved = prevPenultKey !== null && nextPenultKey !== null && prevPenultKey !== nextPenultKey;
    const changed = !prev || prevLast !== nextLast || prev.bars.length !== bars.length || penultMoved;
    if (changed) {
      writeFileSync(path, JSON.stringify({ symbol, timeframe: TF, count: bars.length, bars }));
      wrote++;
    } else {
      skipped++;
    }
    rowOf(slug, [slug, bars.length, nextLast, bars.at(-1)?.close ?? null]);
  } catch (e) {
    failed++;
    rowOf(slug, [slug, 0, null, e.code || String(e.message)]);
  }
}

// index.json only gets rewritten when something actually moved. Bumping `u`
// unconditionally would recreate the very problem this script exists to fix.
if (wrote > 0 || failed > 0) {
  idx.u = new Date().toISOString();
  idx.bars.sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  writeFileSync(idxPath, JSON.stringify(idx));
}

console.log(`bars ${TF}`, JSON.stringify({ wrote, skipped, failed }));
