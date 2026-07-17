import type { AnalysisResult, AssetId, MacroSnapshot, PricePoint } from "@/lib/domain/types";

/**
 * The analysis seam (ADR-0001). The API depends only on this. Today it's backed by
 * the in-process TypeScript `BaselineEngine`; in Phase 2 an `HttpEngine` implements
 * the same interface by POSTing to the Python ml-service. The UI never notices.
 */
export interface IAnalysisEngine {
  readonly name: string;
  readonly version: string;
  analyze(input: {
    asset: AssetId;
    series: PricePoint[];
    macro: MacroSnapshot;
    horizonDays: number;
  }): Promise<AnalysisResult>;
}
