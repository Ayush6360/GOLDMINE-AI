# ADR 0004 — Forecasting Honesty & Backtesting Methodology

**Status:** Accepted · **Date:** 2026-07-17

## Context
The founder wants next-day gold prediction that is "a little accurate," combining
real-time world events with historical + current data. Next-day price is close to a
random walk; the honest, valuable target is **directional accuracy modestly above a
coin flip (~52–56%)** plus calibrated probabilities and uncertainty bands — never a
guaranteed number. The dominant risk is *fooling ourselves* with lookahead bias.

## Decisions

### 1. Measure before we add. Every feature must earn its place.
No signal (events, sentiment, a new model) ships to the forecast unless it
**improves directional accuracy in an honest backtest** vs. the naive baseline. If
it doesn't help, we cut it. This is the core discipline.

### 2. Baseline = naive random walk ("tomorrow = today", i.e. direction = last move).
This is the bar. A model that can't beat it is worse than useless. We also report a
"always up" baseline (gold drifts up long-term) as a sanity check.

### 3. Walk-forward, strictly causal. No lookahead.
At each test day `t`, the engine may use ONLY data with date `< t` (or `<= t` for
"as of close today, predict tomorrow"). Features are recomputed from the trailing
window at each step. We never fit or normalize using future data. Any indicator
that peeks at the future is a bug, not a feature.

### 4. Metrics we report (honestly, all of them).
- **Directional hit rate** vs naive + vs always-up.
- **MAE / RMSE** of the central estimate (context, not the headline).
- **Band coverage**: does the stated 80% band actually contain the outcome ~80% of
  the time? (calibration — a wide band that's always right is honest; a tight band
  that's often wrong is a lie).
- **Sample size** and date range — small samples don't get to claim skill.

### 5. If accuracy ≈ 50%, we SAY SO.
The product still has value (probabilities, explanation, risk framing). We do not
inflate the number. A calibrated 51% with an honest band beats a fake 70%.

## Consequences
We get a real, measured accuracy number instead of a hope. Adding world-events
becomes a measurable experiment: run backtest → add events → re-run → keep only if
it helped. This is the scientific method applied to the product, and it is the only
path to being genuinely "a little accurate."
