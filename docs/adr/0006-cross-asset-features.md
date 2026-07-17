# ADR 0006 — Cross-Asset Features: an Honest, Small Edge

**Status:** Accepted · **Date:** 2026-07-17

## Context
The founder wants higher accuracy to justify a paid subscription. We refused to
inflate the number (that is fraud + regulatory risk) and instead ran a genuine
experiment: do cross-asset (DXY, silver, 10y yield, oil) + longer-horizon features
beat the honest baseline in walk-forward testing?

## Experiment
`scripts/experiment.py` — walk-forward, causal, across {gold-only, cross+gold} ×
{1,3,5,10-day horizons} on 505 aligned real days. Metric: directional accuracy vs
the best of (naive, always-up).

## Result (honest, measured)
| Config | Model | Best baseline | Edge |
|---|---|---|---|
| cross+gold, 1d | **56.5%** | 54.5% | **+2.0 pts** |
| cross+gold, 10d | 56.6% | 55.1% | +1.5 pts |
| gold-only, 1d | 48.5% | 54.5% | −6.0 pts |

**Finding:** cross-asset features lift next-day accuracy from 48.5% → 56.5% — a
real, economically-sensible improvement (gold genuinely responds to the dollar and
the precious-metals complex). But the edge over the *best baseline* is ~2 pts:
small, plausibly real, NOT a game-changer.

## Decision
1. **Ship the cross-asset model** as the ML engine's feature basis. It is a genuine
   improvement, tested without lookahead.
2. **Label it honestly:** "~56% directional, cross-asset signals." No inflation. The
   +2 pts is the edge; it remains a coin-flip-plus, not a promise.
3. **Do NOT market it as high-accuracy.** Subscription value must rest on
   explanation, alerts, convenience, and trust — not this number (see honest-product
   discussion; ~56% is near the ceiling for daily gold direction).

## What this rules out
Chasing accuracy via more price/asset features has hit diminishing returns. Further
*real* gains require genuinely un-priced data (macro-surprise vs expectations,
positioning/COT, options-implied vol, accumulated sentiment history) — each must
clear this same walk-forward gate. We will not pretend otherwise.

## Consequences
The paid product is built on honest value. Our accuracy claim (~56%, cross-asset,
calibrated bands, full explanation) is one we can defend to a regulator and a user
checking our track record. That defensibility is itself a moat.
