"""Honest experiment harness: does adding cross-asset features or longer horizons
genuinely beat the baseline? (ADR-0006)

Runs walk-forward backtests across (feature_set x horizon) combinations on the SAME
causal methodology as everything else. Prints a ranked table. NO config is shipped
unless it beats the always-up baseline here. This is designed to tell us the truth,
including 'nothing helped'.

Usage: python -m scripts.experiment
"""
from __future__ import annotations

import json

import numpy as np
import pandas as pd
from lightgbm import LGBMClassifier

from app.cross_features import build_cross_features, all_feature_columns
from app.data_client import fetch_multi_asset
from app.features import build_features, make_labels
from app.model import _COMMON


def _prep(df: pd.DataFrame, include_cross: bool, horizon: int):
    if include_cross:
        feats = build_cross_features(df)
    else:
        feats = build_features(df["gold"])
    cols = all_feature_columns(include_cross)
    fwd, up = make_labels(df["gold"], horizon)
    data = feats[cols].copy()
    data["_up"] = up
    data = data.dropna()
    return data, cols


def walk_forward_config(df, include_cross: bool, horizon: int, min_train=250, test_days=200, refit_every=10):
    data, cols = _prep(df, include_cross, horizon)
    n = len(data)
    if n < min_train + 30:
        return None
    start = max(min_train, n - test_days)

    clf = None
    model_c = naive_c = up_c = total = 0
    for i in range(start, n):
        if clf is None or (i - start) % refit_every == 0:
            clf = LGBMClassifier(**_COMMON)
            clf.fit(data[cols].iloc[:i], data["_up"].iloc[:i])
        x = data[cols].iloc[[i]]
        actual_up = data["_up"].iloc[i] >= 0.5
        if (clf.predict_proba(x)[0, 1] >= 0.5) == actual_up:
            model_c += 1
        # naive: same direction as last move (ret_1 sign)
        if (data["ret_1"].iloc[i] >= 0) == actual_up:
            naive_c += 1
        if actual_up:
            up_c += 1
        total += 1

    return {
        "features": "cross+gold" if include_cross else "gold-only",
        "horizon": horizon,
        "samples": total,
        "model": round(model_c / total, 4),
        "naive": round(naive_c / total, 4),
        "always_up": round(up_c / total, 4),
        "beat_best_baseline": round(model_c / total - max(naive_c, up_c) / total, 4),
    }


def main() -> int:
    print("Fetching multi-asset history (gold + DXY + silver + 10y + oil)...")
    df = fetch_multi_asset(range_="2y")
    print(f"  {len(df)} aligned rows, {df.index[0]} -> {df.index[-1]}")
    print(f"  columns: {list(df.columns)}\n")

    results = []
    for include_cross in (False, True):
        for horizon in (1, 3, 5, 10):
            r = walk_forward_config(df, include_cross, horizon)
            if r:
                results.append(r)

    # Rank by how much they beat the best baseline.
    results.sort(key=lambda r: r["beat_best_baseline"], reverse=True)

    print(f"{'features':<12} {'h':>3} {'n':>4} {'model':>7} {'naive':>7} {'up':>7} {'edge':>7}")
    print("-" * 52)
    for r in results:
        print(f"{r['features']:<12} {r['horizon']:>3} {r['samples']:>4} "
              f"{r['model']*100:>6.1f}% {r['naive']*100:>6.1f}% {r['always_up']*100:>6.1f}% "
              f"{r['beat_best_baseline']*100:>+6.1f}")

    winners = [r for r in results if r["beat_best_baseline"] > 0.02]
    print("\n" + "=" * 52)
    if winners:
        print(f"HONEST RESULT: {len(winners)} config(s) beat the best baseline by >2 pts:")
        for w in winners:
            print(f"  - {w['features']} @ horizon {w['horizon']}: "
                  f"{w['model']*100:.1f}% (+{w['beat_best_baseline']*100:.1f} pts)")
    else:
        best = results[0]
        print("HONEST RESULT: NO config convincingly beat the best baseline (>2 pts).")
        print(f"  Best was {best['features']} @ h{best['horizon']}: "
              f"{best['model']*100:.1f}% vs baseline {max(best['naive'],best['always_up'])*100:.1f}%.")
        print("  Conclusion: keep the honest baseline; do NOT claim higher accuracy.")
    return 0


if __name__ == "__main__":
    import sys
    sys.exit(main())
