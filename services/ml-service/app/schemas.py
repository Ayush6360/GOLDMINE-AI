"""Pydantic schemas — the wire contract with the Node web app.

These mirror the TypeScript domain types (apps/web/src/lib/domain/types.ts) and the
IAnalysisEngine contract. Keeping them aligned is what makes the TS BaselineEngine
and this ML engine interchangeable behind the same interface.
"""
from __future__ import annotations

from typing import Literal, Optional
from pydantic import BaseModel, Field


class PricePoint(BaseModel):
    date: str
    close: float


class MacroSnapshot(BaseModel):
    date: str
    dxy: float
    realYield10y: float
    cpiYoY: float
    policyRate: float


class SentimentInput(BaseModel):
    net: float = 0.0
    scoredCount: int = 0


class AnalyzeRequest(BaseModel):
    asset: str = "gold"
    series: list[PricePoint]
    macro: MacroSnapshot
    horizonDays: int = 1
    sentiment: Optional[SentimentInput] = None


class Driver(BaseModel):
    label: str
    detail: str
    weight: float


class Signal(BaseModel):
    key: str
    title: str
    direction: Literal["up", "down", "neutral"]
    strength: float
    drivers: list[Driver]


class ForecastResult(BaseModel):
    asset: str
    horizonDays: int
    central: float
    lower: float
    upper: float
    intervalCoverage: float
    confidence: float
    probUp: float


class AnalysisMeta(BaseModel):
    engine: str
    engineVersion: str
    dataPoints: int
    generatedAt: str
    modelTrainedAt: Optional[str] = None


class AnalysisResult(BaseModel):
    asset: str
    asOf: str
    spot: float
    forecast: ForecastResult
    signals: list[Signal]
    disclaimer: str
    meta: AnalysisMeta
