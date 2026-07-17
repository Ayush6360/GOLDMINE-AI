import { NextResponse } from "next/server";
import { answerQuestion } from "@/lib/assistant/assistantProvider";
import type { Currency } from "@/lib/currency";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const b = body as { question?: string; currency?: string };
  const question = (b.question ?? "").trim();
  if (!question || question.length > 500) {
    return NextResponse.json({ error: "invalid_question" }, { status: 422 });
  }
  const currency: Currency = b.currency === "INR" ? "INR" : "USD";

  try {
    const result = await answerQuestion(question, currency);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "assistant_failed" }, { status: 500 });
  }
}
