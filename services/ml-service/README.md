# Phoenix ML Service (`phoenix-ml`)

FastAPI + LightGBM service for gold next-day forecasting. Called by the Node web app
behind `IAnalysisEngine` (contract: `POST /v1/analyze`). See
`docs/adr/0005-ml-service-architecture.md`.

## ⚠️ Honest result up front
In walk-forward backtesting the LightGBM model **did NOT beat the naive/always-up
baseline** on daily gold (48–55% directional depending on horizon). Daily gold is
~a random walk. The model is therefore **opt-in and experimental**, never presented
as "more accurate". This is the methodology (ADR-0004) working as intended — we
measured honestly instead of shipping a backtest-overfit illusion. `/health`
publishes the full verdict.

## Setup
```bash
cd services/ml-service
python -m venv .venv
.venv/Scripts/python.exe -m pip install -r requirements.txt   # Windows
# source .venv/bin/activate && pip install -r requirements.txt  # *nix
```

## Train + honest backtest
```bash
.venv/Scripts/python.exe -m scripts.train              # fetch, backtest, train, save
.venv/Scripts/python.exe -m scripts.train --no-save    # backtest only
.venv/Scripts/python.exe -m scripts.train --horizon 10 # try a different horizon
```
Prints ML vs naive vs always-up on a causal walk-forward and bakes metrics into the
saved artifact (`models/gold_next_day.joblib`).

## Run the service
```bash
.venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8001
```
- `GET /health` — liveness, model status, baked-in backtest verdict
- `POST /v1/analyze` — `AnalyzeRequest -> AnalysisResult` (same shape as the TS engine)

## Use from the web app
The web app calls this only when asked: `GET /api/analysis?engine=ml`. If the service
is down it falls back to the local baseline (`mlFallback: true`) — degrade, don't
crash. Set `PHOENIX_ML_URL` to point elsewhere (default `http://127.0.0.1:8001`).

## Layout
```
app/
  main.py         FastAPI app (/health, /v1/analyze)
  schemas.py      Pydantic wire contract (mirrors TS domain types)
  features.py     Causal feature engineering (parity with TS indicators)
  model.py        LightGBM classifier + quantile band regressors + explainability
  backtest.py     Walk-forward, causal, vs baselines — the honesty gate
  engine.py       Prediction -> AnalysisResult mapping (explainable signals)
  data_client.py  Yahoo GC=F gold history (parity with TS source)
scripts/train.py  Train + backtest CLI
```
