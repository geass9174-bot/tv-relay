import { getQuote } from '@mathieuc/tradingview';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

// On-demand symbol probe. Edit probe.config.json to change what gets sampled.
const cfg = JSON.parse(readFileSync('probe.config.json', 'utf8'));
const symbols = Array.isArray(cfg.symbols) ? cfg.symbols : [];

const r5 = (x) => {
  if (x === null || x === undefined) return null;
  const n = Number(x);
  return Number.isFinite(n) ? Math.round(n * 1e5) / 1e5 : null;
};

const out = { u: new Date().toISOString(), rows: {} };
for (const s of symbols) {
  try {
    const q = await getQuote(s, { timeoutMs: 20000 });
    out.rows[s] = {
      last: r5(q.lp), bid: r5(q.bid), ask: r5(q.ask),
      chg: r5(q.ch), chg_pct: r5(q.chp),
      open: r5(q.open_price), high: r5(q.high_price), low: r5(q.low_price),
      prev_close: r5(q.prev_close_price), volume: q.volume ?? null,
      desc: q.description ?? null, provider: q.provider_id ?? null,
    };
  } catch (e) {
    out.rows[s] = { error: e.code || String(e.message) };
  }
}

mkdirSync('data', { recursive: true });
writeFileSync('data/probe.json', JSON.stringify(out, null, 1));
console.log('probed', Object.keys(out.rows).length);
