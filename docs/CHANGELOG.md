# Changelog

All notable changes to Phoenix.

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
