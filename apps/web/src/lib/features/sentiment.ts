import type { NewsItem } from "@/lib/data/sources/news";

/**
 * Gold-tuned lexicon sentiment (ADR-0002: explainable, not a black box).
 *
 * Crucially, sentiment here is oriented toward GOLD PRICE, not generic positivity.
 * "Rate cut", "weak dollar", "recession fear", "safe haven" are BULLISH for gold.
 * "Rate hike", "strong dollar", "risk-on rally" are BEARISH for gold. This domain
 * orientation is the whole point — generic sentiment would be noise.
 *
 * A lexicon is the honest v0.3 choice: transparent, auditable, zero-cost, no model
 * to overfit. An LLM/transformer scorer can replace this behind the same interface
 * later IF the backtest shows lexicon sentiment adds value first (ADR-0004).
 */

interface Phrase {
  pattern: RegExp;
  weight: number; // + bullish for gold, - bearish
  label: string;
}

const PHRASES: Phrase[] = [
  // Monetary policy — dominant gold driver
  { pattern: /\brate cut|rate cuts|cutting rates|dovish|easing\b/i, weight: 2, label: "dovish policy (bullish gold)" },
  { pattern: /\brate hike|rate hikes|hawkish|tightening|raise rates\b/i, weight: -2, label: "hawkish policy (bearish gold)" },
  // Dollar
  { pattern: /\bweak dollar|dollar falls|dollar slips|softer dollar\b/i, weight: 1.5, label: "weaker dollar (bullish gold)" },
  { pattern: /\bstrong dollar|dollar rises|dollar surges|dollar rally\b/i, weight: -1.5, label: "stronger dollar (bearish gold)" },
  // Risk / safe-haven
  { pattern: /\bsafe haven|safe-haven|geopolit|war|conflict|tension|crisis|uncertainty\b/i, weight: 1.5, label: "risk/haven demand (bullish gold)" },
  { pattern: /\brisk-on|risk appetite|stocks rally|equities surge\b/i, weight: -1, label: "risk-on (bearish gold)" },
  // Inflation
  { pattern: /\binflation|cpi rises|price pressures|stagflation\b/i, weight: 1, label: "inflation (bullish gold)" },
  { pattern: /\bdisinflation|inflation cools|inflation eases\b/i, weight: -0.5, label: "cooling inflation (mildly bearish gold)" },
  // Direct price language
  { pattern: /\bgold (surges|soars|jumps|rallies|climbs|hits record|record high)\b/i, weight: 1.5, label: "gold strength" },
  { pattern: /\bgold (falls|drops|slides|tumbles|nosedives|plunges|sinks)\b/i, weight: -1.5, label: "gold weakness" },
  { pattern: /\brecord high|all-time high\b/i, weight: 1, label: "record high" },
  // Demand
  { pattern: /\bcentral bank (buying|demand)|reserves|etf inflows\b/i, weight: 1, label: "central-bank/ETF demand (bullish gold)" },
  { pattern: /\boutflows|selloff|profit-taking\b/i, weight: -1, label: "outflows/selling (bearish gold)" },
];

export interface HeadlineScore {
  title: string;
  score: number;
  matched: string[];
}

export interface SentimentResult {
  /** Net sentiment in [-1, 1], gold-oriented. */
  net: number;
  /** Count of headlines that carried any signal. */
  scoredCount: number;
  totalCount: number;
  bullishTop: HeadlineScore[];
  bearishTop: HeadlineScore[];
}

function scoreHeadline(title: string): HeadlineScore {
  let score = 0;
  const matched: string[] = [];
  for (const p of PHRASES) {
    if (p.pattern.test(title)) {
      score += p.weight;
      matched.push(p.label);
    }
  }
  return { title, score, matched };
}

export function analyzeSentiment(news: NewsItem[]): SentimentResult {
  const scored = news.map((n) => scoreHeadline(n.title));
  const withSignal = scored.filter((s) => s.matched.length > 0);

  // Aggregate: average of per-headline scores, squashed to [-1, 1] via tanh-like.
  const raw = withSignal.reduce((a, s) => a + s.score, 0) / Math.max(withSignal.length, 1);
  const net = clamp(Math.tanh(raw / 2), -1, 1);

  const bySignal = [...withSignal].sort((a, b) => b.score - a.score);
  return {
    net: round3(net),
    scoredCount: withSignal.length,
    totalCount: news.length,
    bullishTop: bySignal.filter((s) => s.score > 0).slice(0, 3),
    bearishTop: bySignal.filter((s) => s.score < 0).slice(-3).reverse(),
  };
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}
function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}
