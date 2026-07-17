# Changelog

All notable changes to Phoenix.

## [0.7.0] — 2026-07-17
### Added — Alerts engine + AI report generator (ADR-0007) — the sellable value layer
- **Alerts:** SQLite `alerts` + `triggered_alerts` tables; engine supports
  price_above / price_below / direction_flip, currency-aware (USD/oz + INR/10g),
  idempotent (fires once on cross, re-arms on reset — no spam). Evaluated on every
  ingest. API: `GET/POST/DELETE /api/alerts`.
- **Reports:** data-driven daily digest (`reportGenerator.ts`) — real figures
  (week/month move, next-day read with honest ~55% caveat, top signal, sentiment,
  macro) composed via deterministic templates; every number traces to data (no LLM
  hallucination). API: `GET /api/report?ccy=`.
- Dashboard: digest section + triggered-alerts feed.
- Verified: USD alert fired ("below $5,000 → $4,004"), INR alert fired
  ("above ₹1,20,000 → ₹1,23,958"), report renders in USD + INR.
### Why
- Accuracy is at its honest ceiling; the subscription sells on VALUE. Alerts drive
  daily re-engagement; reports are shareable. Zero accuracy inflation, zero new data
  cost — a packaging layer on existing intelligence (ADR-0007).

## [0.6.0] — 2026-07-17
### Added — Cross-asset features (honest edge experiment, ADR-0006)
- Multi-asset fetch (gold+DXY+silver+10y+oil), `cross_features.py`, experiment harness.
- Finding: cross-asset lifts 1d 48.5%→56.5% but only +2pts vs baseline and edge flips
  to ~0 on window shift — real but marginal. Shipped honestly, not oversold.

## [0.5.0] — 2026-07-17
### Added — USD + INR currency support
- USD/INR FX ingested from Yahoo (`USDINR=X`, keyless), stored in SQLite macro table.
- Currency conversion util (`lib/currency.ts`): USD/oz → INR per 10g using the exact
  troy-ounce constant (31.1034768 g); one place for the math.
- Dashboard currency toggle (USD /oz ↔ INR /10g) via `?ccy=` URL param; all displayed
  prices (spot, next-day range, forecast band) convert correctly. INR shown in the
  Indian ₹/10g convention with a live/fallback FX label.
- Analysis API returns a `currency` block (usdInr rate + INR/10g spot/central/band).
- Verified conversion math: $3,997.10/oz × 96.27 ÷ 31.1035 × 10 = ₹123,716/10g (exact).
### Changed
- Accuracy framing corrected across UI to the honest ~54–56% (was optimistically 56%);
  copy now states this is near the ceiling for price-history alone.

## [0.4.0] — 2026-07-17
### Added — real Python ML service (ADR-0005)
- **Python 3.12 installed** (winget). `services/ml-service`: FastAPI + LightGBM.
- Feature engineering (`features.py`) with parity to the TS indicators + RSI, band
  distances; strictly causal.
- **LightGBM model** (`model.py`): direction classifier + two quantile regressors
  for a learned 80% band; conservative hyperparameters to resist overfitting; genuine
  per-feature log-odds explainability (LightGBM pred_contrib).
- **Walk-forward backtester** (`backtest.py`): same causal methodology as the TS one;
  retrains on expanding past-only windows; scores vs naive + always-up.
- `POST /v1/analyze` + `GET /health` (publishes the honest backtest verdict).
- `HttpEngine` in the web app calls the service behind `IAnalysisEngine`; **opt-in**
  via `GET /api/analysis?engine=ml` with graceful fallback to baseline if the service
  is down (`mlFallback: true`). Verified cross-service call + fallback.
### Result — HONEST NEGATIVE (this is the system working)
- ML did **NOT** beat the baseline: 1d 48.0% vs always-up 54.4%; 5d 48.5% vs 54.5%;
  10d 54.9% ≈ 54.9%. Daily gold ≈ random walk. We keep the TS baseline as default and
  label the ML engine experimental — **no accuracy inflation** (ADR-0004/0005).
