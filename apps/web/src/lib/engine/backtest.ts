import type { AssetId, MacroSnapshot, PricePoint } from "@/lib/domain/types";
import type { IAnalysisEngine } from "@/lib/engine/types";

/**
 * Walk-forward backtester — the honesty engine of Phoenix (ADR-0004).
 *
 * At each test day t, we hand the engine ONLY the price history strictly before the
 * outcome we're scoring. It predicts the next day's direction; we compare to what
 * actually happened. There is NO way for future data to leak in: we slice the array
 * up to t and pass that slice. This is what stops us fooling ourselves.
 *
 * We score the model against two baselines:
 *   - naive random walk: predict "same direction as the last move"
 *   - always-up: gold drifts up long-term; a hard baseline to beat on hit rate
 */

export interface BacktestConfig {
  asset: AssetId;
  /** How many of the most recent days to evaluate. */
  testDays: number;
  /** Minimum history the engine needs before its first prediction. */
  minTrain: number;
  /** Forecast horizon in days (1 = next day). */
  horizonDays: number;
}

export interface BacktestResult {
  asset: AssetId;
  horizonDays: number;
  samples: number;
  dateRange: { from: string; to: string };
  model: DirectionalScore & ErrorScore & { bandCoverage: number; bandTarget: number };
  baselineNaive: DirectionalScore;
  baselineAlwaysUp: DirectionalScore;
  /** Plain-language verdict — honest, never inflated. */
  verdict: string;
}

interface DirectionalScore {
  hitRate: number; // 0..1
  correct: number;
  total: number;
}
interface ErrorScore {
  mae: number; // mean absolute error of central estimate ($)
  rmse: number;
}

export async function backtest(
  engine: IAnalysisEngine,
  fullSeries: PricePoint[],
  macro: MacroSnapshot,
  cfg: BacktestConfig,
): Promise<BacktestResult> {
  const { asset, horizonDays } = cfg;
  const n = fullSeries.length;

  // Determine the evaluation window [start, end) of OUTCOME indices.
  // We predict series[i] using only series[0..i-1] (strictly causal).
  const firstOutcome = Math.max(cfg.minTrain, 1);
  const lastOutcome = n - 1; // last index we have a real outcome for
  const startOutcome = Math.max(firstOutcome, lastOutcome - cfg.testDays + 1);

  let modelCorrect = 0;
  let naiveCorrect = 0;
  let upCorrect = 0;
  let total = 0;
  let absErrSum = 0;
  let sqErrSum = 0;
  let bandHits = 0;
  let bandTarget = 0.8;

  for (let i = startOutcome; i <= lastOutcome; i++) {
    // History available to the model: everything strictly before the outcome day i,
    // ending at the "as of" day (i - horizonDays) ... for horizon 1 that's i-1.
    const asOfIdx = i - horizonDays;
    if (asOfIdx < cfg.minTrain - 1) continue;

    const history = fullSeries.slice(0, asOfIdx + 1); // inclusive of as-of day
    const asOfPrice = history[history.length - 1].close;
    const actual = fullSeries[i].close;
    const actualUp = actual >= asOfPrice;

    // --- Model prediction (only past data) ---
    const result = await engine.analyze({ asset, series: history, macro, horizonDays });
    const predUp = result.forecast.probUp >= 0.5;
    if (predUp === actualUp) modelCorrect++;

    // central-estimate error + band coverage (calibration)
    absErrSum += Math.abs(result.forecast.central - actual);
    sqErrSum += (result.forecast.central - actual) ** 2;
    bandTarget = result.forecast.intervalCoverage;
    if (actual >= result.forecast.lower && actual <= result.forecast.upper) bandHits++;

    // --- Baselines ---
    // naive: predict same direction as the last observed move
    if (history.length >= 2) {
      const prev = history[history.length - 2].close;
      const naiveUp = asOfPrice >= prev;
      if (naiveUp === actualUp) naiveCorrect++;
    }
    // always-up
    if (actualUp) upCorrect++;

    total++;
  }

  const model = {
    hitRate: safeDiv(modelCorrect, total),
    correct: modelCorrect,
    total,
    mae: round2(safeDiv(absErrSum, total)),
    rmse: round2(Math.sqrt(safeDiv(sqErrSum, total))),
    bandCoverage: round3(safeDiv(bandHits, total)),
    bandTarget,
  };

  const result: BacktestResult = {
    asset,
    horizonDays,
    samples: total,
    dateRange: {
      from: fullSeries[startOutcome]?.date ?? "n/a",
      to: fullSeries[lastOutcome]?.date ?? "n/a",
    },
    model,
    baselineNaive: { hitRate: safeDiv(naiveCorrect, total), correct: naiveCorrect, total },
    baselineAlwaysUp: { hitRate: safeDiv(upCorrect, total), correct: upCorrect, total },
    verdict: buildVerdict(model.hitRate, safeDiv(naiveCorrect, total), total, model.bandCoverage, bandTarget),
  };
  return result;
}

/** Honest, non-inflated plain-language read of the numbers (ADR-0004 §5). */
function buildVerdict(
  modelHit: number,
  naiveHit: number,
  samples: number,
  bandCov: number,
  bandTarget: number,
): string {
  const parts: string[] = [];
  const edge = modelHit - naiveHit;
  const pctM = (modelHit * 100).toFixed(1);
  const pctN = (naiveHit * 100).toFixed(1);

  if (samples < 60) {
    parts.push(`Only ${samples} samples — too few to claim skill; treat as indicative.`);
  }
  if (edge > 0.02) {
    parts.push(`Model direction ${pctM}% beats naive ${pctN}% by ${(edge * 100).toFixed(1)} pts — a genuine but modest edge.`);
  } else if (edge < -0.02) {
    parts.push(`Model ${pctM}% is BELOW naive ${pctN}% — the model is not adding directional value here. Honest result: don't trust the direction yet.`);
  } else {
    parts.push(`Model ${pctM}% ≈ naive ${pctN}% — essentially a coin flip, as expected for next-day gold. The value is in the probability + band, not the call.`);
  }

  const covGap = Math.abs(bandCov - bandTarget);
  if (covGap <= 0.1) {
    parts.push(`Band is well-calibrated (${(bandCov * 100).toFixed(0)}% actual vs ${(bandTarget * 100).toFixed(0)}% target).`);
  } else if (bandCov < bandTarget) {
    parts.push(`Band is too tight (${(bandCov * 100).toFixed(0)}% actual vs ${(bandTarget * 100).toFixed(0)}% target) — it overstates confidence.`);
  } else {
    parts.push(`Band is conservative (${(bandCov * 100).toFixed(0)}% actual vs ${(bandTarget * 100).toFixed(0)}% target) — wider than needed, but honest.`);
  }
  return parts.join(" ");
}

function safeDiv(a: number, b: number): number {
  return b === 0 ? 0 : a / b;
}
function round2(x: number): number {
  return Math.round(x * 100) / 100;
}
function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}
