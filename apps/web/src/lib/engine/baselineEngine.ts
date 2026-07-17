import type {
  AnalysisResult,
  AssetId,
  Driver,
  ForecastResult,
  MacroSnapshot,
  PricePoint,
  Signal,
} from "@/lib/domain/types";
import { computeFeatures, type FeatureSet } from "@/lib/features/indicators";
import type { IAnalysisEngine } from "./types";

export const DISCLAIMER =
  "Phoenix provides probabilistic, informational analysis only. This is not " +
  "financial advice, not a recommendation, and not a guarantee. Markets are " +
  "uncertain; forecasts carry wide error bands. Do your own research.";

/**
 * BaselineEngine — a transparent, explainable baseline (NOT deep learning).
 *
 * Design intent (ADR-0002): produce an HONEST probabilistic read whose every
 * number is auditable. The forecast is a random-walk-with-drift band: drift comes
 * from blended momentum + macro tilt; the band width comes from realized
 * volatility scaled by horizon. This is deliberately simple and beatable — its job
 * is to be the baseline the Phase-2 ML models must outperform to justify their cost.
 */
export class BaselineEngine implements IAnalysisEngine {
  readonly name = "baseline-ts";
  readonly version = "0.1.0";

  async analyze(input: {
    asset: AssetId;
    series: PricePoint[];
    macro: MacroSnapshot;
    horizonDays: number;
  }): Promise<AnalysisResult> {
    const { asset, series, macro, horizonDays } = input;
    const f = computeFeatures(series);

    const signals = this.buildSignals(f, macro);
    const forecast = this.buildForecast(asset, f, signals, horizonDays);

    return {
      asset,
      asOf: series[series.length - 1].date,
      spot: f.spot,
      forecast,
      signals,
      disclaimer: DISCLAIMER,
      meta: {
        engine: this.name,
        engineVersion: this.version,
        dataPoints: series.length,
        // Provenance timestamp; injected by caller-agnostic Date at request time.
        generatedAt: new Date().toISOString(),
      },
    };
  }

  /** Explainable signals — each carries the drivers that produced it (ADR-0002). */
  private buildSignals(f: FeatureSet, macro: MacroSnapshot): Signal[] {
    const signals: Signal[] = [];

    // 1) Trend signal from SMA structure.
    if (f.sma20 !== null && f.sma50 !== null) {
      const spread = (f.sma20 - f.sma50) / f.sma50;
      const dir = spread > 0.002 ? "up" : spread < -0.002 ? "down" : "neutral";
      signals.push({
        key: "trend",
        title: "Trend structure (SMA20 vs SMA50)",
        direction: dir,
        strength: clamp01(Math.abs(spread) * 25),
        drivers: [
          {
            label: "SMA20 vs SMA50",
            detail: `20-day avg ${fmt(f.sma20)} vs 50-day avg ${fmt(f.sma50)} (${pct(spread)}).`,
            weight: clampSigned(spread * 25),
          },
        ],
      });
    }

    // 2) Momentum signal.
    if (f.mom20 !== null) {
      const dir = f.mom20 > 0.005 ? "up" : f.mom20 < -0.005 ? "down" : "neutral";
      signals.push({
        key: "momentum",
        title: "Price momentum (20-day)",
        direction: dir,
        strength: clamp01(Math.abs(f.mom20) * 8),
        drivers: [
          {
            label: "20-day return",
            detail: `Price is ${pct(f.mom20)} vs 20 sessions ago.`,
            weight: clampSigned(f.mom20 * 8),
          },
        ],
      });
    }

    // 3) Macro tilt — the classic gold drivers, directionally encoded.
    const macroDrivers: Driver[] = [
      {
        label: "US real yields",
        detail: `10y real yield ${macro.realYield10y}%. Higher real yields historically pressure gold (lower it).`,
        weight: clampSigned(-(macro.realYield10y - 1.0) * 0.15),
      },
      {
        label: "US dollar (DXY)",
        detail: `DXY ${macro.dxy}. A stronger dollar is historically associated with softer gold.`,
        weight: clampSigned(-(macro.dxy - 100) * 0.02),
      },
      {
        label: "Inflation (CPI YoY)",
        detail: `CPI ${macro.cpiYoY}% YoY. Elevated inflation is historically associated with gold demand.`,
        weight: clampSigned((macro.cpiYoY - 2.0) * 0.1),
      },
    ];
    const macroNet = macroDrivers.reduce((a, d) => a + d.weight, 0);
    signals.push({
      key: "macro",
      title: "Macro backdrop",
      direction: macroNet > 0.05 ? "up" : macroNet < -0.05 ? "down" : "neutral",
      strength: clamp01(Math.abs(macroNet)),
      drivers: macroDrivers,
    });

    // 4) Mean-reversion caution from stretch (z-score).
    if (f.zScore50 !== null && Math.abs(f.zScore50) > 1) {
      const stretched = f.zScore50 > 0;
      signals.push({
        key: "stretch",
        title: "Valuation stretch (50-day z-score)",
        direction: stretched ? "down" : "up",
        strength: clamp01((Math.abs(f.zScore50) - 1) * 0.5),
        drivers: [
          {
            label: "50-day z-score",
            detail: `Price is ${f.zScore50.toFixed(2)}σ ${stretched ? "above" : "below"} its 50-day mean; extremes historically tend to mean-revert.`,
            weight: clampSigned(-f.zScore50 * 0.1),
          },
        ],
      });
    }

    return signals;
  }

