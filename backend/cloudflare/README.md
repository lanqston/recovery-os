# Recovery OS Research API — Cloudflare Worker

This backend keeps market-data credentials out of the public GitHub Pages application.

## Required secrets

```bash
npx wrangler secret put MASSIVE_API_KEY
npx wrangler secret put RECOVERY_CLIENT_TOKEN
npx wrangler secret put SEC_USER_AGENT
```

Do not place any of these values in `wrangler.toml`, frontend JavaScript, GitHub Pages files, issues, or screenshots.

## Optional D1 saved-state database

```bash
npx wrangler d1 create recovery-os-research
# Copy the returned database_id into a local wrangler.toml based on wrangler.toml.example
npx wrangler d1 execute recovery-os-research --remote --file=./schema.sql
```

Then deploy:

```bash
npx wrangler deploy
```

Test:

```text
GET https://YOUR-WORKER.workers.dev/api/health
GET https://YOUR-WORKER.workers.dev/api/search?q=apple
GET https://YOUR-WORKER.workers.dev/api/stock/AAPL
```

## Caching / retries

Provider GETs use Cloudflare cache with endpoint-specific TTLs. 429 and transient 5xx provider errors are retried a small number of times. The frontend retains explicit empty/error/entitlement states rather than manufacturing values.

## Watch monitoring

`WATCH_MONITORING_ENABLED` defaults to `false`. Conditions are then stored but not actively monitored. Only enable a cron after verifying the quote endpoint and desired entitlement. Example cron is commented out in `wrangler.toml.example`.

## Important boundary

This Worker has no route that writes `data/recovery-os.json`. It is a general-research service only.

## Information Fabric expansion (review branch)

The original Worker routes remain available. The new read-only routes are:

- `GET /api/information/stock/:ticker`: resolve CIK, load SEC submissions/company facts, optionally load an approved daily price adapter, record a research snapshot.
- `GET /api/information/snapshots/:ticker` and `/changes/:ticker`: last 100 observations, with immutable original evidence.
- `GET /api/information/health`: durable provider status, last success/attempt, cooldown and structured error.

D1 is now required for network adapters so quotas work across Worker instances. Apply the additive, idempotent `schema.sql` migration to a **review database first**. Existing user state/watch tables are preserved. `fabric_events`, `fabric_snapshots` and `fabric_changes` reject updates and deletions. Snapshots reference shared event identities instead of copying events into every stored snapshot.

SEC does not need a key, but it does need an identifying `SEC_USER_AGENT`. Massive and Alpha Vantage require their own server-side keys and applicable usage grants. Alpha Vantage also requires `ALPHA_VANTAGE_APPROVED=true`; it is disabled by default. No new credentials or Cloudflare binding have been configured in this build.

The reliability layer replaces the original cache behavior with durable D1 cache and usage buckets, isolate-local singleflight deduplication, allowlisted hosts, size/identity/schema checks and redacted errors. It honors 429 cooldowns, backs off 403 access failures for an hour and retries transient 5xx at most twice. It retains a last verified record with its original timestamp if refresh fails. No arbitrary source URL can be proxied through this service.

`INFORMATION_MONITORING_ENABLED` defaults to false. When enabled after review, each scheduled invocation refreshes at most three recently observed companies within provider budgets, appends real differences and records failures. This does not qualify securities or alter the recovery tracker. The browser works from existing source caches and device history while the Worker is unconfigured.

For local validation, run `python3 scripts/validate_information.py` from the repository root. The production commands above belong to the original backend documentation; **do not execute production migrations or deployment until the finished review build is approved**.
