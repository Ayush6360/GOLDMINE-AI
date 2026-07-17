import type { AssetId, MacroSnapshot, PricePoint } from "@/lib/domain/types";
import { db } from "@/lib/data/db";
import type { IMacroRepository, IPriceRepository } from "@/lib/data/repository";
import { SeedMacroRepository, SeedPriceRepository } from "@/lib/data/seed";

/**
 * Read-through repositories backed by SQLite, with graceful fallback to seed data
 * when the store is empty or errors (ADR-0003: degrade, don't crash). These are the
 * repos the app uses in live mode. Writing is done by the ingestion service.
 */

const seedPrices = new SeedPriceRepository();
const seedMacro = new SeedMacroRepository();

/**
 * Honest provenance (ADR-0002): reports whether the current gold series is real
 * ingested data or seed fallback, so the UI never mislabels sample data as live.
 */
export function priceProvenance(asset: AssetId = "gold"): { live: boolean; source: string; asOf: string | null } {
  try {
    const row = db()
      .prepare(`SELECT date, source FROM prices WHERE asset = ? ORDER BY date DESC LIMIT 1`)
      .get(asset) as { date: string; source: string } | undefined;
    if (!row) return { live: false, source: "seed", asOf: null };
    return { live: true, source: row.source, asOf: row.date };
  } catch {
    return { live: false, source: "seed", asOf: null };
  }
}

export class SqlitePriceRepository implements IPriceRepository {
  async getSeries(asset: AssetId, days: number): Promise<PricePoint[]> {
    try {
      const rows = db()
        .prepare(
          `SELECT date, close FROM prices WHERE asset = ? ORDER BY date DESC LIMIT ?`,
        )
        .all(asset, days) as Array<{ date: string; close: number }>;
      if (rows.length === 0) return seedPrices.getSeries(asset, days); // not ingested yet
      return rows.reverse().map((r) => ({ date: r.date, close: r.close }));
    } catch {
      return seedPrices.getSeries(asset, days);
    }
  }

  async getLatest(asset: AssetId): Promise<PricePoint> {
    try {
      const row = db()
        .prepare(`SELECT date, close FROM prices WHERE asset = ? ORDER BY date DESC LIMIT 1`)
        .get(asset) as { date: string; close: number } | undefined;
      if (!row) return seedPrices.getLatest(asset);
      return { date: row.date, close: row.close };
    } catch {
      return seedPrices.getLatest(asset);
    }
  }
}

export class SqliteMacroRepository implements IMacroRepository {
  async getLatest(): Promise<MacroSnapshot> {
    try {
      const latest = (indicator: string): number | null => {
        const row = db()
          .prepare(`SELECT value FROM macro WHERE indicator = ? ORDER BY date DESC LIMIT 1`)
          .get(indicator) as { value: number } | undefined;
        return row ? row.value : null;
      };

      const dxy = latest("dxy");
      const nominal10y = latest("us10y_nominal");
      const realYield = latest("real_yield_10y"); // FRED (may be null)
      const cpi = latest("cpi_yoy"); // FRED (may be null)
      const policy = latest("policy_rate"); // FRED (may be null)

      // If we have no live macro at all, use the seed snapshot wholesale.
      if (dxy === null && nominal10y === null && realYield === null) {
        return seedMacro.getLatest();
      }

      const seed = await seedMacro.getLatest();
      const dateRow = db()
        .prepare(`SELECT date FROM macro ORDER BY date DESC LIMIT 1`)
        .get() as { date: string } | undefined;

      // Approximate real yield from nominal − CPI when FRED's real series is absent.
      const realYield10y =
        realYield ??
        (nominal10y !== null && cpi !== null ? round2(nominal10y - cpi) : seed.realYield10y);

      return {
        date: dateRow?.date ?? seed.date,
        dxy: dxy ?? seed.dxy,
        realYield10y,
        cpiYoY: cpi ?? seed.cpiYoY,
        policyRate: policy ?? seed.policyRate,
      };
    } catch {
      return seedMacro.getLatest();
    }
  }
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}
