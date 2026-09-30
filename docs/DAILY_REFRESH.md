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

The Daily refresh panel reports component coverage and dates. **Partial** means at least one component could not supply current observations. The broad directory contains thousands of additional securities with older or unavailable data; 323 prepared dossiers are included. Directory entries are not a claim of current quote coverage.

## Retained limitations

- Daily historical OHLC requires an authorized feed. The Stooq adapter accepts the server-side `STOOQ_API_KEY` repository secret. Without it, saved chart bars retain their original dates and provenance.
- SEC may reject runner requests. Cooldowns and original evidence are retained; successful macro or quote collection does not claim fresh SEC filings.
- Verified issuer feeds currently cover AAPL, NVDA, MSFT, AMD, ENPH and ON. Other company news relies on SEC events and saved evidence. New adapters require a verified issuer feed and dated linked headlines.
- `data/recovery-os.json` is protected by a hash check. Discovery prices/dates, thesis scores, stage history, notes, watchlists and trading records are not rewritten by market collection.
- No future or present quote is inserted into historical replay. Quote and chart metadata are separate.

## Return verification and directional assessment (September 23)

The research reader, comparisons and loaded world dossiers use the same calendar-boundary calculation: end close divided by baseline close minus one. Week means seven calendar days and month means thirty; a non-trading boundary uses the preceding dated close, with a four-day tolerance. Exact measured dates are displayed. Provider daily percentages remain separately labeled because the quote feed does not provide a verified reference-session timestamp. They are never used to reconstruct weekly or monthly history.

When current-period endpoints cannot be verified, the movement reader preserves the latest dated quote and separately displays the last complete retained interval. This is labeled historical context, not the selected period or today's catalyst. The timeline keeps quote price/source and historical close price/source separate. Changing a period clears the prior output immediately, and request tokens prevent late results from overwriting the chosen period.

Each stock has one Bullish, Bearish or Neutral evidence assessment. The reader discloses every included signal and the heuristic weights. It combines qualifying period returns, matched proxy comparisons, recent price/50-day trend, explicit directional company headlines, and comparable year-over-year revenue/profit disclosures. Stale, future, incompatible and unobserved historical inputs do not vote. Coverage is separate from direction; a Neutral result with no qualifying inputs means insufficient evidence. Alternative scenarios are collapsed as supporting context and risks, and are not a second competing assessment. These heuristics are not a backtested prediction model.

Amazon's published RSS feed joins the daily issuer collection, with future-dated items withheld and prior headlines preserved. The original source is https://www.aboutamazon.com/rss/feed.rss, linked from https://www.aboutamazon.com/news. A successful collection is not a promise that every company has news that day.

Historical-price collection remains a known dependency: the configured Stooq adapter needs its server-side credential, while legacy unapproved collectors remain paused. NineQuantAI was examined as a potential keyless alternative; its terms prohibit systematically mirroring its market data (https://ninequantai.com/en/terms), so no public data mirror or collector was added. Netflix, Nike, Freeport and Meta IR returned 403 to direct discovery/collection; no bypass was attempted. The working Meta newsroom feed is retained. A daily scheduler cannot recreate absent historical observations.

## Gap repair (September 24 UTC)

The quote importer now accepts both structured tool responses and original string responses, including batch separators without newlines. Complete responses and their actual retrieval timestamps are retained in the dated archive's `collections`, alongside parsed observations. Batch collection avoids issuing one request per symbol. A missing individual result may be requested once separately unless the provider reports a cooldown.

The shared information model reads reported cash-flow durations separately from income-statement quarters, and falls back to dated annual disclosures when needed. It never labels year-to-date figures quarterly. Free cash flow still requires matching currency and reporting period, and every historical view checks publication and detection times. Legacy capex records from a different filing are excluded unless their publication date is recorded. Latest available cash-flow metrics may cover different periods; each keeps its own metadata.

Additional issuer feeds verified from the companies' RSS directories:
- Johnson & Johnson: https://www.jnj.com/rss -> https://www.jnj.com/rss-feed/all
- Broadcom: https://investors.broadcom.com/rss-feeds -> https://investors.broadcom.com/rss/news-releases.xml
- Lilly: https://investor.lilly.com/rss-news-feeds -> https://investor.lilly.com/rss/news-releases.xml?items=10
- Comcast: https://www.cmcsa.com/rss-feeds -> https://www.cmcsa.com/rss/news-releases.xml?items=15
- Verisign: https://investor.verisign.com/shareholder-services/rss-feeds/ -> https://investor.verisign.com/rss/news-releases.xml

The last two adapters activate when those dossiers are prepared; configuring a source does not add names to the recovery tracker. These sources return linked headlines, not full articles or verified price catalysts. Original dates, deduplication, retained history and host cooldowns still apply. S&P Global, Pfizer and Qualcomm returned HTTP 403 during discovery; they were not added or bypassed. Missing price history, options, short interest and consensus estimates remain unresolved; current quotes do not fill those datasets.

## UI and refresh repair (September 30)

Visible pages poll the lightweight publication manifest every 60 seconds and on resume. Only a changed revision or manual refresh reloads the datasets. These checks do not increase upstream quote collection frequency. Refresh retains the stock section, reader expansion, scroll, open disclosures and notes focus, and cannot overwrite a newer navigation or historical replay. Tracker controls are rebound after publication updates.

The Price page offers one on-demand official TradingView chart embed. Once loaded, the provider updates it at its permitted frequency. Exchange availability and delays remain visible inside the widget; the widget does not supply data to native calculations, quote files, or historical replay. Branding and the original chart link are retained. See https://www.tradingview.com/widget-docs/faq/data/ and https://www.tradingview.com/widget-docs/widgets/charts/advanced-chart/.

Barchart OnDemand was reviewed as a potential frequent quote feed. Its official product describes usage-based paid access (https://www.barchart.com/ondemand). No free production API entitlement or redistribution license is configured, so no Barchart collector, paid subscription or credentials were added. Free access to a website is not an API entitlement. Existing quote collection limitations above still apply.

## Quote recovery (September 30)

The connected daily task was found disabled and was re-enabled after a validated manual collection. The September 30 collection returned 322 of 323 requested symbols; BMNP returned no valid quote, and CCZ retained a September 25 trade timestamp. Publication success does not make either current. The source workflow and Pages deployment were verified after publication.

Stock search now opens the overview directly, and every research section repeats the company identity, quote and original trade time. The 3D world remains available through World and the close control.

Boeing's investor-published press release feed joins the existing scheduled issuer collector: https://investors.boeing.com/rss/pressrelease.aspx, linked from https://investors.boeing.com/investors/rss-feeds/default.aspx. Collection uses the existing timestamp checks, cache and cooldown policy. SEC runner access and licensed historical bars remain unresolved; no upstream permissions were changed.
