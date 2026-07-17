import type { AnalysisResult } from "@/lib/domain/types";
import type { RetrievedContext } from "./retriever";

/**
 * Answer-generation seam (ADR-0009). Default is the keyless GroundedComposer; an
 * optional ClaudeGenerator implements the same interface when an API key is present.
 */
export interface IAnswerGenerator {
  readonly name: string;
  generate(input: AnswerInput): Promise<GeneratedAnswer>;
}

export interface AnswerInput {
  context: RetrievedContext;
  analysis: AnalysisResult; // current forecast/signals for outlook questions
  currency: "USD" | "INR";
  fmt: (usdPerOz: number) => string;
}

export interface Citation {
  label: string;
  detail: string;
  url?: string;
}

export interface GeneratedAnswer {
  answer: string;
  citations: Citation[];
  generator: string;
  /** Honest framing appended to any forecast-related answer. */
  disclaimer: string;
}
