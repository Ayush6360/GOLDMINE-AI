"""Cross-asset + macro-momentum features (the honest edge experiment).

Hypothesis (ADR-0006): gold's own price history is nearly a random walk, but gold
has REAL relationships to other assets — inverse to the US dollar, co-moving with
silver, pressured by rising real yields. A model that sees what the dollar/silver/
yields are DOING may have genuine, un-priced-by-us signal.

Every feature here is strictly causal (trailing windows only). Whether they actually
help is decided by walk-forward backtest, never asserted.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from .features import FEATURE_COLUMNS as GOLD_FEATURES, build_features

CROSS_FEATURE_COLUMNS = [
    "dxy_ret_1",
    "dxy_ret_5",
    "silver_ret_1",
    "silver_ret_5",
    "gold_silver_ratio_z",
    "us10y_chg_5",
    "oil_ret_5",
    "gold_dxy_corr_20",
]

# Macro-SHOCK proxy features (ADR-0008). Not true "surprise vs consensus" (that
# needs a paid economic-calendar feed) — instead we flag when a macro driver moves
# far outside its own recent normal range (z-scored 1-day move). A big, abnormal
# dollar/yield/oil move is the observable footprint of a macro surprise.
SHOCK_FEATURE_COLUMNS = [
    "dxy_shock_z",
    "us10y_shock_z",
    "oil_shock_z",
    "abs_macro_shock",
]


def build_cross_features(df: pd.DataFrame, include_shock: bool = False) -> pd.DataFrame:
    """df has columns gold, dxy, silver, us10y, oil (from fetch_multi_asset).

    Returns gold features + cross-asset features (+ macro-shock proxies if requested),
    aligned, causal.
    """
    gold = df["gold"]
    out = build_features(gold)  # the base gold features

    if "dxy" in df:
        dxy = df["dxy"]
        out["dxy_ret_1"] = dxy.pct_change()
        out["dxy_ret_5"] = dxy.pct_change(5)
        out["gold_dxy_corr_20"] = gold.pct_change().rolling(20).corr(dxy.pct_change())

    if "silver" in df:
        silver = df["silver"]
        out["silver_ret_1"] = silver.pct_change()
        out["silver_ret_5"] = silver.pct_change(5)
        ratio = gold / silver
        out["gold_silver_ratio_z"] = _zscore(ratio, 50)

    if "us10y" in df:
        out["us10y_chg_5"] = df["us10y"].diff(5)

    if "oil" in df:
        out["oil_ret_5"] = df["oil"].pct_change(5)

    if include_shock:
        # z-score of the 1-day move vs its own trailing 20-day distribution.
        if "dxy" in df:
            out["dxy_shock_z"] = _move_shock(df["dxy"])
        if "us10y" in df:
            out["us10y_shock_z"] = _move_shock(df["us10y"], diff=True)
        if "oil" in df:
            out["oil_shock_z"] = _move_shock(df["oil"])
        # Combined magnitude of macro shocks today (how "eventful" the day was).
        shock_cols = [c for c in ("dxy_shock_z", "us10y_shock_z", "oil_shock_z") if c in out]
        if shock_cols:
            out["abs_macro_shock"] = out[shock_cols].abs().sum(axis=1)

    return out


def _move_shock(s: pd.Series, window: int = 20, diff: bool = False) -> pd.Series:
    """z-score of today's move vs the trailing distribution of moves. Large |z| = an
    abnormal move = the observable footprint of a macro surprise (ADR-0008)."""
    move = s.diff() if diff else s.pct_change()
    mean = move.rolling(window).mean()
    std = move.rolling(window).std()
    return (move - mean) / std.replace(0, np.nan)


def _zscore(s: pd.Series, window: int) -> pd.Series:
    mean = s.rolling(window).mean()
    std = s.rolling(window).std()
    return (s - mean) / std.replace(0, np.nan)


def all_feature_columns(include_cross: bool, include_shock: bool = False) -> list[str]:
    cols = list(GOLD_FEATURES)
    if include_cross:
        cols += list(CROSS_FEATURE_COLUMNS)
    if include_shock:
        cols += list(SHOCK_FEATURE_COLUMNS)
    return cols
