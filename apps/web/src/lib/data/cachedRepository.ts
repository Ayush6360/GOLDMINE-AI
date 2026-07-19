import type { AssetId, MacroSnapshot, PricePoint } from "@/lib/domain/types";
import { dbGet, dbAll } from "@/lib/data/db";
import type { IMacroRepository, IPriceRepository } from "@/lib/data/repository";
import { SeedMacroRepository, SeedPriceRepository } from "@/lib/data/seed";

/**
 * Read-through repositories backed by libSQL, with graceful fallback to seed data
 * when the store is empty or errors (ADR-0003: degrade, don't crash). These are the
 * repos the app uses in live mode. Writing is done by the ingestion service.
 */

const seedPrices = new SeedPriceRepository();
const seedMacro = new SeedMacroRepository();

/**
 * Honest provenance (ADR-0002): reports whether the current gold series is real
 * ingested data or seed fallback, so the UI never mislabels sample data as live.
 */
export async function priceProvenance(
  asset: AssetId = "gold",
): Promise<{ live: boolean; source: string; asOf: string | null }> {
  try {
    const row = await dbGet<{ date: string; source: string }>(
      `SELECT date, source FROM prices WHERE asset = ? ORDER BY date DESC LIMIT 1`,
      [asset],
    );
    if (!row) return { live: false, source: "seed", asOf: null };
    return { live: true, source: row.source, asOf: row.date };
  } catch {
    return { live: false, source: "seed", asOf: null };
  }
}

/**
 * Latest USD/INR exchange rate from the macro store. Falls back to a recent
 * plausible level if not yet ingested (so INR view always renders). `live` tells the
 * UI whether the rate is real or a fallback — honest provenance (ADR-0002).
 */
export async function fxRateUsdInr(): Promise<{ rate: number; live: boolean; asOf: string | null }> {
  const FALLBACK = 96.0;
  try {
    const row = await dbGet<{ value: number; date: string }>(
      `SELECT value, date FROM macro WHERE indicator = 'usdinr' ORDER BY date DESC LIMIT 1`,
    );
    if (!row) return { rate: FALLBACK, live: false, asOf: null };
    return { rate: row.value, live: true, asOf: row.date };
  } catch {
    return { rate: FALLBACK, live: false, asOf: null };
  }
}

export class SqlitePriceRepository implements IPriceRepository {
  async getSeries(asset: AssetId, days: number): Promise<PricePoint[]> {
    try {
      const rows = await dbAll<{ date: string; close: number }>(
        `SELECT date, close FROM prices WHERE asset = ? ORDER BY date DESC LIMIT ?`,
        [asset, days],
      );
      if (rows.length === 0) return seedPrices.getSeries(asset, days); // not ingested yet
      return rows.reverse().map((r) => ({ date: r.date, close: r.close }));
    } catch {
      return seedPrices.getSeries(asset, days);
    }
  }

  async getLatest(asset: AssetId): Promise<PricePoint> {
    try {
      const row = await dbGet<{ date: string; close: number }>(
        `SELECT date, close FROM prices WHERE asset = ? ORDER BY date DESC LIMIT 1`,
        [asset],
      );
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
      const latest = async (indicator: string): Promise<number | null> => {
        const row = await dbGet<{ value: number }>(
          `SELECT value FROM macro WHERE indicator = ? ORDER BY date DESC LIMIT 1`,
          [indicator],
        );
        return row ? row.value : null;
      };

      const dxy = await latest("dxy");
      const nominal10y = await latest("us10y_nominal");
      const realYield = await latest("real_yield_10y"); // FRED (may be null)
      const cpi = await latest("cpi_yoy"); // FRED (may be null)
      const policy = await latest("policy_rate"); // FRED (may be null)

      // If we have no live macro at all, use the seed snapshot wholesale.
      if (dxy === null && nominal10y === null && realYield === null) {
        return seedMacro.getLatest();
      }

      const seed = await seedMacro.getLatest();
      const dateRow = await dbGet<{ date: string }>(
        `SELECT date FROM macro ORDER BY date DESC LIMIT 1`,
      );

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

/**
 * Honest macro provenance: for each macro field, report whether it comes from real
 * FRED data, a Yahoo feed, an approximation, or the seed fallback. Lets the UI show
 * users exactly which numbers are real vs derived (ADR-0002 honesty principle).
 */
export async function macroProvenance(): Promise<Record<string, { value: number | null; source: string }>> {
  const get = async (indicator: string): Promise<{ value: number; source: string; date: string } | null> => {
    try {
      const row = await dbGet<{ value: number; source: string; date: string }>(
        `SELECT value, source, date FROM macro WHERE indicator = ? ORDER BY date DESC LIMIT 1`,
        [indicator],
      );
      return row ?? null;
    } catch {
      return null;
    }
  };

  const dxy = await get("dxy");
  const nominal = await get("us10y_nominal");
  const realYield = await get("real_yield_10y");
  const cpi = await get("cpi_yoy");
  const policy = await get("policy_rate");

  return {
    dxy: dxy ? { value: dxy.value, source: dxy.source } : { value: null, source: "seed" },
    realYield10y: realYield
      ? { value: realYield.value, source: realYield.source } // real FRED DFII10
      : nominal && cpi
        ? { value: round2(nominal.value - cpi.value), source: "approx (nominal−CPI)" }
        : { value: null, source: "seed" },
    cpiYoY: cpi ? { value: cpi.value, source: cpi.source } : { value: null, source: "seed" },
    policyRate: policy ? { value: policy.value, source: policy.source } : { value: null, source: "seed" },
  };
}
