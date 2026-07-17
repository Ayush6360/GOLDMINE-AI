/**
 * Central runtime config. Reads env with safe defaults so the app runs with an
 * empty .env (keyless mode). One place to see every knob.
 */
export const config = {
  /** FRED API key — optional. Absent → macro degrades gracefully (ADR-0003). */
  fredApiKey: process.env.FRED_API_KEY ?? "",
  /** SQLite file location. */
  dbPath: process.env.PHOENIX_DB_PATH ?? "phoenix.db",
  /** Master switch: use live sources + SQLite, or fall back to pure seed data. */
  useLiveData: (process.env.PHOENIX_LIVE_DATA ?? "true") !== "false",
  /** Network timeout for source fetches (ms). */
  fetchTimeoutMs: Number(process.env.PHOENIX_FETCH_TIMEOUT_MS ?? 12000),
  /** Python ML service base URL (opt-in, experimental — ADR-0005). */
  mlServiceUrl: process.env.PHOENIX_ML_URL ?? "http://127.0.0.1:8001",
} as const;

export function hasFred(): boolean {
  return config.fredApiKey.trim().length > 0;
}
