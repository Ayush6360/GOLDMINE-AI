import { NextResponse } from "next/server";
import { engine, macroRepo, priceRepo } from "@/lib/container";
import { priceProvenance } from "@/lib/data/cachedRepository";
import { getLiveSentiment } from "@/lib/data/sentimentProvider";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const horizonDays = clampInt(searchParams.get("horizon"), 30, 1, 90);
  const withNews = searchParams.get("news") !== "false";

  try {
    const [series, macro] = await Promise.all([
      priceRepo.getSeries("gold", 200),
      macroRepo.getLatest(),
    ]);

    if (series.length < 60) {
      return NextResponse.json({ error: "insufficient_history" }, { status: 422 });
    }

    const sentiment = withNews ? (await getLiveSentiment()).result : undefined;
    const result = await engine.analyze({ asset: "gold", series, macro, horizonDays, sentiment });
    const prov = priceProvenance("gold");
    return NextResponse.json({ ...result, live: prov.live, source: prov.source, sentiment });
  } catch {
    return NextResponse.json({ error: "analysis_failed" }, { status: 500 });
  }
}

function clampInt(raw: string | null, def: number, lo: number, hi: number): number {
  const n = raw ? parseInt(raw, 10) : def;
  if (Number.isNaN(n)) return def;
  return Math.min(hi, Math.max(lo, n));
}
