import { DatabaseSync } from "node:sqlite";
import { config } from "@/lib/config";

/**
 * SQLite persistence via node:sqlite (built into Node 24 — zero install, no native
 * build). Single connection, initialized once per process. Behind repositories, so
 * swapping to Postgres+TimescaleDB later touches only the repository layer.
 *
 * Schema is intentionally minimal and asset-generic (supports Phase-4 multi-asset).
 */

let _db: DatabaseSync | null = null;

export function db(): DatabaseSync {
  if (_db) return _db;
  const database = new DatabaseSync(config.dbPath);
  database.exec("PRAGMA journal_mode = WAL;");
  database.exec("PRAGMA foreign_keys = ON;");
  migrate(database);
  _db = database;
  return _db;
}

function migrate(database: DatabaseSync): void {
  // Daily price bars, keyed by (asset, date). Provenance stored for auditability.
  database.exec(`
    CREATE TABLE IF NOT EXISTS prices (
      asset      TEXT NOT NULL,
      date       TEXT NOT NULL,
      close      REAL NOT NULL,
      source     TEXT NOT NULL,
      fetched_at TEXT NOT NULL,
      PRIMARY KEY (asset, date)
    );
  `);

  // Macro indicators as a long/tidy table: one row per (indicator, date).
  database.exec(`
    CREATE TABLE IF NOT EXISTS macro (
      indicator  TEXT NOT NULL,
      date       TEXT NOT NULL,
      value      REAL NOT NULL,
      source     TEXT NOT NULL,
      fetched_at TEXT NOT NULL,
      PRIMARY KEY (indicator, date)
    );
  `);

  // Ingestion audit log — every run recorded (observability from day one).
  database.exec(`
    CREATE TABLE IF NOT EXISTS ingest_runs (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at TEXT NOT NULL,
      status     TEXT NOT NULL,
      detail     TEXT
    );
  `);
}

/** Test/maintenance helper: reset the singleton (used by scripts). */
export function _resetDbForTest(): void {
  _db?.close();
  _db = null;
}
