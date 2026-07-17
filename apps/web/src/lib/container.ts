import { SeedMacroRepository, SeedPriceRepository } from "@/lib/data/seed";
import type { IMacroRepository, IPriceRepository } from "@/lib/data/repository";
import { BaselineEngine } from "@/lib/engine/baselineEngine";
import type { IAnalysisEngine } from "@/lib/engine/types";

/**
 * Composition root — the ONE place concrete implementations are chosen. Swapping
 * seed → live adapters, or the TS engine → the Python HttpEngine, happens here and
 * nowhere else. Everything downstream depends on interfaces only. (ADR-0001)
 */
export const priceRepo: IPriceRepository = new SeedPriceRepository();
export const macroRepo: IMacroRepository = new SeedMacroRepository();
export const engine: IAnalysisEngine = new BaselineEngine();
