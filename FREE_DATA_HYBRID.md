# Recovery OS — Free Data Hybrid

This branch removes the hard paid-provider gate from Stock Explorer.

## Product behavior

- Any syntactically valid ticker can open a research shell instead of returning `No supported match`.
- Cached research remains available for existing fixtures.
- Canonical `data/recovery-os.json` is not modified by general stock search.
- Missing data remains explicitly unavailable; Recovery OS never invents prices, fundamentals, news, or qualification.

## Free/public data architecture

1. **SEC EDGAR** — ticker/CIK identity, submissions, filings, and XBRL company facts. SEC APIs do not require an API key, but `data.sec.gov` does not support browser CORS, so production access should be server-side and must follow SEC fair-access/User-Agent requirements.
2. **TradingView** — remains the user's live chart/quote surface. Recovery OS may receive user-configured HTTPS webhook alert events. A TradingView subscription is not treated as a general-purpose quote API.
3. **OHLCV source** — add a legal free/delayed/EOD bar source server-side. Recovery OS calculates SMA/EMA/RSI/MACD/ATR/support/resistance locally from bars.
4. **Public web/news research** — scanner runs can use verified public sources and preserve source/timestamp labels in canonical scan updates.

## Data labels

Use explicit states such as `SEC VERIFIED`, `TRADINGVIEW EVENT`, `DELAYED/EOD`, `MODEL CALCULATION`, `CACHED`, and `UNAVAILABLE`.

## Security boundary

Do not place provider secrets in GitHub Pages. SEC requests and TradingView webhook ingestion need a server-side endpoint for production. The existing prepared Worker architecture can be adapted without requiring Massive.

## Current branch scope

This first patch fixes the immediate mobile blocker: PLTR and other uncached ticker strings open a free research shell. It does not claim live prices or SEC data are already being fetched from the static GitHub Pages app. The next backend step is the free SEC/TradingView bridge.
