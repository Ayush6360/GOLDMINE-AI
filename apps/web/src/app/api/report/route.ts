import { NextResponse } from "next/server";
import { engine, macroRepo, priceRepo } from "@/lib/container";
import { fxRateUsdInr } from "@/lib/data/cachedRepository";
import { getLiveSentiment } from "@/lib/data/sentimentProvider";
import { generateReport } from "@/lib/reports/reportGenerator";
import type { Currency } from "@/lib/currency";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const currency: Currency = searchParams.get("ccy") === "INR" ? "INR" : "USD";

  try {
    const [series, macro] = await Promise.all([
      priceRepo.getSeries("gold", 120),
      macroRepo.getLatest(),
    ]);
    if (series.length < 30) {
      return NextResponse.json({ error: "insufficient_history" }, { status: 422 });
    }
    const { result: sentiment } = await getLiveSentiment();
    const analysis = await engine.analyze({ asset: "gold", series, macro, horizonDays: 1, sentiment });
    const fx = await fxRateUsdInr();

    const report = generateReport({ series, analysis, sentiment, macro, currency, usdInr: fx.rate });
    return NextResponse.json({ report });
  } catch {
    return NextResponse.json({ error: "report_failed" }, { status: 500 });
  }
}
