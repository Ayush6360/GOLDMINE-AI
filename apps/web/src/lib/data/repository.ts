import type { AssetId, MacroSnapshot, PricePoint } from "@/lib/domain/types";

/**
 * Data-source seam. The engine and API depend ONLY on these interfaces, never on
 * a concrete source. Swap seed → live feeds (metals API, FRED) → Postgres/Timescale
 * without touching anything downstream. (ADR-0001)
 */
export interface IPriceRepository {
  /** Ascending by date. */
  getSeries(asset: AssetId, days: number): Promise<PricePoint[]>;
  getLatest(asset: AssetId): Promise<PricePoint>;
}

export interface IMacroRepository {
  getLatest(): Promise<MacroSnapshot>;
}
