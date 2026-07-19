/**
 * Central runtime config. Reads env with safe defaults so the app runs with an
 * empty .env (keyless mode). One place to see every knob.
 */
export const config = {
  /** FRED API key — optional. Absent → macro degrades gracefully (ADR-0003). */
  fredApiKey: process.env.FRED_API_KEY ?? "",
  /** Local SQLite file location (used when no Turso URL is set — e.g. local dev). */
  dbPath: process.env.PHOENIX_DB_PATH ?? "phoenix.db",
  /**
   * Turso (libSQL) hosted DB — required on Vercel (serverless has no persistent
   * disk). If unset, we fall back to a local file so dev works with zero setup.
   */
  tursoUrl: process.env.TURSO_DATABASE_URL ?? "",
  tursoAuthToken: process.env.TURSO_AUTH_TOKEN ?? "",
  /** Master switch: use live sources + SQLite, or fall back to pure seed data. */
  useLiveData: (process.env.PHOENIX_LIVE_DATA ?? "true") !== "false",
  /** Network timeout for source fetches (ms). */
  fetchTimeoutMs: Number(process.env.PHOENIX_FETCH_TIMEOUT_MS ?? 12000),
  /** Python ML service base URL (opt-in, experimental — ADR-0005). */
  mlServiceUrl: process.env.PHOENIX_ML_URL ?? "http://127.0.0.1:8001",
  /** Anthropic API key — optional. Only used if PHOENIX_USE_CLAUDE=true (costs money). */
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  /**
   * EXPLICIT opt-in to use paid Claude for the assistant. OFF by default so a stray
   * ANTHROPIC_API_KEY in the environment can never silently bill you. Keyless
   * GroundedComposer ($0) is the default and is equally honest.
   */
  useClaude: (process.env.PHOENIX_USE_CLAUDE ?? "false") === "true",
} as const;

/** True only when Claude is BOTH explicitly enabled AND a key is present. */
export function hasAnthropic(): boolean {
  return config.useClaude && config.anthropicApiKey.trim().length > 0;
}

export function hasFred(): boolean {
  return config.fredApiKey.trim().length > 0;
}
