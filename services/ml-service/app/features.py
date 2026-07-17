"""Feature engineering for the gold next-day model.

Parity with apps/web/src/lib/features/indicators.ts (returns, SMAs, momentum, vol,
z-score) plus a few extra tabular features GBMs exploit well. STRICTLY CAUSAL: every
feature at row t uses only data up to and including t (no future leakage, ADR-0004).
All features are computed with pandas rolling windows, which are inherently
backward-looking, so a walk-forward backtest is honest by construction.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

# The exact feature columns the model consumes. Frozen so training and serving agree.
FEATURE_COLUMNS = [
    "ret_1",
    "ret_5",
    "ret_10",
    "mom_20",
    "sma_ratio_20_50",
    "vol_10",
    "vol_20",
    "zscore_20",
    "zscore_50",
    "rsi_14",
    "dist_high_20",
    "dist_low_20",
]


def build_features(closes: pd.Series) -> pd.DataFrame:
    """Return a DataFrame of causal features indexed like `closes`.

    Rows with insufficient history contain NaN and are dropped by the caller before
    training. Serving uses the last fully-populated row.
    """
    df = pd.DataFrame(index=closes.index)
    ret = closes.pct_change()

    df["ret_1"] = ret
    df["ret_5"] = closes.pct_change(5)
    df["ret_10"] = closes.pct_change(10)
    df["mom_20"] = closes.pct_change(20)

    sma20 = closes.rolling(20).mean()
    sma50 = closes.rolling(50).mean()
    df["sma_ratio_20_50"] = (sma20 / sma50) - 1.0

    df["vol_10"] = ret.rolling(10).std()
    df["vol_20"] = ret.rolling(20).std()

    df["zscore_20"] = _zscore(closes, 20)
    df["zscore_50"] = _zscore(closes, 50)

    df["rsi_14"] = _rsi(closes, 14)

    roll_high = closes.rolling(20).max()
    roll_low = closes.rolling(20).min()
    df["dist_high_20"] = (closes / roll_high) - 1.0   # <=0, how far below 20d high
    df["dist_low_20"] = (closes / roll_low) - 1.0     # >=0, how far above 20d low

    return df


def _zscore(closes: pd.Series, window: int) -> pd.Series:
    mean = closes.rolling(window).mean()
    std = closes.rolling(window).std()
    return (closes - mean) / std.replace(0, np.nan)


def _rsi(closes: pd.Series, window: int) -> pd.Series:
    delta = closes.diff()
    gain = delta.clip(lower=0).rolling(window).mean()
    loss = (-delta.clip(upper=0)).rolling(window).mean()
    rs = gain / loss.replace(0, np.nan)
    rsi = 100 - (100 / (1 + rs))
    # Normalize to [-1, 1] around 50 for the model.
    return (rsi - 50.0) / 50.0


def make_labels(closes: pd.Series, horizon: int = 1) -> tuple[pd.Series, pd.Series]:
    """Return (next_return, up_label) aligned to feature rows.

    next_return[t] = (close[t+h] - close[t]) / close[t]  — the thing we predict.
    up_label[t]    = 1 if next_return[t] >= 0 else 0.
    The last `horizon` rows have no label (future unknown) → NaN, dropped in training.
    """
    fwd = closes.shift(-horizon) / closes - 1.0
    up = (fwd >= 0).astype(float)
    up[fwd.isna()] = np.nan
    return fwd, up
