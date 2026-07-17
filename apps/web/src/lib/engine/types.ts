import type { AnalysisResult, AssetId, MacroSnapshot, PricePoint } from "@/lib/domain/types";

/** Optional market-sentiment input (gold-oriented, -1..1). */
export interface SentimentInput {
  net: number;
  scoredCount: number;
  bullishTop: Array<{ title: string }>;
  bearishTop: Array<{ title: string }>;
}

/**
 * The analysis seam (ADR-0001). The API depends only on this. Today it's backed by
 * the in-process TypeScript `BaselineEngine`; in Phase 2 an `HttpEngine` implements
 * the same interface by POSTing to the Python ml-service. The UI never notices.
 *
 * `sentiment` is OPTIONAL: the backtester runs without it (no historical news),
 * while the live forecast passes it in. This keeps the causal backtest honest.
 */
export interface IAnalysisEngine {
  readonly name: string;
  readonly version: string;
  analyze(input: {
    asset: AssetId;
    series: PricePoint[];
    macro: MacroSnapshot;
    horizonDays: number;
    sentiment?: SentimentInput;
  }): Promise<AnalysisResult>;
}
