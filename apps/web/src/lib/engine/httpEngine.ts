import type { AnalysisResult, AssetId, MacroSnapshot, PricePoint } from "@/lib/domain/types";
import type { IAnalysisEngine, SentimentInput } from "./types";

/**
 * HttpEngine — calls the Python ML service (services/ml-service) behind the same
 * IAnalysisEngine interface as the local BaselineEngine (ADR-0001/0005). This is the
 * seam we designed in v0.1 finally being used.
 *
 * IMPORTANT (ADR-0005 RESULT): the ML model did NOT beat the honest baseline. So this
 * engine is OPT-IN and clearly experimental — it is NOT the default and is NOT
 * presented as "more accurate". If the service is down or errors, callers fall back
 * to the local baseline (degrade, don't crash).
 */
export class HttpEngine implements IAnalysisEngine {
  readonly name = "phoenix-ml-http";
  readonly version = "0.4.0";

  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs = 8000,
  ) {}

  async analyze(input: {
    asset: AssetId;
    series: PricePoint[];
    macro: MacroSnapshot;
    horizonDays: number;
    sentiment?: SentimentInput;
  }): Promise<AnalysisResult> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl}/v1/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asset: input.asset,
          series: input.series,
          macro: input.macro,
          horizonDays: input.horizonDays,
          sentiment: input.sentiment
            ? { net: input.sentiment.net, scoredCount: input.sentiment.scoredCount }
            : null,
        }),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`ml_http_${res.status}`);
      return (await res.json()) as AnalysisResult;
    } finally {
      clearTimeout(t);
    }
  }

  /** Is the ML service reachable + model loaded? */
  async health(): Promise<{ ok: boolean; modelLoaded: boolean; detail?: unknown }> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl}/health`, { signal: ctrl.signal });
      if (!res.ok) return { ok: false, modelLoaded: false };
      const j = (await res.json()) as { model_loaded?: boolean };
      return { ok: true, modelLoaded: Boolean(j.model_loaded), detail: j };
    } catch {
      return { ok: false, modelLoaded: false };
    } finally {
      clearTimeout(t);
    }
  }
}
