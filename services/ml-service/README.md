# ml-service (deferred — interface contract only)

Python/FastAPI ML service. **Not implemented in v0.1** (no Python locally, and
baselines must prove themselves first — see `docs/adr/0001`).

## Contract it must fulfill
The web app talks to analysis via `IAnalysisEngine` (see
`apps/web/src/lib/engine/types.ts`). When this service exists, it exposes:

```
POST /v1/analyze
  body: { asset, series: PricePoint[], macro: MacroSnapshot }
  200:  AnalysisResult   # same shape the TS engine returns today
```

The web app swaps its local `BaselineEngine` for an `HttpEngine` that POSTs here.
Nothing else in the app changes. That is the whole point of the interface.

## Planned internals (Phase 2)
- FastAPI + Pydantic
- Gradient boosting (LightGBM) + statistical baselines (ARIMA/ETS) for bands
- Walk-forward backtesting; report metrics **against a naive random-walk baseline**
- Model registry + versioned, auditable predictions
