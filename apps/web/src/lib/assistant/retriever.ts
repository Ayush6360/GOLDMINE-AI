import { dbGet, dbAll } from "@/lib/data/db";
import type { MacroSnapshot, PricePoint } from "@/lib/domain/types";

/**
 * Retriever for the RAG assistant (ADR-0009). Pulls the most relevant context from
 * Phoenix's OWN ingested data for a user question: news headlines (keyword + recency
 * scored), recent price moves, and the macro snapshot. No external calls.
 */

export interface RetrievedNews {
  title: string;
  url: string;
  publishedAt: string;
  source: string;
  score: number; // gold-sentiment score stored at ingest
  relevance: number; // query relevance (keyword overlap + recency)
}

export interface RetrievedContext {
  news: RetrievedNews[];
  priceMoves: { last: PricePoint; weekAgo: PricePoint; monthAgo: PricePoint; wChg: number; mChg: number };
  macro: MacroSnapshot | null;
  question: string;
}

// Words that carry no topical signal — ignored in keyword matching.
const STOP = new Set([
  "the", "a", "an", "is", "are", "was", "were", "of", "to", "in", "on", "for", "and",
  "or", "why", "what", "how", "will", "does", "do", "gold", "price", "prices", "me",
  "tell", "about", "today", "now", "this", "that", "it", "its",
]);

export async function retrieve(question: string, opts?: { newsLimit?: number }): Promise<RetrievedContext> {
  const newsLimit = opts?.newsLimit ?? 6;
  const terms = tokenize(question);

  const [news, priceMoves, macro] = await Promise.all([
    retrieveNews(terms, newsLimit),
    retrievePriceMoves(),
    retrieveMacro(),
  ]);

  return { news, priceMoves, macro, question };
}

function tokenize(q: string): string[] {
  return q
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
}

async function retrieveNews(terms: string[], limit: number): Promise<RetrievedNews[]> {
  let rows: NewsRow[] = [];
  try {
    rows = await dbAll<NewsRow>(
      `SELECT title, url, published_at, source, score FROM news ORDER BY published_at DESC LIMIT 200`,
    );
  } catch {
    return [];
  }
  const now = Date.now();
  const scored = rows.map((r) => {
    const titleLower = r.title.toLowerCase();
    const overlap = terms.reduce((acc, t) => (titleLower.includes(t) ? acc + 1 : acc), 0);
    const ageDays = Math.max(0, (now - Date.parse(r.published_at)) / 86400000);
    const recency = Math.exp(-ageDays / 7); // decay over ~a week
    // Relevance: keyword overlap dominates; recency + |sentiment| break ties.
    const relevance = overlap * 2 + recency + Math.abs(r.score) * 0.3;
    return {
      title: r.title,
      url: r.url,
      publishedAt: r.published_at,
      source: r.source,
      score: r.score,
      relevance,
    };
  });
  // If the question had terms, prefer matches; else fall back to recent + salient.
  scored.sort((a, b) => b.relevance - a.relevance);
  return scored.slice(0, limit);
}

async function retrievePriceMoves(): Promise<RetrievedContext["priceMoves"]> {
  const rows = await dbAll<{ date: string; close: number }>(
    `SELECT date, close FROM prices WHERE asset='gold' ORDER BY date DESC LIMIT 25`,
  );
  if (rows.length === 0) {
    const empty = { date: "n/a", close: 0 };
    return { last: empty, weekAgo: empty, monthAgo: empty, wChg: 0, mChg: 0 };
  }
  const asc = rows.reverse();
  const last = asc[asc.length - 1];
  const weekAgo = asc[Math.max(0, asc.length - 6)];
  const monthAgo = asc[0];
  const pct = (a: number, b: number) => (b === 0 ? 0 : ((a - b) / b) * 100);
  return {
    last: { date: last.date, close: last.close },
    weekAgo: { date: weekAgo.date, close: weekAgo.close },
    monthAgo: { date: monthAgo.date, close: monthAgo.close },
    wChg: pct(last.close, weekAgo.close),
    mChg: pct(last.close, monthAgo.close),
  };
}

async function retrieveMacro(): Promise<MacroSnapshot | null> {
  try {
    const get = async (ind: string): Promise<number | null> => {
      const r = await dbGet<{ value: number }>(
        `SELECT value FROM macro WHERE indicator=? ORDER BY date DESC LIMIT 1`,
        [ind],
      );
      return r ? r.value : null;
    };
    const dxy = await get("dxy");
    if (dxy === null) return null;
    return {
      date: new Date().toISOString().slice(0, 10),
      dxy,
      realYield10y: (await get("real_yield_10y")) ?? (await get("us10y_nominal")) ?? 0,
      cpiYoY: (await get("cpi_yoy")) ?? 0,
      policyRate: (await get("policy_rate")) ?? 0,
    };
  } catch {
    return null;
  }
}

interface NewsRow {
  title: string;
  url: string;
  published_at: string;
  source: string;
  score: number;
}
