import { NextResponse } from "next/server";
import { engine, macroRepo, priceRepo } from "@/lib/container";
import { backtest } from "@/lib/engine/backtest";
import { priceProvenance } from "@/lib/data/cachedRepository";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Runs the walk-forward backtest on the ingested gold series and returns the honest
 * accuracy numbers (ADR-0004). GET for easy manual/dev use.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const testDays = clampInt(searchParams.get("testDays"), 250, 30, 500);
  const horizonDays = clampInt(searchParams.get("horizon"), 1, 1, 30);

  try {
    const [series, macro] = await Promise.all([
      priceRepo.getSeries("gold", 800),
      macroRepo.getLatest(),
    ]);
    if (series.length < 80) {
      return NextResponse.json(
        { error: "insufficient_history", have: series.length, need: 80, hint: "POST /api/ingest first" },
        { status: 422 },
      );
    }

    const result = await backtest(engine, series, macro, {
      asset: "gold",
      testDays,
      minTrain: 60,
      horizonDays,
    });
    const prov = priceProvenance("gold");
    return NextResponse.json({ ...result, live: prov.live, source: prov.source });
  } catch (e) {
    return NextResponse.json(
      { error: "backtest_failed", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

function clampInt(raw: string | null, def: number, lo: number, hi: number): number {
  const n = raw ? parseInt(raw, 10) : def;
  if (Number.isNaN(n)) return def;
  return Math.min(hi, Math.max(lo, n));
}
