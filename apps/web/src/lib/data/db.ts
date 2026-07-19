import { createClient, type Client, type InArgs } from "@libsql/client";
import { config } from "@/lib/config";

/**
 * Persistence via libSQL (@libsql/client). SQLite-compatible SQL, but the driver is
 * ASYNC and works both locally (a file) and on serverless hosts like Vercel (Turso
 * over HTTP — no persistent disk needed). This is why the storage layer is async.
 *
 * If TURSO_DATABASE_URL is set we talk to hosted Turso; otherwise we open a local
 * file (`file:<dbPath>`) so local dev needs zero setup. Behind repositories, so
 * swapping stores later touches only this layer.
 *
 * Schema is intentionally minimal and asset-generic (supports Phase-4 multi-asset).
 */

let _client: Client | null = null;
let _ready: Promise<Client> | null = null;

function makeClient(): Client {
  if (config.tursoUrl) {
    return createClient({ url: config.tursoUrl, authToken: config.tursoAuthToken });
  }
  // Local fallback: a plain SQLite file, opened via libSQL's file: URL scheme.
  return createClient({ url: `file:${config.dbPath}` });
}

/** Get the initialized client (runs migrations once). Await before any query. */
export async function db(): Promise<Client> {
  if (_client) return _client;
  if (!_ready) {
    _ready = (async () => {
      const client = makeClient();
      await migrate(client);
      _client = client;
      return client;
    })();
  }
  return _ready;
}

/** Run a query and return all rows as plain objects. */
export async function dbAll<T = Record<string, unknown>>(sql: string, args: InArgs = []): Promise<T[]> {
  const client = await db();
  const res = await client.execute({ sql, args });
  return res.rows as unknown as T[];
}

/** Run a query and return the first row, or undefined. */
export async function dbGet<T = Record<string, unknown>>(sql: string, args: InArgs = []): Promise<T | undefined> {
  const rows = await dbAll<T>(sql, args);
  return rows[0];
}

/** Execute a write; returns rowsAffected + lastInsertRowid. */
export async function dbRun(
  sql: string,
  args: InArgs = [],
): Promise<{ changes: number; lastInsertRowid: number | null }> {
  const client = await db();
  const res = await client.execute({ sql, args });
  return {
    changes: Number(res.rowsAffected),
    lastInsertRowid: res.lastInsertRowid != null ? Number(res.lastInsertRowid) : null,
  };
}

/** Execute several writes atomically (transaction). */
export async function dbBatch(stmts: Array<{ sql: string; args?: InArgs }>): Promise<void> {
  const client = await db();
  await client.batch(
    stmts.map((s) => ({ sql: s.sql, args: s.args ?? [] })),
    "write",
  );
}

async function migrate(client: Client): Promise<void> {
  await client.batch(
    [
      // Daily price bars, keyed by (asset, date). Provenance stored for auditability.
      `CREATE TABLE IF NOT EXISTS prices (
        asset      TEXT NOT NULL,
        date       TEXT NOT NULL,
        close      REAL NOT NULL,
        source     TEXT NOT NULL,
        fetched_at TEXT NOT NULL,
        PRIMARY KEY (asset, date)
      );`,
      // Macro indicators as a long/tidy table: one row per (indicator, date).
      `CREATE TABLE IF NOT EXISTS macro (
        indicator  TEXT NOT NULL,
        date       TEXT NOT NULL,
        value      REAL NOT NULL,
        source     TEXT NOT NULL,
        fetched_at TEXT NOT NULL,
        PRIMARY KEY (indicator, date)
      );`,
      // Ingestion audit log — every run recorded (observability from day one).
      `CREATE TABLE IF NOT EXISTS ingest_runs (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        started_at TEXT NOT NULL,
        status     TEXT NOT NULL,
        detail     TEXT
      );`,
      // News headlines archive — grows over time so we can eventually backtest
      // sentiment (ADR-0004). Keyed by URL to dedupe across ingest runs.
      `CREATE TABLE IF NOT EXISTS news (
        url          TEXT PRIMARY KEY,
        title        TEXT NOT NULL,
        published_at TEXT NOT NULL,
        source       TEXT NOT NULL,
        score        REAL NOT NULL,
        fetched_at   TEXT NOT NULL
      );`,
      // User alerts (ADR-0007). Anonymous for v0.7; user_id reserved for auth later.
      `CREATE TABLE IF NOT EXISTS alerts (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id     TEXT,
        asset       TEXT NOT NULL DEFAULT 'gold',
        type        TEXT NOT NULL,
        threshold   REAL,
        currency    TEXT NOT NULL DEFAULT 'USD',
        state       TEXT NOT NULL DEFAULT 'armed',
        created_at  TEXT NOT NULL,
        last_value  REAL
      );`,
      // Log of alert firings — the feed a notifier (or the UI) reads.
      `CREATE TABLE IF NOT EXISTS triggered_alerts (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        alert_id     INTEGER NOT NULL,
        triggered_at TEXT NOT NULL,
        message      TEXT NOT NULL,
        value        REAL NOT NULL,
        FOREIGN KEY (alert_id) REFERENCES alerts(id) ON DELETE CASCADE
      );`,
    ],
    "write",
  );
}

/** Test/maintenance helper: reset the singleton (used by scripts). */
export function _resetDbForTest(): void {
  _client?.close();
  _client = null;
  _ready = null;
}
