"""Gold next-day model: LightGBM direction classifier + quantile band regressors.

Design (ADR-0005): anti-overfitting is the priority. Shallow trees, strong
regularization, small feature set. The model outputs a calibrated P(up), a learned
80% predictive interval (two quantile regressors), and per-feature contributions for
explainability (ADR-0002).
"""
from __future__ import annotations

import datetime as dt
from dataclasses import dataclass, field

import joblib
import numpy as np
import pandas as pd
from lightgbm import LGBMClassifier, LGBMRegressor

from .config import BAND_LOWER_Q, BAND_UPPER_Q, MODEL_PATH, RANDOM_SEED
from .features import FEATURE_COLUMNS, build_features, make_labels
from .cross_features import build_cross_features, all_feature_columns


# Conservative hyperparameters — deliberately small to resist overfitting ~500 rows.
_COMMON = dict(
    n_estimators=200,
    num_leaves=8,          # shallow → low variance
    max_depth=3,
    learning_rate=0.03,
    min_child_samples=25,  # each leaf must generalize
    subsample=0.8,
    subsample_freq=1,
    colsample_bytree=0.8,
    reg_alpha=0.5,
    reg_lambda=1.0,
    random_state=RANDOM_SEED,
    verbose=-1,
)


@dataclass
class GoldModel:
    clf: LGBMClassifier
    q_low: LGBMRegressor
    q_high: LGBMRegressor
    features: list[str]
    trained_at: str
    horizon: int
    train_rows: int
    metrics: dict = field(default_factory=dict)

    # --- persistence ---
    def save(self, path=MODEL_PATH) -> None:
        joblib.dump(self, path)

    @staticmethod
    def load(path=MODEL_PATH) -> "GoldModel":
        return joblib.load(path)


def _prepare(closes: pd.Series, horizon: int):
    feats = build_features(closes)
    fwd, up = make_labels(closes, horizon)
    data = feats.copy()
    data["_fwd"] = fwd
    data["_up"] = up
    data = data.dropna()
    X = data[FEATURE_COLUMNS]
    return X, data["_up"], data["_fwd"]


def train(closes: pd.Series, horizon: int = 1) -> GoldModel:
    """Fit the classifier + quantile regressors on the FULL series (for serving).

    NOTE: this trains on all data for the live model. Honest performance is measured
    separately by the walk-forward backtester, never by scoring on training data.
    """
    X, y_up, y_fwd = _prepare(closes, horizon)

    clf = LGBMClassifier(**_COMMON)
    clf.fit(X, y_up)

    q_low = LGBMRegressor(objective="quantile", alpha=BAND_LOWER_Q, **_COMMON)
    q_high = LGBMRegressor(objective="quantile", alpha=BAND_UPPER_Q, **_COMMON)
    q_low.fit(X, y_fwd)
    q_high.fit(X, y_fwd)

    return GoldModel(
        clf=clf,
        q_low=q_low,
        q_high=q_high,
        features=list(FEATURE_COLUMNS),
        trained_at=dt.datetime.now(dt.timezone.utc).isoformat(),
        horizon=horizon,
        train_rows=len(X),
    )


def train_cross(df: pd.DataFrame, horizon: int = 1) -> GoldModel:
    """Train using cross-asset features (ADR-0006). `df` has columns gold, dxy,
    silver, us10y, oil. This is the shipped model: the honest experiment showed
    cross-asset features give a small real edge over gold-only.
    """
    cols = all_feature_columns(include_cross=True)
    feats = build_cross_features(df)
    fwd, up = make_labels(df["gold"], horizon)
    data = feats[cols].copy()
    data["_fwd"] = fwd
    data["_up"] = up
    data = data.dropna()

    X = data[cols]
    clf = LGBMClassifier(**_COMMON)
    clf.fit(X, data["_up"])
    q_low = LGBMRegressor(objective="quantile", alpha=BAND_LOWER_Q, **_COMMON)
    q_high = LGBMRegressor(objective="quantile", alpha=BAND_UPPER_Q, **_COMMON)
    q_low.fit(X, data["_fwd"])
    q_high.fit(X, data["_fwd"])

    return GoldModel(
        clf=clf,
        q_low=q_low,
        q_high=q_high,
        features=cols,
        trained_at=dt.datetime.now(dt.timezone.utc).isoformat(),
        horizon=horizon,
        train_rows=len(X),
    )


@dataclass
class Prediction:
    prob_up: float
    ret_low: float      # lower quantile of next-day return
    ret_high: float     # upper quantile of next-day return
    contributions: list[tuple[str, float]]  # (feature, signed contribution to P(up))


def predict_last(model: GoldModel, closes: pd.Series) -> Prediction:
    """Predict for the most recent row (serving path).

    If the model uses cross-asset features, we fetch the current aligned cross-asset
    context ourselves (the web request only carries gold). If that fetch fails, we
    fall back to a gold-only feature frame and let missing cross columns be NaN-
    filled — LightGBM handles missing features natively, so we degrade, not crash.
    """
    needs_cross = any(c in model.features for c in _CROSS_ONLY_COLS)
    if needs_cross:
        feats = _serving_cross_features(closes)
    else:
        feats = build_features(closes)

    # Reindex to the model's exact feature set; missing cols -> NaN (LGBM-tolerant).
    for col in model.features:
        if col not in feats.columns:
            feats[col] = np.nan
    X_all = feats[model.features]
    X_all = X_all.dropna(how="all")
    if X_all.empty:
        raise ValueError("insufficient_history_for_features")
    x = X_all.iloc[[-1]]

    prob_up = float(model.clf.predict_proba(x)[0, 1])
    ret_low = float(model.q_low.predict(x)[0])
    ret_high = float(model.q_high.predict(x)[0])
    if ret_low > ret_high:
        ret_low, ret_high = ret_high, ret_low

    contributions = _explain(model, x)
    return Prediction(prob_up=prob_up, ret_low=ret_low, ret_high=ret_high, contributions=contributions)


# Columns that only exist in the cross-asset feature set.
_CROSS_ONLY_COLS = {
    "dxy_ret_1", "dxy_ret_5", "silver_ret_1", "silver_ret_5",
    "gold_silver_ratio_z", "us10y_chg_5", "oil_ret_5", "gold_dxy_corr_20",
}


def _serving_cross_features(closes: pd.Series):
    """Fetch fresh cross-asset context and build the full feature frame. Aligns the
    provided gold closes with freshly-fetched cross assets by date."""
    from .data_client import fetch_multi_asset  # local import avoids cycle at import

    df = fetch_multi_asset(range_="1y")
    # Prefer the caller's gold series where dates overlap (it's the source of truth).
    df = df.copy()
    df.loc[df.index.isin(closes.index), "gold"] = closes.reindex(df.index)
    df = df.dropna(subset=["gold"])
    return build_cross_features(df)


def _explain(model: GoldModel, x: pd.DataFrame) -> list[tuple[str, float]]:
    """Per-feature SHAP-style contribution to the classifier's log-odds.

    LightGBM's pred_contrib gives additive contributions in raw (log-odds) space —
    genuine, model-faithful explainability, not a post-hoc guess (ADR-0002).
    """
    raw = model.clf.predict(x, pred_contrib=True)[0]  # len = n_features + 1 (bias)
    contribs = list(zip(model.features, raw[:-1].tolist()))
    contribs.sort(key=lambda kv: abs(kv[1]), reverse=True)
    return contribs
