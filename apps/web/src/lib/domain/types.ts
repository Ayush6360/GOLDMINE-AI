/**
 * Core domain types for Phoenix.
 *
 * These types encode Phoenix's honesty invariants (ADR-0002):
 *  - A forecast is UNREPRESENTABLE without an uncertainty band + confidence.
 *  - A signal is UNREPRESENTABLE without explanatory drivers.
 * If it doesn't compile, we can't ship a naked guarantee.
 */

export type AssetId = "gold"; // widens to "silver" | "forex" | ... in Phase 4

export interface PricePoint {
  /** ISO date (UTC), day resolution for v0.1 */
  date: string;
  /** Close price in USD */
  close: number;
}

/** A snapshot of macro drivers relevant to gold. */
export interface MacroSnapshot {
  date: string;
  /** US Dollar Index. Inversely related to gold historically. */
  dxy: number;
  /** US 10y real yield (%). Rising real yields historically pressure gold. */
  realYield10y: number;
  /** Year-over-year CPI (%). */
  cpiYoY: number;
  /** Policy rate (%). */
  policyRate: number;
}

export type Direction = "up" | "down" | "neutral";

/** One explainable factor behind a signal or forecast. */
export interface Driver {
  label: string;
  /** Human-readable detail linking conclusion to data. */
  detail: string;
  /** -1..1 — sign is directional pressure on price, magnitude is strength. */
  weight: number;
}

/** An explainable, directional read. Never a guarantee. */
export interface Signal {
  key: string;
  title: string;
  direction: Direction;
  /** 0..1 */
  strength: number;
  drivers: Driver[];
}

/**
 * A probabilistic forecast. The band is mandatory (ADR-0002): there is no way to
 * construct a point prediction without an uncertainty range around it.
 */
export interface ForecastResult {
  asset: AssetId;
  horizonDays: number;
  /** Most-likely central estimate — always paired with the band below. */
  central: number;
  /** Lower/upper bounds of the stated confidence interval. */
  lower: number;
  upper: number;
  /** Interval coverage, e.g. 0.8 for an 80% band. */
  intervalCoverage: number;
  /** Model's self-assessed confidence 0..1 (data quality × signal agreement). */
  confidence: number;
  /** Probability the price is higher than today at the horizon (0..1). */
  probUp: number;
}

export interface AnalysisResult {
  asset: AssetId;
  asOf: string;
  spot: number;
  forecast: ForecastResult;
  signals: Signal[];
  /** Non-negotiable, travels with every payload (ADR-0002). */
  disclaimer: string;
  /** Provenance for auditability. */
  meta: {
    engine: string;
    engineVersion: string;
    dataPoints: number;
    generatedAt: string;
  };
}
