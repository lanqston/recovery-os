CREATE TABLE IF NOT EXISTS user_state (
  id TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS watches (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  metric TEXT NOT NULL,
  operator TEXT NOT NULL,
  value REAL NOT NULL,
  active INTEGER NOT NULL DEFAULT 0,
  frequency TEXT NOT NULL DEFAULT 'MANUAL',
  last_evaluated TEXT,
  last_value REAL,
  last_triggered TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_watches_active ON watches(active);
CREATE INDEX IF NOT EXISTS idx_watches_ticker ON watches(ticker);

-- Information Fabric is independent of the canonical recovery tracker.
CREATE TABLE IF NOT EXISTS fabric_cache(key TEXT PRIMARY KEY,payload TEXT NOT NULL,expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS fabric_usage(provider TEXT NOT NULL,bucket INTEGER NOT NULL,used INTEGER NOT NULL,PRIMARY KEY(provider,bucket));
CREATE TABLE IF NOT EXISTS fabric_provider_health(provider TEXT PRIMARY KEY,payload TEXT DEFAULT '{}',cooldown_until INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS fabric_snapshots(id TEXT PRIMARY KEY,security_id TEXT NOT NULL,ticker TEXT NOT NULL,observed_at TEXT NOT NULL,payload TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS fabric_snapshot_identity ON fabric_snapshots(security_id,observed_at);
CREATE INDEX IF NOT EXISTS fabric_snapshot_ticker ON fabric_snapshots(ticker,observed_at);
CREATE TABLE IF NOT EXISTS fabric_changes(id TEXT PRIMARY KEY,security_id TEXT NOT NULL,ticker TEXT NOT NULL,detected_at TEXT NOT NULL,payload TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS fabric_change_ticker ON fabric_changes(ticker,detected_at);
CREATE TABLE IF NOT EXISTS fabric_audit(id TEXT PRIMARY KEY,at TEXT NOT NULL,kind TEXT NOT NULL,payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS fabric_source_review(id TEXT PRIMARY KEY,at TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'REVIEW',payload TEXT NOT NULL);
CREATE TRIGGER IF NOT EXISTS fabric_snapshot_no_update BEFORE UPDATE ON fabric_snapshots BEGIN SELECT RAISE(ABORT,'Research snapshots are immutable'); END;
CREATE TRIGGER IF NOT EXISTS fabric_snapshot_no_delete BEFORE DELETE ON fabric_snapshots BEGIN SELECT RAISE(ABORT,'Research snapshots are immutable'); END;
CREATE TRIGGER IF NOT EXISTS fabric_changes_no_update BEFORE UPDATE ON fabric_changes BEGIN SELECT RAISE(ABORT,'Change observations are immutable'); END;
CREATE TRIGGER IF NOT EXISTS fabric_changes_no_delete BEFORE DELETE ON fabric_changes BEGIN SELECT RAISE(ABORT,'Change observations are immutable'); END;

CREATE TABLE IF NOT EXISTS fabric_events(id TEXT PRIMARY KEY,security_id TEXT NOT NULL,published_at TEXT,detected_at TEXT,payload TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS fabric_event_identity ON fabric_events(security_id,published_at);
CREATE TRIGGER IF NOT EXISTS fabric_events_no_update BEFORE UPDATE ON fabric_events BEGIN SELECT RAISE(ABORT,'Original evidence is immutable'); END;
CREATE TRIGGER IF NOT EXISTS fabric_events_no_delete BEFORE DELETE ON fabric_events BEGIN SELECT RAISE(ABORT,'Original evidence is immutable'); END;
