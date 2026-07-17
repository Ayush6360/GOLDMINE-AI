# ADR 0003 — Phase 1 Data Sources & Ingestion

**Status:** Accepted · **Date:** 2026-07-17

## Context
v0.1 ran on labelled sample data. Every downstream feature (forecasting, signals,
analogues, sentiment) is worthless without real data. We need real gold + macro
data at **zero cost and zero friction** before spending on vendors or standing up
Docker/Postgres. Local env: Node 24, **no Python, no Docker**.

## Decisions

### 1. Price source: Yahoo Finance `GC=F` (keyless)
Tested working: real gold-futures daily history + spot. Stooq now serves a
bot-challenge page (rejected). Paid intraday APIs (metals-api, Twelve Data) are
deferred until we have users — no point paying pre-PMF.
- *Trade-off:* Yahoo is an undocumented endpoint, not an SLA'd feed. Acceptable for
  Phase 1; the `IPriceRepository` seam means swapping to a paid feed later is a
  one-file change. We isolate the fragility in one client.

### 2. Macro source: Yahoo (keyless) + FRED (free key, optional)
Keyless today: DXY (`DX-Y.NYB`), US 10y yield (`^TNX`), oil (`CL=F`), silver
(`SI=F`). FRED (requires a free key) *enhances* with CPI, real yields, policy rate.
FRED is optional — its absence degrades gracefully, never breaks the app.

### 3. Storage: `node:sqlite` (built into Node 24)
Durable persistence with **zero install and zero native compilation**
(`better-sqlite3` would need Windows build tools we don't have). Behind
`IPriceRepository`; swaps to Postgres+TimescaleDB in the cloud with no app changes.

### 4. Pattern: read-through cache with seed fallback
`Source → SQLite (persist) → reads from SQLite`. If the network/source fails,
repositories fall back to the deterministic seed data so the app never hard-fails.
This is the honest, resilient default: **degrade, don't crash.**

### 5. Ingestion: on-demand route now, scheduler later
`POST /api/ingest` pulls fresh data → SQLite. A cron/worker is deferred until we
need continuous updates (Phase 1.5) — earn the complexity.

## Consequences
Real gold + macro data, $0/mo, no keys required, durable history for backtesting,
graceful degradation. Fragility (undocumented endpoints) is quarantined behind
clients and interfaces. Provenance (`source`, `fetchedAt`) is stored and surfaced
so users always know where a number came from.
