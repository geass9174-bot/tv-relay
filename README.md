# tv-relay

Market data relay. GitHub Actions reaches TradingView, fetches quotes and candles,
and commits them so a network-restricted consumer can read them over plain HTTPS.

## Read this, not everything

| File | Size | Use |
| --- | --- | --- |
| `data/quotes.json` | ~4 KB | last / bid / ask / spread / OHLC / change for all symbols |
| `data/index.json` | ~3 KB | list of bar files with last close, so you can pick one |
| `data/bars/<SYM>_<TF>.json` | ~40 KB each | 200 bars for one symbol/timeframe |

Fetch `data/quotes.json` for a normal report. Only pull a bars file when you need
ATR, structure or backtesting. Pulling everything is ~600 KB and is a waste of tokens.

## Symbols

`OANDA:XAUUSD`, `OANDA:XAGUSD`, `FX:GBPUSD`, `FX:EURUSD`, `FX:USDJPY`,
`BINANCE:BTCUSDT`, `TVC:USOIL`, `TVC:UKOIL`

## Notes

- Runs every 15 minutes, on push, and on manual dispatch.
- Quotes carry `bid`/`ask`/`spread` — needed for retail spread costing.
- `ts` is a unix timestamp in seconds.
- Anonymous access: shorter intraday history, no Pine studies, possibly delayed.
- Unofficial. Not affiliated with TradingView.
