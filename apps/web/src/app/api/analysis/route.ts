import { NextResponse } from "next/server";
import { engine, macroRepo, priceRepo } from "@/lib/container";
import { IS_SAMPLE_DATA } from "@/lib/data/seed";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const horizonDays = clampInt(searchParams.get("horizon"), 30, 1, 90);

  try {
    const [series, macro] = await Promise.all([
      priceRepo.getSeries("gold", 200),
      macroRepo.getLatest(),
    ]);

    if (series.length < 60) {
      return NextResponse.json({ error: "insufficient_history" }, { status: 422 });
    }

    const result = await engine.analyze({ asset: "gold", series, macro, horizonDays });
    return NextResponse.json({ ...result, isSampleData: IS_SAMPLE_DATA });
  } catch (err) {
    return NextResponse.json({ error: "analysis_failed" }, { status: 500 });
  }
}

function clampInt(raw: string | null, def: number, lo: number, hi: number): number {
  const n = raw ? parseInt(raw, 10) : def;
  if (Number.isNaN(n)) return def;
  return Math.min(hi, Math.max(lo, n));
}
