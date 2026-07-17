import { config } from "@/lib/config";
import { SeedMacroRepository, SeedPriceRepository } from "@/lib/data/seed";
import { SqliteMacroRepository, SqlitePriceRepository } from "@/lib/data/cachedRepository";
import type { IMacroRepository, IPriceRepository } from "@/lib/data/repository";
import { BaselineEngine } from "@/lib/engine/baselineEngine";
import { HttpEngine } from "@/lib/engine/httpEngine";
import type { IAnalysisEngine } from "@/lib/engine/types";

/**
 * Composition root — the ONE place concrete implementations are chosen (ADR-0001).
 * `PHOENIX_LIVE_DATA=false` forces pure seed mode (e.g. offline/CI). Otherwise we
 * use SQLite-backed repos that themselves fall back to seed when empty.
 */
export const priceRepo: IPriceRepository = config.useLiveData
  ? new SqlitePriceRepository()
  : new SeedPriceRepository();

export const macroRepo: IMacroRepository = config.useLiveData
  ? new SqliteMacroRepository()
  : new SeedMacroRepository();

/** Default engine: the honest TS baseline (ADR-0005 — ML did NOT beat it). */
export const engine: IAnalysisEngine = new BaselineEngine();

/**
 * OPT-IN experimental ML engine (Python service). NOT the default and NOT presented
 * as "more accurate" — its walk-forward backtest lost to the baseline. Exposed so
 * callers can request `?engine=ml` and compare, with fallback handled by the caller.
 */
export const mlEngine = new HttpEngine(config.mlServiceUrl);

/** Data mode surfaced to health/UI for provenance. */
export const dataMode = config.useLiveData ? "live+sqlite" : "seed";
