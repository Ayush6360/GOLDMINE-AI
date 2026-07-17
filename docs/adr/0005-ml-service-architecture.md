# ADR 0005 — ML Service Architecture

**Status:** Accepted · **Date:** 2026-07-17

## Context
Python 3.12 is now installed. Per ADR-0004, we may only ship an ML model if it beats
the honest TS baseline (56.0% next-day directional). We now build the real
`ml-service` whose `POST /v1/analyze` contract was defined back in v0.1.

## Decisions

### 1. Separate FastAPI service, not embedded.
The web app (Node) calls the Python service over HTTP behind `IAnalysisEngine`. This
is the first *justified* service split (ADR-0001): ML genuinely needs Python's
ecosystem (LightGBM, pandas). The seam already exists, so the UI never changes.
- *Trade-off:* an extra process + network hop. Worth it — the alternative (porting
  LightGBM to JS) is not real. Both run locally now; containerize later.

### 2. Model: LightGBM, gradient-boosted trees.
- **Direction:** binary classifier → calibrated P(up) for next day.
- **Bands:** two LightGBM quantile regressors (q0.1, q0.9) on next-day return →
  a genuine 80% predictive interval learned from data, not a vol formula.
- *Why LightGBM over deep learning:* on tabular, small-N financial features, GBMs
  beat neural nets and train in seconds. Deep learning would overfit ~500 rows.
  This is the honest, correct tool — not the fanciest-sounding one.

### 3. Anti-overfitting is the priority, not accuracy theater.
Daily gold ≈ random walk; it is trivial to overfit and fake a great backtest.
Guards: shallow trees (few leaves), strong regularization, early stopping, small
feature set, and — decisively — a **walk-forward backtest with the same causal
methodology as the TS one**. We compare ML vs the naive + always-up + TS baselines
on the same window. If ML doesn't win honestly, we say so and keep the baseline.

### 4. Feature parity with TS.
Python features mirror `features/indicators.ts` (returns, SMAs, momentum, vol,
z-score) so results are comparable and the two engines are interchangeable.

### 5. Graceful fallback stays intact.
If the ML service is down, the web app's `HttpEngine` falls back to the local
`BaselineEngine`. Degrade, don't crash (ADR-0003 principle) — the site never breaks
because Python is off.

### 6. Reproducibility.
Pinned `requirements.txt`, fixed random seeds, model + metadata persisted via joblib
with the training date, feature list, and backtest metrics baked in (auditability).

## Consequences
A real ML forecast that must earn its place against an honest baseline. Clean
service boundary that containerizes cleanly in Phase 2+. No accuracy inflation:
the walk-forward number is the number.

## RESULT (2026-07-17) — the model did NOT beat the baseline. We kept it honest.

Walk-forward, causal, on 504 real gold days (Yahoo GC=F):

| Horizon | ML (LightGBM) | Naive RW | Always-up | Outcome |
|---|---|---|---|---|
| 1-day  | 48.0% | 46.6% | **54.4%** | ML loses to always-up |
| 5-day  | 48.5% | 54.5% | 52.0% | ML loses to both |
| 10-day | 54.9% | 50.8% | 54.9% | ML ties always-up, beats naive |

**Decision: we do NOT present the ML model as "better".** The backtester's own verdict
said "keep the simple engine," and we're honoring it. This is the methodology working
exactly as designed (ADR-0004): had we scored on training data, the model would have
looked ~70%+ and we'd have shipped a fraud. We caught it.

**Why this is expected, not a bug:** daily gold is close to a random walk. The only
thing that "predicts" direction in this sample is gold's upward drift — which
"always-up" captures for free. No feature set on ~450 rows changes that.

**What we do with it:**
1. Keep the TS `BaselineEngine` as the default forecast (it's honest and its 56%
   comes from the same drift, transparently).
2. Keep the ML service built, wired, and running — behind an OPT-IN flag
   (`?engine=ml`), clearly labelled as experimental, NOT as "more accurate". The
   infrastructure is real and reusable the moment we have signal that genuinely
   predicts (e.g. an accumulated news/sentiment corpus, macro-surprise features,
   or multi-asset cross-signals).
3. The honest backtest metrics are baked into the model artifact and surfaced at
   `/health` — we never hide the number.

**The real lesson for the roadmap:** more accuracy will NOT come from a fancier model
on price-only features. It will come from *better data/features* (sentiment history,
macro surprises, positioning, cross-asset) — each of which must clear this same
walk-forward gate before it ships.
