# Changelog

All notable changes to Phoenix.

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
