"""Maps model predictions into the AnalysisResult contract (the wire shape the Node
web app expects). Turns LightGBM feature contributions into human-readable,
explainable signals (ADR-0002).
"""
from __future__ import annotations

import datetime as dt

import pandas as pd

from . import __version__
from .config import SERVICE_NAME
from .model import GoldModel, predict_last
from .schemas import (
    AnalysisMeta,
    AnalysisResult,
    AnalyzeRequest,
    Driver,
    ForecastResult,
    Signal,
)

DISCLAIMER = (
    "Phoenix provides probabilistic, informational analysis only. This is not "
    "financial advice, not a recommendation, and not a guarantee. Markets are "
    "uncertain; forecasts carry wide error bands. Do your own research."
)

# Human-friendly names for the model features (explainability).
_FEATURE_LABELS = {
    "ret_1": "1-day return",
    "ret_5": "5-day return",
    "ret_10": "10-day return",
    "mom_20": "20-day momentum",
    "sma_ratio_20_50": "SMA20 vs SMA50 trend",
    "vol_10": "10-day volatility",
    "vol_20": "20-day volatility",
    "zscore_20": "20-day z-score (stretch)",
    "zscore_50": "50-day z-score (stretch)",
    "rsi_14": "RSI(14) momentum",
    "dist_high_20": "distance below 20-day high",
    "dist_low_20": "distance above 20-day low",
}


def analyze(model: GoldModel, req: AnalyzeRequest) -> AnalysisResult:
    closes = pd.Series(
        {p.date: p.close for p in req.series}, name="close"
    ).sort_index()
    spot = float(closes.iloc[-1])
    as_of = str(closes.index[-1])

    pred = predict_last(model, closes)

    # Convert next-day return quantiles into price band + central estimate.
    central_ret = (pred.ret_low + pred.ret_high) / 2.0
    central = round(spot * (1 + central_ret), 2)
    lower = round(spot * (1 + pred.ret_low), 2)
    upper = round(spot * (1 + pred.ret_high), 2)

    # Confidence: distance of P(up) from 0.5, scaled; capped — honesty over bravado.
    confidence = round(min(0.7, abs(pred.prob_up - 0.5) * 1.4 + 0.1), 2)

    forecast = ForecastResult(
        asset=req.asset,
        horizonDays=req.horizonDays,
        central=central,
        lower=lower,
        upper=upper,
        intervalCoverage=0.8,
        confidence=confidence,
        probUp=round(pred.prob_up, 3),
    )

    signals = _signals_from_contributions(pred, req)

    return AnalysisResult(
        asset=req.asset,
        asOf=as_of,
        spot=spot,
        forecast=forecast,
        signals=signals,
        disclaimer=DISCLAIMER,
        meta=AnalysisMeta(
            engine=SERVICE_NAME,
            engineVersion=__version__,
            dataPoints=len(req.series),
            generatedAt=dt.datetime.now(dt.timezone.utc).isoformat(),
            modelTrainedAt=model.trained_at,
        ),
    )


def _signals_from_contributions(pred, req: AnalyzeRequest) -> list[Signal]:
    """Top model drivers become an explainable 'ML drivers' signal, plus a headline
    directional signal from P(up)."""
    prob = pred.prob_up
    direction = "up" if prob > 0.52 else "down" if prob < 0.48 else "neutral"

    drivers = []
    for feat, contrib in pred.contributions[:5]:
        label = _FEATURE_LABELS.get(feat, feat)
        pushes = "up" if contrib > 0 else "down"
        drivers.append(
            Driver(
                label=label,
                detail=f"{label} pushes the next-day probability {pushes} (contribution {contrib:+.3f} log-odds).",
                weight=max(-1.0, min(1.0, contrib)),
            )
        )

    signals = [
        Signal(
            key="ml_direction",
            title="ML next-day direction (LightGBM)",
            direction=direction,
            strength=min(1.0, abs(prob - 0.5) * 2),
            drivers=drivers,
        )
    ]

    # Surface sentiment if the caller provided it (kept explainable + separate).
    if req.sentiment and req.sentiment.scoredCount > 0:
        s = req.sentiment
        sdir = "up" if s.net > 0.1 else "down" if s.net < -0.1 else "neutral"
        signals.append(
            Signal(
                key="sentiment",
                title="Live news sentiment",
                direction=sdir,
                strength=min(1.0, abs(s.net)),
                drivers=[
                    Driver(
                        label="Net news sentiment",
                        detail=f"{s.scoredCount} gold-relevant headlines; net {s.net:+.2f}. (Context only — not yet in the trained model.)",
                        weight=max(-1.0, min(1.0, s.net)),
                    )
                ],
            )
        )

    return signals
