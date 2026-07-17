# ADR 0002 — Compliance, Disclaimers & Honest Outputs

**Status:** Accepted · **Date:** 2026-07-17

## Context
"AI that forecasts gold" carries two real risks: (1) financial-advice regulation,
(2) reputational/legal damage from implied guarantees. Phoenix's stated principle
is that it must **never claim guaranteed predictions**.

## Decision
Encode honesty as an architectural invariant, not a UI footnote.

1. **No point predictions without uncertainty.** Every forecast the engine returns
   MUST carry a probability distribution / band and a `confidence` score. The
   `ForecastResult` type makes an unbanded forecast unrepresentable.
2. **Explainability is mandatory.** Every `Signal` carries `drivers[]` linking the
   conclusion to concrete data. No black-box verdicts in v0.1.
3. **Disclaimers travel with the payload.** The API attaches a `disclaimer` field
   to every analysis response; the UI renders it non-dismissibly.
4. **Neutral language.** Outputs use "suggests / historically associated with /
   probability", never "will" or "recommended".

## Consequences
The type system prevents the most dangerous class of output (a naked guarantee).
Compliance review later is cheaper because the guardrails are structural.

## Future
Jurisdiction-specific disclaimer variants; an audit log of every forecast shown to
a user (what data, what model, what confidence) for accountability.
