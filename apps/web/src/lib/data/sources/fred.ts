import { config, hasFred } from "@/lib/config";

/**
 * FRED (St. Louis Fed) client. OPTIONAL enhancement (ADR-0003): requires a free
 * key. If no key is set, callers get null and the app degrades gracefully — FRED
 * data enriches the macro picture but is never load-bearing.
 */

const BASE = "https://api.stlouisfed.org/fred/series/observations";

/** Series IDs we consume. */
export const FRED_SERIES = {
  cpiYoY: "CPIAUCSL", // CPI index; we compute YoY from it
  realYield10y: "DFII10", // 10y TIPS (real) yield
  policyRate: "FEDFUNDS", // effective federal funds rate
} as const;

export interface FredObservation {
  date: string;
  value: number;
}

async function fetchSeries(seriesId: string, limit = 400): Promise<FredObservation[] | null> {
  if (!hasFred()) return null;
  const url = `${BASE}?series_id=${seriesId}&api_key=${config.fredApiKey}&file_type=json&sort_order=desc&limit=${limit}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), config.fetchTimeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return null;
    const json = (await res.json()) as { observations?: Array<{ date: string; value: string }> };
    const obs = (json.observations ?? [])
      .filter((o) => o.value !== "." && !Number.isNaN(Number(o.value)))
      .map((o) => ({ date: o.date, value: Number(o.value) }));
    return obs.length ? obs : null;
  } catch {
    return null; // network/parse failure → graceful null
  } finally {
    clearTimeout(t);
  }
}

/** Latest value of a series, or null if unavailable. */
export async function fetchLatest(seriesId: string): Promise<FredObservation | null> {
  const obs = await fetchSeries(seriesId, 2);
  return obs?.[0] ?? null;
}

/** Latest CPI year-over-year %, computed from the CPI index series. */
export async function fetchCpiYoY(): Promise<number | null> {
  const obs = await fetchSeries(FRED_SERIES.cpiYoY, 14); // ~13 months + buffer
  if (!obs || obs.length < 13) return null;
  const latest = obs[0].value;
  const yearAgo = obs[12].value; // desc order → index 12 is 12 months earlier
  if (!yearAgo) return null;
  return Math.round(((latest - yearAgo) / yearAgo) * 1000) / 10;
}
