import { config } from "@/lib/config";

/**
 * Keyless news source via RSS (ADR-0003 pattern: quarantine fragile external I/O).
 * Google News + Yahoo Finance RSS give recent, dated gold headlines at $0.
 *
 * HONESTY NOTE (ADR-0004): RSS provides RECENT news only, not a deep per-day
 * archive. Sentiment therefore sharpens the LIVE forecast; full historical
 * sentiment-backtesting requires an archive we accumulate over time or license.
 */

export interface NewsItem {
  title: string;
  url: string;
  publishedAt: string; // ISO date (best-effort from RSS pubDate)
  source: string;
}

const UA = "Mozilla/5.0 (compatible; PhoenixIntelligence/0.3)";

const FEEDS: Array<{ name: string; url: string }> = [
  { name: "google-news", url: "https://news.google.com/rss/search?q=gold+price+OR+gold+market+when:7d&hl=en-US&gl=US&ceid=US:en" },
  { name: "yahoo-gc", url: "https://feeds.finance.yahoo.com/rss/2.0/headline?s=GC=F&region=US&lang=en-US" },
];

async function fetchFeed(url: string, sourceName: string): Promise<NewsItem[]> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), config.fetchTimeoutMs);
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: ctrl.signal });
    if (!res.ok) return [];
    const xml = await res.text();
    return parseRss(xml, sourceName);
  } catch {
    return []; // degrade, don't crash
  } finally {
    clearTimeout(t);
  }
}

/** Minimal, dependency-free RSS <item> parser. */
function parseRss(xml: string, sourceName: string): NewsItem[] {
  const items: NewsItem[] = [];
  const blocks = xml.split(/<item>/i).slice(1);
  for (const block of blocks) {
    const title = clean(extract(block, "title"));
    const url = clean(extract(block, "link"));
    const pub = extract(block, "pubDate");
    if (!title) continue;
    items.push({
      title,
      url,
      publishedAt: parseDate(pub),
      source: sourceName,
    });
  }
  return items;
}

function extract(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return m ? m[1] : "";
}

function clean(s: string): string {
  return s
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function parseDate(pub: string): string {
  const d = new Date(pub);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

/** Fetch and de-duplicate recent gold headlines across feeds. */
export async function fetchGoldNews(): Promise<NewsItem[]> {
  const batches = await Promise.all(FEEDS.map((f) => fetchFeed(f.url, f.name)));
  const seen = new Set<string>();
  const out: NewsItem[] = [];
  for (const item of batches.flat()) {
    const key = item.title.toLowerCase().slice(0, 80);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}