  /**
   * Random-walk-with-drift band forecast.
   * drift  = blend of momentum + macro tilt, capped to a sane per-horizon move.
   * band   = realized daily vol × sqrt(horizon) → 80% interval via ~1.28σ.
   */
  private buildForecast(
    asset: AssetId,
    f: FeatureSet,
    signals: Signal[],
    horizonDays: number,
  ): ForecastResult {
    const spot = f.spot;

    // Net directional tilt from all signals, weighted by strength.
    const netTilt = signals.reduce((acc, s) => {
      const sign = s.direction === "up" ? 1 : s.direction === "down" ? -1 : 0;
      return acc + sign * s.strength;
    }, 0);

    // Daily drift: small, driven by tilt; capped so we never imply a big sure move.
    const dailyDrift = clamp(netTilt * 0.0006, -0.0015, 0.0015);
    const centralReturn = dailyDrift * horizonDays;
    const central = spot * (1 + centralReturn);

    // Uncertainty: realized daily vol scaled by sqrt(time). 80% band ≈ 1.2816σ.
    const horizonVol = f.dailyVol * Math.sqrt(horizonDays);
    const z80 = 1.2816;
    const lower = spot * (1 + centralReturn - z80 * horizonVol);
    const upper = spot * (1 + centralReturn + z80 * horizonVol);

    // Confidence: HIGH signal agreement + LOW vol → higher confidence, but capped.
    // Deliberately never high — honesty over false precision.
    const agreement = signalAgreement(signals);
    const volPenalty = clamp01(horizonVol * 6);
    const confidence = clamp(0.25 + 0.4 * agreement - 0.3 * volPenalty, 0.05, 0.7);

    // Prob(up): logistic on standardized drift.
    const probUp = clamp01(0.5 + centralReturn / (2 * horizonVol + 1e-9) / 2);

    const result: ForecastResult = {
      asset,
      horizonDays,
      central: round2(central),
      lower: round2(lower),
      upper: round2(upper),
      intervalCoverage: 0.8,
      confidence: round2(confidence),
      probUp: round2(probUp),
    };
    return result;
  }
}

/** Fraction of signals pointing the same way as the net direction (0..1). */
function signalAgreement(signals: Signal[]): number {
  const directional = signals.filter((s) => s.direction !== "neutral");
  if (directional.length === 0) return 0;
  const ups = directional.filter((s) => s.direction === "up").length;
  const downs = directional.length - ups;
  return Math.abs(ups - downs) / directional.length;
}

// --- small helpers ---
function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}
function clamp01(x: number): number {
  return clamp(x, 0, 1);
}
function clampSigned(x: number): number {
  return clamp(x, -1, 1);
}
function round2(x: number): number {
  return Math.round(x * 100) / 100;
}
function fmt(x: number): string {
  return `$${x.toFixed(2)}`;
}
function pct(x: number): string {
  return `${(x * 100).toFixed(2)}%`;
}