- Lesson baked into the roadmap: accuracy gains must come from better *data/features*
  (sentiment history, macro surprises, cross-asset), each clearing the same gate.

## [0.3.0] — 2026-07-17
### Added — the honest forecasting loop (ADR-0004)
- **Walk-forward backtester** (`engine/backtest.ts`): strictly causal (no lookahead),
  scores directional accuracy vs naive random-walk + always-up baselines, plus MAE/
  RMSE and band calibration. `GET /api/backtest`.
- **Measured honest number:** on 250 real gold days, model = **56.0% directional**,
  beating naive (47.6%) by +8.4 pts; band well-calibrated (77% vs 80% target).
  Honest caveat surfaced: ~tied with always-up (55.6%) in this bull window.
- **Keyless news source** (`sources/news.ts`): Google News + Yahoo RSS, dependency-
  free RSS parser, dedupe. **Gold-oriented lexicon sentiment** (`features/sentiment.ts`)
  — rate cut/weak dollar/haven = bullish; rate hike/strong dollar = bearish.
- Sentiment wired into the engine as an OPTIONAL, explainable signal (absent in
  backtests by design → keeps the test causal). Engine → v0.3.0.
- News archive table + `sentimentProvider` (persists headlines so a sentiment
  backtest corpus grows over time). Ingestion now archives news (119 real rows).
- Dashboard: "Tomorrow — probabilistic read" card (direction, P(up), 80% range) and
  live news-sentiment signal with real headlines as drivers.
### Honest limitation documented
- Free RSS = recent news only, not a deep per-day archive. Sentiment sharpens the
  LIVE forecast now; full historical sentiment-backtesting needs an accumulated/
  licensed archive (ADR-0004). We do not pretend otherwise.

## [0.2.0] — 2026-07-17
### Added
- **Phase 1: real data.** Live gold prices + macro, $0/mo, keyless (ADR-0003).
- Yahoo Finance client (`GC=F` gold, DXY, US10Y, oil, silver) — quarantined
  undocumented-endpoint logic behind one module.
- FRED client (optional, free key) for CPI YoY, real yields, policy rate; degrades
  gracefully when no key is set.
- SQLite persistence via `node:sqlite` (built into Node 24 — zero install): schema
  for `prices`, `macro`, `ingest_runs` (audit log) with upsert idempotency.
- Read-through cached repositories (`SqlitePriceRepository`/`SqliteMacroRepository`)
  with seed fallback — degrade, don't crash.
- Ingestion service + `POST /api/ingest` (shared-secret guard, run auditing).
- Config layer (`src/lib/config.ts`) + `.env.example`; `PHOENIX_LIVE_DATA` switch.
- **Honest provenance:** `priceProvenance()` reports live vs seed; API returns
  `live`/`source`; dashboard shows a real live/seed banner (replaced the hardcoded
  sample-data flag — that was a mislabelling bug, now fixed).
### Changed
- `/api/health` now reports `dataMode` + `fredEnabled`; version → 0.2.0.
- Composition root selects SQLite vs seed repos via config.
### Verified
- Ingested 504 real gold bars; gold spot $3,975 (2026-07-17); forecast + signals
  running on live data (engine correctly flagged the current downtrend).

## [0.1.0] — 2026-07-17
### Added
- Repo scaffold: monorepo (`apps/web`, `services/ml-service`), docs, ADRs, roadmap.
- Next.js + TypeScript + Tailwind web app.
- Data-adapter layer (`IPriceRepository`, `IMacroRepository`) with seed gold price
  and macro data; real feeds plug in behind the same interface.
- Indicator/feature layer: returns, volatility, moving averages, momentum, z-scores.
- Baseline probabilistic analysis engine (`IAnalysisEngine`): forecast bands +
  confidence + explainable signals with drivers. No point-prediction guarantees.
- API routes: `/api/health`, `/api/prices`, `/api/analysis`.
- Gold Intelligence dashboard: price context, probabilistic outlook with bands,
  explainable signals, non-dismissible disclaimer.
