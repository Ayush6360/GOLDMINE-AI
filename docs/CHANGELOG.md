# Changelog

All notable changes to Phoenix.

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
