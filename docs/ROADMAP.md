# Phoenix Roadmap

## Phase 0 — Wedge (current)
**Gold Intelligence v0.1** — runnable dashboard, adapter layer, baseline
probabilistic + explainable engine, disclaimers. *Goal: prove the honest-analysis
thesis end-to-end.*

## Phase 1 — Real data
- Live gold spot + history adapter (e.g. metals API / stooq / yfinance-equivalent)
- Macro adapters: DXY, US real yields, CPI, policy rates (FRED)
- Postgres + TimescaleDB behind `IPriceRepository`
- Scheduled ingestion (start with a cron route; add a queue only when needed)

## Phase 2 — Real models
- Python `ml-service` (FastAPI): gradient-boosting + statistical baselines,
  walk-forward backtesting, honest metrics vs. a naive baseline
- Swap TS engine → HTTP call behind `IAnalysisEngine` (no UI change)

## Phase 3 — Intelligence
- News ingestion + sentiment; historical-analogue matching ("today rhymes with…")
- RAG assistant (adds a vector DB — first justified use)
- AI-generated, cited reports

## Phase 4 — Platform
- Generalize `asset` abstraction → silver, forex, commodities, crypto
- Auth, accounts, saved views, alerts
- Observability, CI/CD, extract services only where scale demands

## Guiding rule
Earn every piece of complexity. Ship honest analysis at each phase.
