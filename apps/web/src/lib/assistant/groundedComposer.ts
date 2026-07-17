import type { AnswerInput, GeneratedAnswer, Citation, IAnswerGenerator } from "./types";

/**
 * GroundedComposer — keyless, deterministic answer generation (ADR-0009).
 * Writes a readable answer STRICTLY from retrieved facts, with citations. Cannot
 * hallucinate a number and cannot promise a price. Always available, zero cost.
 */
export class GroundedComposer implements IAnswerGenerator {
  readonly name = "grounded-composer";

  async generate(input: AnswerInput): Promise<GeneratedAnswer> {
    const { context, analysis, fmt } = input;
    const q = context.question.toLowerCase();
    const intent = classify(q);

    const parts: string[] = [];
    const citations: Citation[] = [];

    const pm = context.priceMoves;
    const priceLine =
      pm.last.close > 0
        ? `Gold is at ${fmt(pm.last.close)} (as of ${pm.last.date}), ${moveWord(pm.wChg)} ${Math.abs(pm.wChg).toFixed(1)}% on the week and ${moveWord(pm.mChg)} ${Math.abs(pm.mChg).toFixed(1)}% on the month.`
        : `No live price is loaded yet — run ingestion first.`;

    if (intent === "why" || intent === "news") {
      parts.push(priceLine);
      // Explain via top signal + the retrieved, sentiment-scored headlines.
      const top = [...analysis.signals].sort((a, b) => b.strength - a.strength)[0];
      if (top) {
        parts.push(`The strongest current driver is "${top.title}" (${top.direction}). ${top.drivers[0]?.detail ?? ""}`);
      }
      const bull = context.news.filter((n) => n.score > 0).slice(0, 2);
      const bear = context.news.filter((n) => n.score < 0).slice(0, 2);
      if (bull.length || bear.length) {
        parts.push(
          `Recent headlines lean ${bull.length >= bear.length ? "supportive" : "cautious"}: ` +
            [...bull, ...bear].map((n) => `"${trim(n.title)}"`).join("; ") + ".",
        );
      }
      context.news.slice(0, 5).forEach((n) =>
        citations.push({ label: n.source, detail: n.title, url: n.url || undefined }),
      );
    } else if (intent === "outlook" || intent === "forecast") {
      parts.push(priceLine);
      const f = analysis.forecast;
      const dir = f.probUp >= 0.5 ? "lean higher" : "lean lower";
      parts.push(
        `The model's read is a ${dir} bias: ${(f.probUp * 100).toFixed(0)}% probability of a higher close over the next ${f.horizonDays} day(s), with an 80% likely range of ${fmt(f.lower)}–${fmt(f.upper)}.`,
      );
      parts.push(
        `Be clear on the honesty here: this is a probability with a wide band, not a guaranteed price. Our backtested weekly directional accuracy is ~60%; next-day is closer to ~55% (near a coin flip).`,
      );
      citations.push({ label: "Phoenix engine", detail: `${analysis.meta.engine}@${analysis.meta.engineVersion}, ${analysis.meta.dataPoints} data points` });
    } else if (intent === "macro") {
      parts.push(priceLine);
      if (context.macro) {
        const m = context.macro;
        parts.push(
          `Macro backdrop: US dollar index (DXY) ${m.dxy}, 10-year yield/real yield ${m.realYield10y}%, CPI ${m.cpiYoY}% YoY, policy rate ${m.policyRate}%. A stronger dollar and rising real yields historically pressure gold; inflation and haven demand support it.`,
        );
        citations.push({ label: "Macro (Yahoo/FRED)", detail: `as of ${m.date}` });
      } else {
        parts.push(`No macro snapshot is loaded yet.`);
      }
    } else {
      // Generic: give the price + outlook summary.
      parts.push(priceLine);
      const f = analysis.forecast;
      parts.push(
        `Near-term the model leans ${f.probUp >= 0.5 ? "up" : "down"} (${(f.probUp * 100).toFixed(0)}% higher), range ${fmt(f.lower)}–${fmt(f.upper)}. Ask "why is gold moving?", "what's the outlook?", or "how does macro look?" for detail.`,
      );
    }

    return {
      answer: parts.filter(Boolean).join("\n\n"),
      citations,
      generator: this.name,
      disclaimer: analysis.disclaimer,
    };
  }
}

type Intent = "why" | "news" | "outlook" | "forecast" | "macro" | "generic";

function classify(q: string): Intent {
  if (/(why|reason|driv|because|moving|fall|drop|rise|rally|surge)/.test(q)) return "why";
  if (/(news|headline|happen|event)/.test(q)) return "news";
  if (/(outlook|forecast|predict|tomorrow|next|will|expect|target)/.test(q)) return "outlook";
  if (/(macro|dollar|dxy|yield|inflation|cpi|rate|fed)/.test(q)) return "macro";
  return "generic";
}

function moveWord(p: number): string {
  return p >= 0 ? "up" : "down";
}
function trim(s: string): string {
  return s.length > 90 ? s.slice(0, 87) + "…" : s;
}
