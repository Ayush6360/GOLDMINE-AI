# ADR 0009 — RAG Assistant (Grounded Financial Q&A)

**Status:** Accepted · **Date:** 2026-07-17

## Context
The flagship feature from the founding vision: an AI assistant that answers "Why is
gold moving?" / "What's the outlook?" from Phoenix's own ingested data. It must be
**impressive** (sellable) yet **honest** (no hallucinated numbers, no fake
predictions — ADR-0002/0004).

## Decisions

### 1. Retrieval over OUR data, not the open web.
The assistant answers from what we already ingest: news headlines (SQLite `news`),
price history + moves, macro snapshot, and the live analysis/signals. This is
genuine RAG — retrieve relevant context, then generate grounded on it. No new data
source, no per-user cost.

### 2. Generation behind `IAnswerGenerator` — keyless default, LLM optional.
- **Default (`GroundedComposer`):** a deterministic, template-based composer that
  writes a readable answer STRICTLY from retrieved facts, with citations. Zero cost,
  zero hallucination, always available. Every claim traces to a source.
- **Optional (`ClaudeGenerator`):** if `ANTHROPIC_API_KEY` is set, we call Claude
  with the retrieved context and a strict system prompt: *use only the provided
  context, cite sources, never invent numbers, never promise prices.* Same interface,
  so the app swaps transparently.
- This ordering is deliberate (facts-first, fluency-optional): the product works and
  is honest with no key; the LLM adds polish when available.

### 3. Grounding rules (non-negotiable).
- Numbers come from retrieved data only; the generator never fabricates a figure.
- Every answer carries its sources (headline titles/links, data as-of dates).
- Forecast questions get the honest framing: probabilistic, weekly ~60% / daily ~55%,
  never a guarantee. The assistant refuses to give a single "price tomorrow".

### 4. Safety.
The Claude path uses a locked system prompt and passes only retrieved context. If the
LLM errors or the key is absent, we fall back to the grounded composer — degrade,
don't crash (ADR-0003 principle).

## Consequences
A demoable, sellable assistant that is honest by construction. Works fully offline/
keyless; upgrades to LLM-quality prose when a key is present. The retrieval layer is
reusable for future report generation and multi-asset expansion.

## Deferred
Vector embeddings (semantic search) — for now retrieval is keyword + recency +
relevance scoring over a small corpus, which is sufficient and has zero infra. A
vector DB becomes justified when the news corpus grows large (Phase 3).
