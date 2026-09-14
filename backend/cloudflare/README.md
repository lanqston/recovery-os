# Recovery OS free research API

The public research routes serve the verified Recovery OS archive. They require **no paid market feed, API key, or database**. Deploying the Worker is optional: the GitHub Pages application also reads the same public evidence directly.

## Public routes

- `GET /api/health`: free-source capability, storage configuration and service time.
- `GET /api/search?q=apple`: the broad security directory.
- `GET /api/stock/AAPL` and `/api/information/stock/AAPL`: a company bundle with original timestamps and sources.
- `/api/profile/AAPL`, `/api/financials/AAPL`, `/api/filings/AAPL`, `/api/news/AAPL`: the relevant dated records.
- `/api/bars/AAPL?interval=1d`: collected daily history; unsupported intervals are explained.
- `/api/earnings/AAPL`: reported SEC results, separate from unavailable estimates.
- `/api/positioning/AAPL`: ownership filing discovery. This is not a parsed ownership percentage or short-interest feed.
- `/api/screener`: supported price and market-cap filters. Unsupported filters return an explanation.
- `/api/information/health`: the latest published connector report.

Analyst opinions, options chains and fund holdings return structured limitations if no compatible free record exists. The Worker does not fabricate values or call a paid service to fill a gap. Market-session state is unknown without a current session source. Stored quotes are dated snapshots, not live quotes.

Public GETs carry no private-state token. Origin checks, allowlisted archive paths, bounded memory/edge caching, request coalescing, timeouts and cooldowns limit request cost. The browser checks the free-research capability before using an older configured backend; it retains saved research when the backend needs updating.

## Optional private state and historical monitoring

`RECOVERY_CLIENT_TOKEN` protects private state and saved watch conditions; keep it out of source files and screenshots. D1 is required only for private saved state and server-side historical observations, not public archive reads. The existing additive schema preserves those records. Watch conditions are saved as manual; no live price monitoring is claimed.

The optional scheduled Information Fabric adapter remains off unless `INFORMATION_MONITORING_ENABLED=true` and D1 is bound. SEC requires an identifying server-side `SEC_USER_AGENT`. The optional Alpha Vantage adapter additionally requires its free key and documented access approval; quota responses are never accepted as price data. Legacy Massive code is not called by public routes or scheduled watches.

## Deployment and validation

Use a local `wrangler.toml` based on `wrangler.toml.example`, with the authorized account and Worker name. No Cloudflare account binding or secrets are checked into this repository. Apply database migrations only when that optional storage is needed and its target has been reviewed.

Run `python scripts/validate_information.py` from the repository root. After deploying to the authorized Worker, verify `/api/health` reports `freeResearch: true` before updating the site connection. Static site publication does not deploy this optional Worker.

No route or maintenance job modifies `data/recovery-os.json`.
