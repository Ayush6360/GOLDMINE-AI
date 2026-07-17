import { db } from "@/lib/data/db";
import { fetchCpiYoY, fetchLatest, FRED_SERIES } from "@/lib/data/sources/fred";
import { fetchDailyHistory, YAHOO_SYMBOLS } from "@/lib/data/sources/yahoo";
import { hasFred } from "@/lib/config";

/**
 * Ingestion service: pulls from external sources and persists to SQLite. This is
 * the ONLY writer. Idempotent via INSERT ... ON CONFLICT (upsert), so re-running is
 * safe. Records an audit row per run (observability). Failures are captured, not
 * thrown to the user — partial success is still success (ADR-0003).
 */

export interface IngestReport {
  startedAt: string;
  status: "ok" | "partial" | "failed";
  pricesUpserted: number;
  macroUpserted: number;
  errors: string[];
  usedFred: boolean;
}

export async function runIngestion(): Promise<IngestReport> {
  const startedAt = new Date().toISOString();
  const report: IngestReport = {
    startedAt,
    status: "ok",
    pricesUpserted: 0,
    macroUpserted: 0,
    errors: [],
    usedFred: hasFred(),
  };
  const database = db();

  // --- Prices: gold history (the core series) ---
  try {
    const bars = await fetchDailyHistory(YAHOO_SYMBOLS.gold, "2y");
    const stmt = database.prepare(
      `INSERT INTO prices (asset, date, close, source, fetched_at)
       VALUES (?, ?, ?, 'yahoo:GC=F', ?)
       ON CONFLICT(asset, date) DO UPDATE SET close = excluded.close, fetched_at = excluded.fetched_at`,
    );
    const tx = database.prepare("BEGIN");
    tx.run();
    for (const b of bars) {
      stmt.run("gold", b.date, b.close, startedAt);
      report.pricesUpserted++;
    }
    database.prepare("COMMIT").run();
  } catch (e) {
    database.prepare("ROLLBACK").run();
    report.errors.push(`prices:gold: ${msg(e)}`);
  }

  // --- Macro: keyless Yahoo indicators (latest value each) ---
  const yahooMacro: Array<[string, string]> = [
    ["dxy", YAHOO_SYMBOLS.dxy],
    ["us10y_nominal", YAHOO_SYMBOLS.us10y],
    ["oil_wti", YAHOO_SYMBOLS.oil],
    ["silver", YAHOO_SYMBOLS.silver],
  ];
  for (const [indicator, symbol] of yahooMacro) {
    try {
      const bars = await fetchDailyHistory(symbol, "5d");
      const last = bars[bars.length - 1];
      upsertMacro(indicator, last.date, adjustMacro(indicator, last.close), `yahoo:${symbol}`, startedAt);
      report.macroUpserted++;
    } catch (e) {
      report.errors.push(`macro:${indicator}: ${msg(e)}`);
    }
  }

  // --- Macro: FRED enhancements (optional) ---
  if (hasFred()) {
    try {
      const cpi = await fetchCpiYoY();
      if (cpi !== null) {
        upsertMacro("cpi_yoy", startedAt.slice(0, 10), cpi, "fred:CPIAUCSL", startedAt);
        report.macroUpserted++;
      }
      const real = await fetchLatest(FRED_SERIES.realYield10y);
      if (real) {
        upsertMacro("real_yield_10y", real.date, real.value, "fred:DFII10", startedAt);
        report.macroUpserted++;
      }
      const rate = await fetchLatest(FRED_SERIES.policyRate);
      if (rate) {
        upsertMacro("policy_rate", rate.date, rate.value, "fred:FEDFUNDS", startedAt);
        report.macroUpserted++;
      }
    } catch (e) {
      report.errors.push(`macro:fred: ${msg(e)}`);
    }
  }

  // Determine overall status.
  if (report.pricesUpserted === 0 && report.macroUpserted === 0) report.status = "failed";
  else if (report.errors.length > 0) report.status = "partial";

  database
    .prepare("INSERT INTO ingest_runs (started_at, status, detail) VALUES (?, ?, ?)")
    .run(startedAt, report.status, JSON.stringify({ ...report, errors: report.errors.slice(0, 10) }));

  return report;
}

/** ^TNX is quoted as yield×10 by Yahoo; normalize to a percentage. */
function adjustMacro(indicator: string, raw: number): number {
  if (indicator === "us10y_nominal") return Math.round((raw / 10) * 100) / 100;
  return raw;
}

function upsertMacro(indicator: string, date: string, value: number, source: string, fetchedAt: string): void {
  db()
    .prepare(
      `INSERT INTO macro (indicator, date, value, source, fetched_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(indicator, date) DO UPDATE SET value = excluded.value, fetched_at = excluded.fetched_at`,
    )
    .run(indicator, date, value, source, fetchedAt);
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
