# Recovery OS daily refresh

The site has two independent update lanes:

1. GitHub Actions runs `public-research.yml` every day at 12:37 and 22:37 UTC, and when collector code or `data/market-quotes.json` changes. It refreshes all prepared dossiers, official macro sources, verified issuer feeds, the directory, atlas, coverage, and health. It applies the most recent quote observations and publishes the resulting Pages build. Schedules may run late.
2. The connected **Refresh Recovery OS** ChatGPT task collects timestamped market quotes for every symbol in `data/open-research/index.json` and all tracked symbols. It uses the finance tool, including `type=fund` for ETFs and `BRK.B` for canonical `BRK-B`, then imports and publishes the evidence. This task requires the connected GitHub app. It is the keyless quote collection lane; GitHub cannot call the ChatGPT finance tool itself.

## Connected quote publication

Read the current `main` branch before each update. Collect quotes in bounded batches and retain the complete finance tool responses. Write a temporary JSON object:

```json
{"collectedAt":"actual UTC retrieval timestamp","requested":["AAPL"],"responses":[{"result":{"content":[{"type":"text","text":"unmodified finance tool response"}]}}]}
```

Run `python3 scripts/import_market_quotes.py --input /path/to/evidence.json`. Publish **only** `data/market-quotes.json` and its dated `data/market-observations/YYYY-MM-DD.json` evidence archive in one non-forced commit based on current `main`. Use the native GitHub tree/commit/ref operations if shell Git credentials are unavailable. Do not change code, provider permissions, or the canonical tracker in a scheduled quote run. The push triggers the source workflow, which applies the observations to dossiers, atlas and coverage. Verify its run and the Pages deployment via the GitHub Actions API. Report a failed collection or deployment as a failure.

The importer validates the requested ticker, finite positive price, currency, actual trade timestamp and weekday. It never infers a daily close or generates OHLC bars from a quote. An older quote cannot replace a newer observation, regardless of retrieval time. Source text is preserved in the dated archive. Failed symbols retain their prior dates and are listed in `unavailable`.

## Browser refresh

`data/refresh-status.json` carries a content revision independent of the recovery-thesis revision. Open pages check it every minute and on resume/online. Manual refresh checks every layer immediately. A changed revision invalidates the request, research, atlas and information caches and refreshes visible data without changing the selected historical replay date or the camera location.

The Daily refresh panel reports component coverage and dates. **Partial** means at least one component could not supply current observations. The broad directory contains thousands of additional securities with older or unavailable data; 235 prepared dossiers were included at this release. Directory entries are not a claim of current quote coverage.

## Retained limitations

- Daily historical OHLC requires an authorized feed. The Stooq adapter accepts the server-side `STOOQ_API_KEY` repository secret. Without it, saved chart bars retain their original dates and provenance.
- SEC may reject runner requests. Cooldowns and original evidence are retained; successful macro or quote collection does not claim fresh SEC filings.
- Verified issuer feeds currently cover AAPL, NVDA, MSFT, AMD, ENPH and ON. Other company news relies on SEC events and saved evidence. New adapters require a verified issuer feed and dated linked headlines.
- `data/recovery-os.json` is protected by a hash check. Discovery prices/dates, thesis scores, stage history, notes, watchlists and trading records are not rewritten by market collection.
- No future or present quote is inserted into historical replay. Quote and chart metadata are separate.
