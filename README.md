# RECOVERY // OS

RECOVERY // OS is a mobile-first crisis-to-recovery stock intelligence and tracking portal.

This repository is the canonical portal host and tracker bridge for the v2.0 Crisis-to-Recovery Swing Scanner.

The deployed baseline contains 4 qualified securities (STZ, DECK, NKE, ZTS), 2 provisional exception-review records (ENPH, ON), and a research queue (ADBE, PYPL). Provisional names remain explorable in the 3D world but are excluded from qualified counts/performance until formally qualified under v2.0.

## Open research universe

Recovery OS opens directly into a Three.js market world. Thirteen sector districts and six research destinations connect company worlds, the recovery lab, news, macro evidence, saved work and source archives. The sharded atlas contains more than 10,000 searchable securities with dated public research snapshots. Broad-universe coverage varies by provider, while the canonical Recovery tracker was market-refreshed on September 18, 2026 with regular-session closes for all six tracked recovery names. Figures change with scheduled refreshes. Drag to orbit, scroll or pinch to travel, select a company beacon, or use free flight with W/A/S/D and Q/E. Touch devices have hold-to-move controls. Eight destinations connect each company to a detailed brief, price history, financials, filings, catalysts, risks, macro context and sources. A guided flight visits the destinations. Reading view provides the same native evidence without WebGL.

- Public snapshots cover 151 stock/ETF hubs in `data/open-research/index.json`, with up to nine disclosed quarters, four annual periods, 16 filings, 420 daily bars and news. The SEC directory adds more than 10,000 searchable securities; directory inclusion does not imply a detailed snapshot exists. Dates and coverage vary, including sparse company statements for funds.
- Free collection uses SEC company facts/submissions, Federal Reserve and BLS releases, Treasury curves and FRED series, plus dated market-source fallbacks. An authorized Stooq EOD adapter is available when `STOOQ_API_KEY` is configured; legacy Yahoo/Nasdaq ingestion remains paused unless explicitly approved. `scripts/refresh_open_research.py` throttles SEC requests, retains per-metric provenance and preserves previously collected records on provider errors. SEC data is fetched outside the browser because its API does not support browser CORS.
- `.github/workflows/public-research.yml` collects public snapshots on weekdays and supports manual dispatch. The app reads fresh public repository JSON with a same-origin snapshot fallback, so scheduled data updates do not depend on a new Pages build. Source failures do not erase prior evidence. These are dated records, not a real-time trading feed.
- Quarterly and annual financials remain separate. Cash flow reported year to date retains that scope; free cash flow requires matching operating-cash-flow and capital-expenditure periods. The collector does not invent fourth-quarter share counts.
- Briefs are calculated and written from loaded evidence. They are not fresh AI web searches. Uncached tickers open an explicitly limited source workspace; an optional configured research API can supply additional stock bundles.
- Search does not mutate `data/recovery-os.json` or promote a ticker. Original discovery history, qualification and performance accounting are preserved.
- The Recovery tracker stores its own market-refresh timestamp separately from the last full thesis scan. Price refreshes may update latest close, recent price series, 52-week-low distance, and current alerts without rewriting discovery price or prior events.
- Research notes, favorites, source bookmarks, comparisons, lists and assessment snapshots use the existing device storage. Optional remote state integration remains available.
- Source URLs, quarter alignment, missing values, indicator formulas and the canonical tracker boundary are checked by `node tests/research-model.test.cjs`.
- Rapid Enter, stale suggestions and asynchronous query changes are checked by `node tests/research-search.test.cjs`.
- `tests/responsive.html` is a manual browser fixture for desktop, tablet and 430/390/320 pixel layouts. It does not modify the tracker.

`market-world.js` owns the full-screen application world; `market-atlas.js` loads only the selected ticker shard and merges compatible source-backed evidence; `world-renderer.js` supplies a perspective canvas fallback when WebGL is unavailable. `research-model.js` contains evidence-based analysis; `free-hybrid.js` owns routing; `research-evidence.js` assembles source-backed reading chapters; `research-universe.js` and `research-universe.css` provide 3D navigation and responsive panels. Three.js is self-hosted under its included MIT license. Pixel ratio and animation frequency are capped; hidden tabs pause rendering and reduced-motion preferences disable idle animation. Native data and public links replace embedded market widgets in the main research flow.

Run `node tests/research-evidence.test.cjs` and `python -m unittest discover -s tests -p 'test_public_research.py'` for public-data integrity, synthesis and period-normalization checks, alongside the model/search checks above.

The atlas is collected by `scripts/build_market_atlas.py` using Nasdaq public screener records and SEC XBRL frames. The collector retains prior evidence during source failures. Financial merges preserve exact dates, units and field-specific filing links, and recalculate ratios after filling compatible fields. Unknown or unsupported metrics lead to original sources; they are never replaced by invented observations. Run `node tests/market-atlas.test.cjs` and `python -m unittest discover -s tests -p "test_market_atlas.py"` for atlas integrity.
