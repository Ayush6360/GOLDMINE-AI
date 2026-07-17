import type { PricePoint } from "@/lib/domain/types";

/**
 * Pure, dependency-free indicator functions. These are the "features" the engine
 * reasons over. Kept pure so they are trivially unit-testable and reusable by the
 * future Python service's parity tests.
 */

export function closes(series: PricePoint[]): number[] {
  return series.map((p) => p.close);
}

/** Simple daily log-ish returns (arithmetic, sufficient for v0.1). */
export function dailyReturns(values: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < values.length; i++) {
    out.push((values[i] - values[i - 1]) / values[i - 1]);
  }
  return out;
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((a, b) => a + (b - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

export function sma(values: number[], window: number): number | null {
  if (values.length < window || window <= 0) return null;
  return mean(values.slice(values.length - window));
}

/** Annualized volatility from daily returns (~252 trading days). */
export function annualizedVol(returns: number[]): number {
  return stdDev(returns) * Math.sqrt(252);
}

/** Momentum: total return over the last `window` points. */
export function momentum(values: number[], window: number): number | null {
  if (values.length <= window) return null;
  const past = values[values.length - 1 - window];
  const now = values[values.length - 1];
  return (now - past) / past;
}

/** Z-score of the latest value vs a trailing window. */
export function zScore(values: number[], window: number): number | null {
  if (values.length < window) return null;
  const slice = values.slice(values.length - window);
  const s = stdDev(slice);
  if (s === 0) return null;
  return (values[values.length - 1] - mean(slice)) / s;
}

export interface FeatureSet {
  spot: number;
  sma20: number | null;
  sma50: number | null;
  mom20: number | null;
  mom50: number | null;
  dailyVol: number;
  annualVol: number;
  zScore50: number | null;
  meanDailyReturn: number;
}

export function computeFeatures(series: PricePoint[]): FeatureSet {
  const c = closes(series);
  const rets = dailyReturns(c);
  return {
    spot: c[c.length - 1],
    sma20: sma(c, 20),
    sma50: sma(c, 50),
    mom20: momentum(c, 20),
    mom50: momentum(c, 50),
    dailyVol: stdDev(rets),
    annualVol: annualizedVol(rets),
    zScore50: zScore(c, 50),
    meanDailyReturn: mean(rets),
  };
}
