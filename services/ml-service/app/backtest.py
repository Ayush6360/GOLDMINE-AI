"""Walk-forward backtester for the ML model — the honesty gate (ADR-0004/0005).

Same causal methodology as the TS backtester: at each step we train ONLY on data
strictly before the prediction day, predict the next day, and score against the
realized outcome. We compare the ML model to naive random-walk and always-up
baselines on the identical window. This retrains repeatedly (expanding window with a
refit cadence) — the ONLY honest way to test a learned model. Scoring on training
data would be a lie.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from lightgbm import LGBMClassifier

from .config import BAND_LOWER_Q, BAND_UPPER_Q
from .features import FEATURE_COLUMNS, build_features, make_labels
from .model import _COMMON


def walk_forward(
    closes: pd.Series,
    horizon: int = 1,
    min_train: int = 250,
    test_days: int = 250,
    refit_every: int = 10,
) -> dict:
    """Expanding-window walk-forward. Returns honest metrics vs baselines.

    refit_every: retrain cadence. Refitting every single day is ideal but slow;
    every 10 days is a well-accepted approximation that does NOT leak future data
    (we still only ever train on the past).
    """
    feats_all = build_features(closes)
    fwd_all, up_all = make_labels(closes, horizon)

    df = feats_all.copy()
    df["_fwd"] = fwd_all
    df["_up"] = up_all
    df = df.dropna()

    n = len(df)
    if n < min_train + 30:
        raise ValueError(f"insufficient_history: have {n}, need {min_train + 30}")

    start = max(min_train, n - test_days)

    model_correct = naive_correct = up_correct = total = 0
    band_hits = 0
    abs_err = []
    prev_close_col = closes.reindex(df.index)

    clf = None
    for i in range(start, n):
        # Train window: strictly rows before i.
        if clf is None or (i - start) % refit_every == 0:
            X_tr = df[FEATURE_COLUMNS].iloc[:i]
            y_tr = df["_up"].iloc[:i]
            clf = LGBMClassifier(**_COMMON)
            clf.fit(X_tr, y_tr)

        x_i = df[FEATURE_COLUMNS].iloc[[i]]
        actual_up = df["_up"].iloc[i] >= 0.5
        pred_up = clf.predict_proba(x_i)[0, 1] >= 0.5
        if pred_up == actual_up:
            model_correct += 1

        # Baselines on the same row.
        # naive: same direction as the last observed move (ret_1 sign).
        naive_up = df["ret_1"].iloc[i] >= 0
        if naive_up == actual_up:
            naive_correct += 1
        if actual_up:
            up_correct += 1

        total += 1

    hit = model_correct / total if total else 0.0
    naive_hit = naive_correct / total if total else 0.0
    up_hit = up_correct / total if total else 0.0

    return {
        "horizon": horizon,
        "samples": total,
        "refit_every": refit_every,
        "model_hit_rate": round(hit, 4),
        "naive_hit_rate": round(naive_hit, 4),
        "always_up_hit_rate": round(up_hit, 4),
        "edge_vs_naive_pts": round((hit - naive_hit) * 100, 2),
        "edge_vs_up_pts": round((hit - up_hit) * 100, 2),
        "date_from": str(df.index[start]),
        "date_to": str(df.index[-1]),
        "verdict": _verdict(hit, naive_hit, up_hit, total),
    }


def _verdict(hit: float, naive: float, up: float, n: int) -> str:
    parts = []
    if n < 100:
        parts.append(f"Only {n} samples — indicative, not conclusive.")
    e_naive = (hit - naive) * 100
    e_up = (hit - up) * 100
    parts.append(f"ML {hit*100:.1f}% vs naive {naive*100:.1f}% ({e_naive:+.1f} pts), vs always-up {up*100:.1f}% ({e_up:+.1f} pts).")
    best_baseline = max(naive, up)
    if hit > best_baseline + 0.02:
        parts.append("ML beats BOTH baselines — a genuine edge; worth shipping.")
    elif hit > best_baseline:
        parts.append("ML edges out the baselines slightly — marginal; keep watching.")
    else:
        parts.append("ML does NOT beat the best baseline — honest result: do not ship it as 'better'. Keep the simple engine.")
    return " ".join(parts)
