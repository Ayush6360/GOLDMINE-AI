import type { AssetId, MacroSnapshot, PricePoint } from "@/lib/domain/types";
import type { IMacroRepository, IPriceRepository } from "./repository";

/**
 * Seed data source for v0.1. Generates a DETERMINISTIC pseudo-random-walk gold
 * series so the app is fully runnable offline and demos are reproducible.
 *
 * IMPORTANT: this is illustrative sample data, NOT live market data. It is clearly
 * labelled as such in the UI. Real adapters implement the same interfaces in Phase 1.
 */

/** Deterministic PRNG (mulberry32) — reproducible series, no external deps. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DAYS_MAX = 400;
const SEED = 20260717;

/** Build once at module load; day-resolution walk anchored near a plausible level. */
function buildSeries(): PricePoint[] {
  const rnd = mulberry32(SEED);
  const points: PricePoint[] = [];
  let price = 2650; // plausible anchor level for the sample series (USD/oz)
  const start = new Date(Date.UTC(2025, 0, 1));

  for (let i = 0; i < DAYS_MAX; i++) {
    // Gaussian-ish shock via sum of uniforms; gentle mean drift + mild momentum.
    const shock = (rnd() + rnd() + rnd() - 1.5) * 18;
    const drift = 0.15;
    price = Math.max(1500, price + drift + shock);
    const d = new Date(start.getTime() + i * 86400000);
    points.push({ date: d.toISOString().slice(0, 10), close: Math.round(price * 100) / 100 });
  }
  return points;
}

const SERIES = buildSeries();

export class SeedPriceRepository implements IPriceRepository {
  async getSeries(_asset: AssetId, days: number): Promise<PricePoint[]> {
    const n = Math.min(Math.max(days, 1), SERIES.length);
    return SERIES.slice(SERIES.length - n);
  }
  async getLatest(_asset: AssetId): Promise<PricePoint> {
    return SERIES[SERIES.length - 1];
  }
}

export class SeedMacroRepository implements IMacroRepository {
  async getLatest(): Promise<MacroSnapshot> {
    const latest = SERIES[SERIES.length - 1];
    // Static, plausible sample macro snapshot for illustration.
    return {
      date: latest.date,
      dxy: 104.2,
      realYield10y: 1.9,
      cpiYoY: 3.1,
      policyRate: 4.5,
    };
  }
}

/** Flag surfaced to the UI so users always know this is sample data. */
export const IS_SAMPLE_DATA = true;
