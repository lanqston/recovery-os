# Recovery OS — public research atlas

The site opens directly into the navigable market world. Search covers more than 10,000 securities; dated Nasdaq snapshots and SEC financial records cover thousands. Prepared company and ETF worlds add longer price histories, filings and headlines.

## Collection and availability

- `scripts/refresh_open_research.py` collects SEC company facts/submissions, public Yahoo daily history and news, and official macro records.
- `scripts/build_market_atlas.py` collects the Nasdaq public screener and SEC XBRL frames into 64 ticker shards. Search loads the compact index; company research loads its shard on demand.
- The scheduled public research workflow refreshes both collections without API keys. The site refresh control can check repository records before falling back to the published snapshot.
- Every observation keeps its date and source. Provider collection time is not represented as an exchange timestamp. Prior evidence is retained during feed failures.
- Company periods and currencies must match before values are merged. Filled values retain their original filing links, and derived ratios use the merged observations. Funds are kept separate from corporate operating statements.
- Where a compatible figure or history is absent, company archives and market-source links provide a useful next step. No price history, financial statement, probability, news item or qualification is invented.

## Interaction and storage

The world supports orbit, zoom, keyboard/touch free flight, guided tours and an expanded reading panel. A perspective canvas fallback preserves navigation without WebGL. The workspace retains company favorites, notes, lists, comparisons and saved research on the current device.

`data/recovery-os.json` remains the canonical recovery tracker. General research never changes qualification or rewrites discovery history. Provider credentials never belong in the public repository. Optional configured research connections remain available through the existing integration.
