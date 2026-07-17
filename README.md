# Phoenix — AI Financial Intelligence Platform

> **Gold Intelligence v0.1** — the first wedge of Phoenix.

Phoenix is an explainable, probabilistic financial-intelligence platform. It does
**not** predict prices with certainty. It provides intelligent analysis,
probabilistic forecasts with uncertainty bands, historical analogues, and
decision-support — every claim traceable to a data driver.

## ⚠️ Not financial advice
Phoenix outputs are informational and probabilistic. Nothing here is a guarantee
or a recommendation to buy or sell any asset. See `docs/adr/0002-compliance-and-disclaimers.md`.

## Current status
- **v0.1 (this build):** Next.js + TypeScript full-stack dashboard, data-adapter
  layer (seed data today, real APIs behind the same interface later), a baseline
  probabilistic analysis engine (bands + confidence + explainability).
- **Why not Python/ML yet:** the ML service is deferred until baselines justify it.
  See `docs/adr/0001-architecture-and-stack.md`. The `services/ml-service/`
  interface contract is defined so it drops in without touching the web app.

## Quick start
```bash
cd apps/web
npm install
npm run dev      # http://localhost:3000
```

## Repo layout
```
phoenix/
├─ apps/web/            Next.js dashboard + API (runs today)
├─ services/ml-service/ Python ML service (interface defined, impl deferred)
├─ docs/                ADRs, roadmap, changelog
```

## Architecture at a glance
`Data Adapters` → `Feature/Indicator layer` → `Analysis Engine (probabilistic + explainable)` → `API` → `Dashboard`

Every stage is modular and swappable. Adapters hide data sources; the engine
never depends on a concrete source. This is what lets us swap seed data for real
feeds — and later swap the TS baseline engine for the Python ML service — without
rewrites.
