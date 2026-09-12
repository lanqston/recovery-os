# Information Fabric expansion — architecture before editing

Inspected September 12, 2026. Review base: `c647f3b`. GitHub main at inspection was `6aed6b206cc05bf99c306cb31453c25a8fb92975` (subsequent public-data refresh). No AGENTS.md was present in the checkout or its workspace parents. The scanner specification was recovered from the existing project files and its immutable-history and qualification rules remain in force.

## Existing application

- GitHub Pages static PWA: `index.html`, `app.js`, eleven legacy explorer scripts; no package manager or application build step.
- `free-hybrid.js` owns global research routing, deduplicated bundle promises, notes/watchlists and reader sections. `research-evidence.js` reads the public research cache. `market-atlas.js` loads a compact security directory and one of 64 shards per ticker, merging compatible financial periods.
- `market-world.js` extends `StockUniverse` from `research-universe.js`; locally hosted Three.js, capped pixel ratio, pooled company meshes, sector regions, perspective canvas fallback, touch flight and orbit controls. The complete world stays mounted while research panels change.
- `research-model.js` analyzes loaded bars and financial periods. `research-chart.js` supplies the native chart. Existing saved-work, screener, comparisons and notes must remain functional.
- `scripts/refresh_open_research.py` and `scripts/build_market_atlas.py` collect public snapshots; GitHub Actions runs refreshes. Source failures retain prior values, but health timestamps and provenance are inconsistent. Existing Yahoo chart/Nasdaq screener collection uses endpoints without an established redistribution agreement; no new integration will depend on those endpoints.
- The original Cloudflare reference backend was delivered separately in `recovery_os_stock_explorer_review_v1.zip`. Its Worker, schema and configuration have been restored verbatim before extension. Existing API contracts and private-state routes are retained.

## Protected boundary

`data/recovery-os.json` SHA-256 before work: `643623d97a6e5893cbbb6db81274def0c0a8ee8df766b8b3def4c0b6f80f5b19`.

General research, replay, health checks and automation have no write capability to this file. Research queue requests remain separate and require the existing scanner qualification process. No trade execution. No deployment or push to main during this review.

## Shared contracts and integration

`information-model.js` is a browser/Node-compatible pure module: company/security identity, category inventory, observations, source metadata, freshness, calculated-input lineage, evidence, conflicts, append-only events and point-in-time snapshots. UTC ISO timestamps are stored; America/New_York with timezone labels is used for display. Date-only publications are conservatively available after the entire named market day; no publication time is fabricated.

`information-store.js` uses IndexedDB for this-device research observations, visits, changes, reviews and annotations; optional server history uses append-only D1 tables. Imported historical facts retain original publication and retrieval dates. Historical adjusted prices are labeled as reconstructed rather than original tape. Identity includes issuer CIK and exchange/security, preventing issuer history from following a reused ticker.

`information-ui.js` connects coverage, changes, replay, source drawers, command filters and health controls to the existing world and rooms. `information-world.js` supplies market-driven visual layers, neutral unknown states, relationships with evidence, bounded performance and camera restoration.

Cloudflare adapters use the shared model, server secrets, bounded requests, persistent rate budgets, stale retention, structured failures and health records. Source discovery produces review candidates; code proposals stay in isolated branches with validation and no production credentials.

Historical score/stage/thesis are shown only after an actual recorded assessment. Current tracker values cannot be backfilled into earlier dates. Old observations and revisions are preserved. Calculations require aligned periods, currencies and units; missing inputs stay null.
