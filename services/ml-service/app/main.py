"""FastAPI entrypoint for the Phoenix ML service.

Endpoints:
  GET  /health         — liveness + model status
  POST /v1/analyze     — the IAnalysisEngine contract (AnalyzeRequest -> AnalysisResult)

The model is loaded once at startup if present. If no model artifact exists, /health
reports model_loaded=false and /v1/analyze returns 503 — the Node app then falls back
to its local BaselineEngine (degrade, don't crash — ADR-0003/0005).
"""
from __future__ import annotations

from fastapi import FastAPI, HTTPException

from . import __version__
from .config import MODEL_PATH, SERVICE_NAME
from .engine import analyze
from .model import GoldModel
from .schemas import AnalysisResult, AnalyzeRequest

app = FastAPI(title="Phoenix ML Service", version=__version__)

_model: GoldModel | None = None


@app.on_event("startup")
def _load_model() -> None:
    global _model
    if MODEL_PATH.exists():
        try:
            _model = GoldModel.load()
        except Exception:
            _model = None


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "service": SERVICE_NAME,
        "version": __version__,
        "model_loaded": _model is not None,
        "model_trained_at": _model.trained_at if _model else None,
        "backtest": _model.metrics if _model else None,
    }


@app.post("/v1/analyze", response_model=AnalysisResult)
def v1_analyze(req: AnalyzeRequest) -> AnalysisResult:
    if _model is None:
        raise HTTPException(status_code=503, detail="model_not_trained")
    if len(req.series) < 60:
        raise HTTPException(status_code=422, detail="insufficient_history")
    try:
        return analyze(_model, req)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
