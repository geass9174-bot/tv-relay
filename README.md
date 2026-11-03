# tv-relay

Market data relay. GitHub Actions reaches TradingView, fetches candles and quotes,
and commits the result to `data/latest.json` so a network-restricted consumer can
read it over plain HTTPS from `raw.githubusercontent.com`.

- `data/latest.json` — quotes plus last 200 bars per symbol/timeframe
- Runs every 30 minutes, on push, and on manual dispatch

Unofficial. Not affiliated with TradingView.
