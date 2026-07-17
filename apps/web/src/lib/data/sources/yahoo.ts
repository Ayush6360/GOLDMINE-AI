import { config } from "@/lib/config";

/**
 * Yahoo Finance client. QUARANTINE ZONE for an undocumented endpoint (ADR-0003):
 * all Yahoo-specific fragility lives here and nowhere else. Returns plain data;
 * callers never see Yahoo's response shape.
 */

const BASE = "https://query1.finance.yahoo.com/v8/finance/chart";
const UA = "Mozilla/5.0 (compatible; PhoenixIntelligence/0.2)";

export interface YahooBar {
  date: string; // YYYY-MM-DD
  close: number;
}

async function fetchJson(url: string): Promise<unknown> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), config.fetchTimeoutMs);
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`yahoo_http_${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

/** Daily close history for a Yahoo symbol (e.g. "GC=F" for gold futures). */
export async function fetchDailyHistory(symbol: string, range = "2y"): Promise<YahooBar[]> {
  const url = `${BASE}/${encodeURIComponent(symbol)}?range=${range}&interval=1d`;
  const json = (await fetchJson(url)) as YahooChartResponse;
  const result = json?.chart?.result?.[0];
  if (!result?.timestamp || !result.indicators?.quote?.[0]?.close) {
    throw new Error("yahoo_empty_series");
  }
  const ts = result.timestamp;
  const closes = result.indicators.quote[0].close;
  const bars: YahooBar[] = [];
  for (let i = 0; i < ts.length; i++) {
    const c = closes[i];
    if (c === null || c === undefined || Number.isNaN(c)) continue; // skip gaps
    bars.push({ date: new Date(ts[i] * 1000).toISOString().slice(0, 10), close: round2(c) });
  }
  if (bars.length === 0) throw new Error("yahoo_all_gaps");
  return bars;
}

/** Latest regular-market price for a symbol. */
export async function fetchSpot(symbol: string): Promise<number> {
  const url = `${BASE}/${encodeURIComponent(symbol)}?range=5d&interval=1d`;
  const json = (await fetchJson(url)) as YahooChartResponse;
  const price = json?.chart?.result?.[0]?.meta?.regularMarketPrice;
  if (typeof price !== "number") throw new Error("yahoo_no_spot");
  return round2(price);
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

// Minimal shape of the parts of Yahoo's response we rely on.
interface YahooChartResponse {
  chart?: {
    result?: Array<{
      timestamp?: number[];
      meta?: { regularMarketPrice?: number; symbol?: string };
      indicators?: { quote?: Array<{ close?: Array<number | null> }> };
    }>;
  };
}

/** Symbols we use. Centralized so Phase 4 multi-asset just extends this map. */
export const YAHOO_SYMBOLS = {
  gold: "GC=F",
  dxy: "DX-Y.NYB",
  us10y: "^TNX",
  oil: "CL=F",
  silver: "SI=F",
  usdinr: "USDINR=X",
} as const;
