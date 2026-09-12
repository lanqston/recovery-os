# RECOVERY // OS

RECOVERY // OS is a mobile-first crisis-to-recovery stock intelligence and tracking portal.

This repository is the canonical portal host and tracker bridge for the v2.0 Crisis-to-Recovery Swing Scanner.

The deployed baseline contains 4 qualified securities (STZ, DECK, NKE, ZTS), 2 provisional exception-review records (ENPH, ON), and a research queue (ADBE, PYPL). Provisional names remain explorable in the 3D world but are excluded from qualified counts/performance until formally qualified under v2.0.

## Connected research workspace

General Research opens the stock explorer from the home page or a recovery thesis. Every stock has a navigable research map: brief, price, financials, catalysts, risks and original sources. Mobile and desktop use the same native research content. TradingView modules load only when requested, one at a time, with an external chart link when embedding fails.

- Research snapshots cover AAPL plus 14 additional stocks/funds in `data/research/index.json`. Coverage and dates vary and are visible in each record.
- Briefs are calculated and written from loaded evidence. They are not fresh AI web searches. Uncached tickers open an explicitly limited source workspace; an optional configured research API can supply additional stock bundles.
- Search does not mutate `data/recovery-os.json` or promote a ticker. Original discovery history, qualification and performance accounting are preserved.
- Research notes, favorites, source bookmarks, comparisons, lists and assessment snapshots use the existing device storage. Optional remote state integration remains available.
- Source URLs, quarter alignment, missing values, indicator formulas and the canonical tracker boundary are checked by `node tests/research-model.test.cjs`.
- Rapid Enter, stale suggestions and asynchronous query changes are checked by `node tests/research-search.test.cjs`.
- `tests/responsive.html` is a manual browser fixture for desktop, tablet and 430/390/320 pixel layouts. It does not modify the tracker.

`research-model.js` contains evidence-based analysis; `free-hybrid.js` owns stock routing and the research workspace; `research-world.css` provides its responsive visual system. Existing explorer modules supply saved-state, financial table and optional research tools.
