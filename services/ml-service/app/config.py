"""Runtime config for the ML service. Env-driven with safe defaults."""
from __future__ import annotations

import os
from pathlib import Path

# Where trained model artifacts live.
MODEL_DIR = Path(os.environ.get("PHOENIX_MODEL_DIR", Path(__file__).parent.parent / "models"))
MODEL_DIR.mkdir(parents=True, exist_ok=True)

MODEL_PATH = MODEL_DIR / "gold_next_day.joblib"

# Reproducibility: fixed seed everywhere (ADR-0005 §6).
RANDOM_SEED = 42

# Feature window / training guards.
MIN_TRAIN_ROWS = 120        # need enough history before first prediction
DEFAULT_HORIZON = 1         # next-day
BAND_LOWER_Q = 0.10         # 80% interval bounds
BAND_UPPER_Q = 0.90

SERVICE_NAME = "phoenix-ml"
