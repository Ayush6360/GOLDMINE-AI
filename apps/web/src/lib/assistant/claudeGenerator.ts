import Anthropic from "@anthropic-ai/sdk";
import type { AnswerInput, Citation, GeneratedAnswer, IAnswerGenerator } from "./types";

/**
 * ClaudeGenerator — OPTIONAL LLM answer generation (ADR-0009). Used only when
 * ANTHROPIC_API_KEY is set. Claude is given ONLY the retrieved context and a locked
 * system prompt forbidding invented numbers and price guarantees. If it errors, the
 * caller falls back to the keyless GroundedComposer (degrade, don't crash).
 */
const SYSTEM_PROMPT = `You are Phoenix, a gold-market intelligence assistant.

STRICT RULES (never violate):
- Use ONLY the data in the provided context. Never invent numbers, prices, or facts.
- Never promise or guarantee a future price. Gold is uncertain; speak in probabilities.
- When discussing the forecast, state it is probabilistic with a wide band, and note
  the honest accuracy: ~60% weekly / ~55% next-day directional (near a coin flip).
- Cite the data you use (headlines, price dates, macro figures).
- Be concise, factual, and neutral. This is informational analysis, not financial advice.
- If the context lacks the answer, say so plainly rather than speculating.`;

export class ClaudeGenerator implements IAnswerGenerator {
  readonly name = "claude-opus-4-8";
  private readonly client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async generate(input: AnswerInput): Promise<GeneratedAnswer> {
    const { context, analysis, fmt } = input;
    const contextText = this.buildContext(input);

    const message = await this.client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `CONTEXT (the only facts you may use):\n${contextText}\n\nQUESTION: ${context.question}`,
        },
      ],
    });

    const answer = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    const citations: Citation[] = context.news
      .slice(0, 5)
      .map((n) => ({ label: n.source, detail: n.title, url: n.url || undefined }));
    citations.push({
      label: "Phoenix engine",
      detail: `${analysis.meta.engine}@${analysis.meta.engineVersion}`,
    });

    return { answer, citations, generator: this.name, disclaimer: analysis.disclaimer };
  }

  /** Assemble the retrieved facts into a compact, model-readable context block. */
  private buildContext(input: AnswerInput): string {
    const { context, analysis, fmt, currency } = input;
    const pm = context.priceMoves;
    const lines: string[] = [];

    lines.push(`Gold spot: ${fmt(pm.last.close)} (${currency}) as of ${pm.last.date}.`);
    lines.push(`Week change: ${pm.wChg.toFixed(1)}%. Month change: ${pm.mChg.toFixed(1)}%.`);
    const f = analysis.forecast;
    lines.push(
      `Forecast (${f.horizonDays}d): P(up)=${(f.probUp * 100).toFixed(0)}%, band ${fmt(f.lower)}–${fmt(f.upper)}, confidence ${(f.confidence * 100).toFixed(0)}%.`,
    );
    if (context.macro) {
      const m = context.macro;
      lines.push(`Macro: DXY ${m.dxy}, 10y ${m.realYield10y}%, CPI ${m.cpiYoY}%, policy rate ${m.policyRate}%.`);
    }
    lines.push("Top signals:");
    for (const s of analysis.signals.slice(0, 4)) {
      lines.push(`- ${s.title}: ${s.direction} (${s.drivers[0]?.detail ?? ""})`);
    }
    if (context.news.length) {
      lines.push("Recent gold headlines:");
      for (const n of context.news.slice(0, 8)) {
        lines.push(`- [${n.publishedAt}] ${n.title}`);
      }
    }
    return lines.join("\n");
  }
}
