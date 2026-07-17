import { config } from "@/lib/config";
import { SeedMacroRepository, SeedPriceRepository } from "@/lib/data/seed";
import { SqliteMacroRepository, SqlitePriceRepository } from "@/lib/data/cachedRepository";
import type { IMacroRepository, IPriceRepository } from "@/lib/data/repository";
import { BaselineEngine } from "@/lib/engine/baselineEngine";
import type { IAnalysisEngine } from "@/lib/engine/types";

/**
 * Composition root — the ONE place concrete implementations are chosen (ADR-0001).
 * `PHOENIX_LIVE_DATA=false` forces pure seed mode (e.g. offline/CI). Otherwise we
 * use SQLite-backed repos that themselves fall back to seed when empty.
 * Swapping the TS engine → Python HttpEngine later happens here and nowhere else.
 */
export const priceRepo: IPriceRepository = config.useLiveData
  ? new SqlitePriceRepository()
  : new SeedPriceRepository();

export const macroRepo: IMacroRepository = config.useLiveData
  ? new SqliteMacroRepository()
  : new SeedMacroRepository();

export const engine: IAnalysisEngine = new BaselineEngine();

/** Data mode surfaced to health/UI for provenance. */
export const dataMode = config.useLiveData ? "live+sqlite" : "seed";
