# ADR 0007 — Alerts Engine & AI Report Generator

**Status:** Accepted · **Date:** 2026-07-17

## Context
Accuracy is near its honest ceiling (~55%). The subscription must sell on VALUE, not
a fake number. The two highest-converting, honestly-deliverable features are:
1. **Alerts** — "tell me when gold crosses ₹X / $Y, or when the outlook flips."
2. **AI reports** — an auto-written daily/weekly gold digest from real data.

Both convert free → paid because they save the user time and attention. Neither makes
a prediction claim we can't back.

## Decisions

### 1. Alerts are evaluated on ingest, stored, and idempotent.
An alert has a type (price-above/price-below/direction-flip), a threshold, a currency
(USD/oz or INR/10g), and a state. On each ingest we evaluate all active alerts against
fresh data and record triggers in `triggered_alerts`. An alert won't re-fire until it
resets (crosses back), preventing spam. No user accounts yet → alerts are anonymous/
local for v0.7; a `user_id` column is reserved for when auth lands.

### 2. Currency-aware thresholds.
Because we support USD/oz and INR/10g (ADR-0005/v0.5), an alert stores its currency
and we convert the live price into that currency before comparing. One conversion
path, already built (`lib/currency.ts`).

### 3. Reports are DATA-DRIVEN, template-based — not an LLM hallucinating numbers.
The report generator composes real figures (price move, band, top signals, sentiment,
macro) into readable prose via deterministic templates. **Every number traces to
data** (ADR-0002). This is honest, free to run, and can't invent facts. A true LLM
writer can be layered later behind the same interface — but the FACTS come from the
data layer, never from a model's imagination. This ordering is deliberate: facts
first, fluency later.

### 4. Everything reuses existing seams.
Alerts read the same repositories; reports call the same engine + sentiment. No new
data sources. This is a value/packaging layer on top of what we built, which is
exactly the point — monetize the existing intelligence.

## Consequences
Two sellable features with zero accuracy inflation and zero new data cost. Alerts
create daily re-engagement (a reason to come back); reports create shareable content
(organic growth). Both are the honest foundation of a subscription.

## Deferred
Delivery channels (email/push) need infra + accounts → later. For now alerts surface
in-app and via an API feed a future notifier can poll.
