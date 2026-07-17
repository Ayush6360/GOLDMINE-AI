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
from app.data_client import fetch_gold_history
from app.model import train


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--no-save", action="store_true", help="backtest only, don't persist")
    parser.add_argument("--test-days", type=int, default=250)
    parser.add_argument("--min-train", type=int, default=250)
    parser.add_argument("--horizon", type=int, default=1)
    args = parser.parse_args()

    print("Fetching gold history (Yahoo GC=F)...")
    closes = fetch_gold_history(range_="2y")
    print(f"  {len(closes)} daily closes, {closes.index[0]} -> {closes.index[-1]}, last=${closes.iloc[-1]:.2f}")

    print("\nRunning walk-forward backtest (honest, causal)...")
    metrics = walk_forward(
        closes,
        horizon=args.horizon,
        min_train=args.min_train,
        test_days=args.test_days,
    )
    print(json.dumps(metrics, indent=2))
    print("\nVERDICT:", metrics["verdict"])

    if args.no_save:
        print("\n--no-save: skipping model persistence.")
        return 0

    print("\nTraining live model on full history...")
    model = train(closes, horizon=args.horizon)
    model.metrics = metrics
    model.save()
    print(f"  Saved model trained_at={model.trained_at} on {model.train_rows} rows.")
    print("  Model artifact ready for the FastAPI service.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
