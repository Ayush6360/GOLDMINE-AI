"use client";

import { useState } from "react";
import type { Currency } from "@/lib/currency";

interface Citation {
  label: string;
  detail: string;
  url?: string;
}
interface AnswerResponse {
  answer: string;
  citations: Citation[];
  generator: string;
  disclaimer: string;
  retrievedNews: number;
}

const SUGGESTIONS = [
  "Why is gold moving?",
  "What's the outlook for this week?",
  "How does the macro backdrop look?",
];

export function Assistant({ currency }: { currency: Currency }) {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState<AnswerResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function ask(q: string) {
    const query = q.trim();
    if (!query || loading) return;
    setLoading(true);
    setError(null);
    setAnswer(null);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: query, currency }),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      setAnswer((await res.json()) as AnswerResponse);
    } catch {
      setError("Couldn't get an answer. Is the data ingested? Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl bg-phoenix-panel/70 p-5 ring-1 ring-white/5">
      <div className="flex items-center gap-2">
        <span className="text-lg">💬</span>
        <h2 className="text-lg font-medium">Ask Phoenix</h2>
      </div>
      <p className="mt-1 text-xs text-phoenix-muted">
        Grounded in Phoenix&apos;s own data — cited, never a guarantee.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void ask(question);
        }}
        className="mt-3 flex gap-2"
      >
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask about gold…"
          maxLength={500}
          className="flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-slate-100 placeholder:text-phoenix-muted focus:border-phoenix-gold/50 focus:outline-none"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-phoenix-gold px-4 py-2 text-sm font-medium text-black transition hover:bg-phoenix-gold/90 disabled:opacity-50"
        >
          {loading ? "…" : "Ask"}
        </button>
      </form>

      <div className="mt-2 flex flex-wrap gap-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => {
              setQuestion(s);
              void ask(s);
            }}
            className="rounded-full bg-white/5 px-2.5 py-1 text-xs text-phoenix-muted transition hover:text-slate-200"
          >
            {s}
          </button>
        ))}
      </div>

      {error && <p className="mt-3 text-xs text-rose-400">{error}</p>}

      {answer && (
        <div className="mt-4 rounded-lg bg-black/20 p-4">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-200">{answer.answer}</p>
          {answer.citations.length > 0 && (
            <div className="mt-3 border-t border-white/10 pt-3">
              <div className="text-xs font-medium text-phoenix-muted">Sources</div>
              <ul className="mt-1 space-y-1">
                {answer.citations.map((c, i) => (
                  <li key={i} className="text-xs text-phoenix-muted">
                    <span className="text-slate-300">{c.label}:</span>{" "}
                    {c.url ? (
                      <a href={c.url} target="_blank" rel="noreferrer" className="text-phoenix-gold hover:underline">
                        {c.detail}
                      </a>
                    ) : (
                      c.detail
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="mt-3 text-[11px] text-phoenix-muted">
            via {answer.generator} · {answer.retrievedNews} headlines retrieved
          </p>
        </div>
      )}
    </div>
  );
}
