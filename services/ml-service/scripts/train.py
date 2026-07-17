"""Train the gold model and run the honest walk-forward backtest.

Usage (from services/ml-service, venv active):
    python -m scripts.train            # fetch data, backtest, train, save
    python -m scripts.train --no-save  # backtest only

This is the honesty gate: it prints ML vs naive vs always-up on a causal
walk-forward, then bakes those metrics into the saved model (ADR-0004/0005).
"""
from __future__ import annotations

import argparse
import json
import sys

from app.backtest import walk_forward
from app.data_client import fetch_gold_history, fetch_multi_asset
from app.model import train, train_cross
from scripts.experiment import walk_forward_config


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--no-save", action="store_true", help="backtest only, don't persist")
    parser.add_argument("--test-days", type=int, default=250)
    parser.add_argument("--min-train", type=int, default=250)
    parser.add_argument("--horizon", type=int, default=1)
    parser.add_argument("--gold-only", action="store_true", help="use gold-only features (legacy)")
    args = parser.parse_args()

    if args.gold_only:
        return _train_gold_only(args)

    print("Fetching multi-asset history (gold + DXY + silver + 10y + oil)...")
    df = fetch_multi_asset(range_="2y")
    print(f"  {len(df)} aligned rows, {df.index[0]} -> {df.index[-1]}, last gold=${df['gold'].iloc[-1]:.2f}")

    print("\nWalk-forward backtest (cross-asset, honest, causal)...")
    metrics = walk_forward_config(df, include_cross=True, horizon=args.horizon,
                                  min_train=args.min_train, test_days=args.test_days)
    print(json.dumps(metrics, indent=2))
    edge = metrics["beat_best_baseline"]
    print(f"\nHonest edge vs best baseline: {edge*100:+.1f} pts "
          f"({'ship-worthy' if edge > 0.02 else 'marginal — keep expectations low'}).")

    if args.no_save:
        print("\n--no-save: skipping persistence.")
        return 0

    print("\nTraining live cross-asset model on full history...")
    model = train_cross(df, horizon=args.horizon)
    model.metrics = metrics
    model.save()
    print(f"  Saved model trained_at={model.trained_at} on {model.train_rows} rows, "
          f"{len(model.features)} features.")
    return 0


def _train_gold_only(args) -> int:
    print("Fetching gold history (Yahoo GC=F)...")
    closes = fetch_gold_history(range_="2y")
    print(f"  {len(closes)} closes, last=${closes.iloc[-1]:.2f}")
    metrics = walk_forward(closes, horizon=args.horizon, min_train=args.min_train, test_days=args.test_days)
    print(json.dumps(metrics, indent=2))
    if args.no_save:
        return 0
    model = train(closes, horizon=args.horizon)
    model.metrics = metrics
    model.save()
    print(f"  Saved gold-only model on {model.train_rows} rows.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
