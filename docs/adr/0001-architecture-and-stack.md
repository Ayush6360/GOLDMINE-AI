# ADR 0001 — Architecture & Stack (v0.1)

**Status:** Accepted · **Date:** 2026-07-17

## Context
Phoenix aims to become a broad financial-intelligence platform. The master brief
lists K8s, microservices, message queues, vector DBs, PyTorch/TensorFlow,
LangGraph, etc. The local dev machine has Node 24 but **no Python and no Docker**.

## Decision
Ship v0.1 as a **modular monolith** in **Next.js + TypeScript + Tailwind**, with a
strict internal layering (adapters → features → engine → api → ui). Defer every
piece of heavy infra until a concrete need justifies it.

## Why (and the trade-offs)
- **Modular monolith over microservices:** one deployable, one language for v0.1,
  zero network hops. Microservices add ops cost and latency we haven't earned.
  *Trade-off:* eventual extraction work — mitigated by the adapter/engine seams.
- **TypeScript engine first, Python ML later:** the machine has no Python; more
  importantly, gradient-boosting/statistical baselines must beat a naive forecast
  *before* deep learning is worth its complexity and cost. The `IAnalysisEngine`
  interface lets the Python service replace the TS baseline behind an HTTP call.
- **No Kubernetes yet:** a single container on a managed host (Fly/Render/Railway)
  serves early load fine. K8s is justified by multi-service scale + a team, not by
  ambition. *Cost impact:* ~$0–20/mo vs. hundreds for an idle cluster.
- **Postgres + TimescaleDB (planned):** native time-series without a second DB.
  v0.1 uses an in-repo seed store behind `IPriceRepository` so the DB swaps in
  cleanly.

## Deferred (with the trigger that unlocks each)
| Tech | Unlocks when |
|---|---|
| Python ML service | a baseline is live and we need a model that beats it |
| Vector DB / RAG | we ingest unstructured news/docs for retrieval |
| Message queue / workers | ingestion or scoring becomes async/heavy |
| Kubernetes | >2–3 services + real traffic + a team to run it |
| Microservice split | a module needs independent scaling or ownership |

## Consequences
Fast path to a real, running product; low cost; clean seams for growth. The main
risk — that we under-build — is bounded by the interfaces defined now.
