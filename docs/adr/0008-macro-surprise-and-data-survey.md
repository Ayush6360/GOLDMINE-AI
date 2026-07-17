# ADR 0008 — Macro-Surprise Features & the Honest Data Survey

**Status:** Accepted · **Date:** 2026-07-17

## Part 1 — Macro-surprise: theory, reality, and what we shipped

**Theory (correct):** markets move on data vs. *expectations*, not the raw value. The
*surprise* (actual − consensus) is the signal.

**Reality:** consensus-forecast numbers are NOT free. FRED gives actuals (free key);
consensus lives behind paid economic-calendar APIs (TradingEconomics, Investing.com).
A *true* surprise feature needs paid data we don't have yet.

**What we built instead — a macro-SHOCK proxy:** z-score of a macro driver's 1-day
move vs its own trailing distribution. A big abnormal dollar/yield/oil move is the
observable *footprint* of a surprise. Weaker than true surprise, but free and honest.

### Validated result (this is real, not luck)
Walk-forward, causal, across test windows:

| Config | 120d | 160d | 200d | 250d |
|---|---|---|---|---|
| cross+shock @ h10 | +13.3 | +11.9 | +4.6 | +4.6 |
| cross+gold  @ h10 | +9.2 | +7.5 | +1.5 | +1.5 |

The 10-day (weekly) edge is **positive in every window** and macro-shock adds ~3–4
pts on top of cross-asset alone. Unlike the 1-day cross-asset edge (which flipped to
0 on window shift), this is robust. **Shipped:** the ML engine's model is now
cross+shock @ horizon 10 → ~60% directional weekly outlook.

**Honest boundary:** this is a WEEKLY (10-day) outlook. NEXT-DAY is still ~55%, a
coin flip — shock features actually *hurt* at 1-day (−2.5 pts). Product copy must
say: "weekly outlook ~60% (backtested); daily is near-random."

## Part 2 — Honest data survey: what could actually raise accuracy

Ranked by expected signal, with the real access/cost reality.

### Tier 1 — genuinely promising, worth pursuing
1. **True macro surprise (actual vs consensus)** — CPI, NFP, Fed decisions vs
   expectations. *Access:* paid economic-calendar API (~$0–50/mo has limited free
   tiers; TradingEconomics/FMP). *Why:* the real version of what we proxied; likely
   the single biggest honest lever.
2. **Central-bank gold buying (WGC / IMF data)** — structural demand; central banks
   have been huge net buyers. *Access:* World Gold Council + IMF, mostly free but
   monthly/quarterly, low-frequency. *Why:* explains multi-month trends, not tomorrow.
3. **ETF flows (GLD holdings)** — daily tonnes in/out of the biggest gold ETF.
   *Access:* free-ish (SPDR publishes daily). *Why:* real demand signal at daily freq.

### Tier 2 — real but harder / marginal
4. **COT positioning (CFTC)** — how futures speculators are positioned; extremes
   mean-revert. *Access:* free, weekly, lagged 3 days. *Why:* contrarian signal.
5. **Options-implied volatility (GVZ, gold VIX)** — forward-looking risk; improves
   the BAND more than direction. *Access:* free-ish (Cboe/Yahoo). *Why:* better
   calibrated intervals (also helps the "adaptive bands" idea).
6. **Real yields / TIPS at daily freq (FRED DFII10)** — the cleanest fundamental
   gold driver. *Access:* free FRED key. *Why:* we approximate this now; the real
   series would sharpen it. **Cheapest real upgrade — just needs the FRED key set.**

### Tier 3 — fashionable but low/negative ROI for us now
7. **Social/Twitter/Reddit sentiment** — noisy, gameable, weak for gold specifically.
8. **Deep learning (LSTM/Transformers) on price** — will overfit ~500 rows; loses to
   GBMs on tabular financial data. Not worth it until we have far more/richer data.
9. **Satellite/alt-data** — real for some commodities, expensive and thin for gold.

## Decision
- Ship the validated cross+shock weekly model (done).
- **Next real accuracy lever:** set a FRED key (free) to add true daily real yields +
  CPI, then test true macro-surprise via a calendar API. Each must clear the same
  walk-forward gate.
- Market honestly: weekly ~60%, daily ~55%. The number we can defend is the moat.

## Consequences
We finally have a genuine, robust edge (weekly), honestly measured, and a ranked map
of where further real signal lives — with costs stated, so the founder invests in
data that pays off rather than chasing model complexity that doesn't.
