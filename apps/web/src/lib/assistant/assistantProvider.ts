import { config, hasAnthropic } from "@/lib/config";
import { engine, macroRepo, priceRepo } from "@/lib/container";
import { fxRateUsdInr } from "@/lib/data/cachedRepository";
import { getLiveSentiment } from "@/lib/data/sentimentProvider";
import { convertGoldPrice, formatPrice, viewFor, type Currency } from "@/lib/currency";
import { retrieve } from "./retriever";
import { GroundedComposer } from "./groundedComposer";
import { ClaudeGenerator } from "./claudeGenerator";
import type { GeneratedAnswer, IAnswerGenerator } from "./types";

/**
 * Answers a user question via RAG (ADR-0009): retrieve context from our own data,
 * then generate a grounded answer. Uses Claude if a key is set, else the keyless
 * grounded composer. Claude failures fall back to the composer — degrade, don't crash.
 */
export async function answerQuestion(
  question: string,
  currency: Currency = "USD",
): Promise<GeneratedAnswer & { retrievedNews: number }> {
  const [series, macro] = await Promise.all([
    priceRepo.getSeries("gold", 120),
    macroRepo.getLatest(),
  ]);
  const { result: sentiment } = await getLiveSentiment();
  const analysis = await engine.analyze({ asset: "gold", series, macro, horizonDays: 5, sentiment });

  const context = retrieve(question);
  const fx = fxRateUsdInr();
  const view = viewFor(currency);
  const fmt = (usd: number) => formatPrice(convertGoldPrice(usd, currency, fx.rate), view);

  const input = { context, analysis, currency, fmt };

  const composer = new GroundedComposer();
  let generator: IAnswerGenerator = composer;
  if (hasAnthropic()) {
    generator = new ClaudeGenerator(config.anthropicApiKey);
  }

  let result: GeneratedAnswer;
  try {
    result = await generator.generate(input);
  } catch {
    // LLM path failed → fall back to the keyless grounded composer.
    result = await composer.generate(input);
  }

  return { ...result, retrievedNews: context.news.length };
}
