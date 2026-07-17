"""Gold price data client. Mirrors apps/web/src/lib/data/sources/yahoo.ts so both
engines train/serve on identical data (Yahoo Finance GC=F, keyless — ADR-0003).
"""
from __future__ import annotations

import httpx
import pandas as pd

BASE = "https://query1.finance.yahoo.com/v8/finance/chart"
UA = "Mozilla/5.0 (compatible; PhoenixIntelligence/0.4)"
GOLD_SYMBOL = "GC=F"


def fetch_gold_history(symbol: str = GOLD_SYMBOL, range_: str = "2y", timeout: float = 15.0) -> pd.Series:
    """Return a pandas Series of daily closes indexed by date string (ascending)."""
    url = f"{BASE}/{symbol}?range={range_}&interval=1d"
    with httpx.Client(timeout=timeout, headers={"User-Agent": UA}) as client:
        resp = client.get(url)
        resp.raise_for_status()
        data = resp.json()
    result = data["chart"]["result"][0]
    ts = result["timestamp"]
    closes = result["indicators"]["quote"][0]["close"]

    rows = []
    for t, c in zip(ts, closes):
        if c is None:
            continue
        date = pd.to_datetime(t, unit="s").strftime("%Y-%m-%d")
        rows.append((date, float(c)))

    if not rows:
        raise ValueError("yahoo_empty_series")
    s = pd.Series({d: c for d, c in rows}, name="close")
    s.index.name = "date"
    return s.sort_index()
