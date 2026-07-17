import { NextResponse } from "next/server";
import { engine, macroRepo, mlEngine, priceRepo } from "@/lib/container";
import { fxRateUsdInr, priceProvenance } from "@/lib/data/cachedRepository";
import { getLiveSentiment } from "@/lib/data/sentimentProvider";
import { convertGoldPrice } from "@/lib/currency";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const horizonDays = clampInt(searchParams.get("horizon"), 30, 1, 90);
  const withNews = searchParams.get("news") !== "false";
  // OPT-IN experimental ML engine (ADR-0005: did NOT beat baseline; not default).
  const useMl = searchParams.get("engine") === "ml";

  try {
    const [series, macro] = await Promise.all([
      priceRepo.getSeries("gold", 200),
      macroRepo.getLatest(),
    ]);

    if (series.length < 60) {
      return NextResponse.json({ error: "insufficient_history" }, { status: 422 });
    }

    const sentiment = withNews ? (await getLiveSentiment()).result : undefined;

    // ML path is opt-in and falls back to the honest baseline if the service is down.
    let engineUsed = "baseline";
    let mlFallback = false;
    let result;
    if (useMl) {
      try {
        result = await mlEngine.analyze({ asset: "gold", series, macro, horizonDays, sentiment });
        engineUsed = "ml";
      } catch {
        result = await engine.analyze({ asset: "gold", series, macro, horizonDays, sentiment });
        mlFallback = true;
      }
    } else {
      result = await engine.analyze({ asset: "gold", series, macro, horizonDays, sentiment });
    }

    const prov = priceProvenance("gold");
    const fx = fxRateUsdInr();
    return NextResponse.json({
      ...result,
      live: prov.live,
      source: prov.source,
      sentiment,
      engineUsed,
      mlFallback,
      currency: {
        usdInr: fx.rate,
        usdInrLive: fx.live,
        // Same forecast expressed in INR per 10 grams, for INR-native clients.
        inr10g: {
          spot: Math.round(convertGoldPrice(result.spot, "INR", fx.rate)),
          central: Math.round(convertGoldPrice(result.forecast.central, "INR", fx.rate)),
          lower: Math.round(convertGoldPrice(result.forecast.lower, "INR", fx.rate)),
          upper: Math.round(convertGoldPrice(result.forecast.upper, "INR", fx.rate)),
        },
      },
      mlNote:
        "The ML engine is experimental and did NOT beat the honest baseline in walk-forward testing (ADR-0005). It is offered for comparison, not as a more-accurate forecast.",
    });
  } catch {
    return NextResponse.json({ error: "analysis_failed" }, { status: 500 });
  }
}

function clampInt(raw: string | null, def: number, lo: number, hi: number): number {
  const n = raw ? parseInt(raw, 10) : def;
  if (Number.isNaN(n)) return def;
  return Math.min(hi, Math.max(lo, n));
}
