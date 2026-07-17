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


def build_cross_features(df: pd.DataFrame) -> pd.DataFrame:
    """df has columns gold, dxy, silver, us10y, oil (from fetch_multi_asset).

    Returns gold features + cross-asset features, aligned, causal.
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

    return out


def _zscore(s: pd.Series, window: int) -> pd.Series:
    mean = s.rolling(window).mean()
    std = s.rolling(window).std()
    return (s - mean) / std.replace(0, np.nan)


def all_feature_columns(include_cross: bool) -> list[str]:
    return list(GOLD_FEATURES) + (list(CROSS_FEATURE_COLUMNS) if include_cross else [])
