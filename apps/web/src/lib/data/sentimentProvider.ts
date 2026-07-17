import { db } from "@/lib/data/db";
import { fetchGoldNews, type NewsItem } from "@/lib/data/sources/news";
import { analyzeSentiment, type SentimentResult } from "@/lib/features/sentiment";

/**
 * Sentiment provider: fetch recent gold news → score (gold-oriented lexicon) →
 * persist to SQLite (archive grows for future backtesting) → return the aggregate.
 * Degrades gracefully: no news → neutral sentiment, never an error (ADR-0003/0004).
 */
export async function getLiveSentiment(): Promise<{ result: SentimentResult; items: NewsItem[] }> {
  let items: NewsItem[] = [];
  try {
    items = await fetchGoldNews();
  } catch {
    items = [];
  }
  const result = analyzeSentiment(items);
  persistNews(items, result);
  return { result, items };
}

function persistNews(items: NewsItem[], result: SentimentResult): void {
  if (items.length === 0) return;
  try {
    const database = db();
    const now = new Date().toISOString();
    // Build a per-title score map from the scorer for storage.
    const scoreOf = new Map<string, number>();
    for (const h of [...result.bullishTop, ...result.bearishTop]) scoreOf.set(h.title, h.score);
    const stmt = database.prepare(
      `INSERT INTO news (url, title, published_at, source, score, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(url) DO UPDATE SET score = excluded.score, fetched_at = excluded.fetched_at`,
    );
    for (const it of items) {
      const url = it.url || `notitle:${it.title.slice(0, 60)}`;
      stmt.run(url, it.title, it.publishedAt, it.source, scoreOf.get(it.title) ?? 0, now);
    }
  } catch {
    // persistence is best-effort; sentiment still returns
  }
}
