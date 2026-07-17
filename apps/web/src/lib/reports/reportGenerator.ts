import type { AnalysisResult, MacroSnapshot, PricePoint } from "@/lib/domain/types";
import type { SentimentResult } from "@/lib/features/sentiment";
import { convertGoldPrice, formatPrice, viewFor, type Currency } from "@/lib/currency";

/**
 * Data-driven report generator (ADR-0007). Composes REAL figures into readable prose
 * via deterministic templates — every number traces to data, nothing invented. An
 * LLM writer can layer on later, but the FACTS always come from here.
 */

export interface ReportInput {
  series: PricePoint[]; // ascending, USD/oz
  analysis: AnalysisResult;
  sentiment: SentimentResult;
  macro: MacroSnapshot;
  currency: Currency;
  usdInr: number;
}

export interface Report {
  title: string;
  asOf: string;
  currency: Currency;
  sections: Array<{ heading: string; body: string }>;
  bullets: string[];
  disclaimer: string;
}

export function generateReport(input: ReportInput): Report {
  const { series, analysis, sentiment, macro, currency, usdInr } = input;
  const view = viewFor(currency);
  const fmt = (usd: number) => formatPrice(convertGoldPrice(usd, currency, usdInr), view);

  const last = series[series.length - 1];
  const weekAgo = series[Math.max(0, series.length - 6)];
  const monthAgo = series[Math.max(0, series.length - 22)];
  const wChg = pct(last.close, weekAgo.close);
  const mChg = pct(last.close, monthAgo.close);

  const dir = analysis.forecast.probUp >= 0.5 ? "lean higher" : "lean lower";
  const topSignal = [...analysis.signals].sort((a, b) => b.strength - a.strength)[0];

  const sections = [
    {
      heading: "Where gold stands",
      body:
        `Gold is trading at ${fmt(last.close)} ${view.unitLabel} as of ${last.date}. ` +
        `Over the past week it has ${moveWord(wChg)} ${Math.abs(wChg).toFixed(1)}%, and over the past month ` +
        `${moveWord(mChg)} ${Math.abs(mChg).toFixed(1)}%. ` +
        (currency === "INR"
          ? `(Converted at USD/INR ${usdInr.toFixed(2)}.)`
          : ``),
    },
    {
      heading: "The next-day read",
      body:
        `Our model puts the probability of a higher close tomorrow at ${(analysis.forecast.probUp * 100).toFixed(0)}%, ` +
        `so the near-term bias is to ${dir}. The 80% likely range is ${fmt(analysis.forecast.lower)}–${fmt(analysis.forecast.upper)}. ` +
        `This is a probability with a wide band, not a guarantee — daily gold is close to a random walk and our honest ` +
        `directional accuracy is around 55%.`,
    },
    {
      heading: "What's driving it",
      body:
        (topSignal
          ? `The strongest current signal is "${topSignal.title}" (${topSignal.direction}). ` +
            (topSignal.drivers[0] ? topSignal.drivers[0].detail + " " : "")
          : ``) +
        `News sentiment across ${sentiment.scoredCount} gold-relevant headlines is ${sentimentWord(sentiment.net)} ` +
        `(net ${sentiment.net.toFixed(2)}). Macro backdrop: DXY ${macro.dxy}, 10y real yield ${macro.realYield10y}%, ` +
        `CPI ${macro.cpiYoY}% YoY, policy rate ${macro.policyRate}%.`,
    },
  ];

  const bullets = [
    `Spot: ${fmt(last.close)} ${view.unitLabel} (as of ${last.date})`,
    `Week: ${sign(wChg)}${wChg.toFixed(1)}% · Month: ${sign(mChg)}${mChg.toFixed(1)}%`,
    `Tomorrow: ${(analysis.forecast.probUp * 100).toFixed(0)}% chance higher · range ${fmt(analysis.forecast.lower)}–${fmt(analysis.forecast.upper)}`,
    `Sentiment: ${sentimentWord(sentiment.net)} (${sentiment.scoredCount} headlines)`,
  ];

  return {
    title: "Phoenix Gold — Daily Intelligence Digest",
    asOf: last.date,
    currency,
    sections,
    bullets,
    disclaimer: analysis.disclaimer,
  };
}

function pct(now: number, then: number): number {
  return then === 0 ? 0 : ((now - then) / then) * 100;
}
function moveWord(p: number): string {
  return p >= 0 ? "risen" : "fallen";
}
function sign(p: number): string {
  return p >= 0 ? "+" : "";
}
function sentimentWord(net: number): string {
  if (net > 0.15) return "leaning bullish";
  if (net < -0.15) return "leaning bearish";
  return "broadly neutral";
}
