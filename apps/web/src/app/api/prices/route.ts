import { NextResponse } from "next/server";
import { priceRepo } from "@/lib/container";
import { IS_SAMPLE_DATA } from "@/lib/data/seed";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const days = clampInt(searchParams.get("days"), 90, 1, 400);
  try {
    const series = await priceRepo.getSeries("gold", days);
    return NextResponse.json({ asset: "gold", isSampleData: IS_SAMPLE_DATA, count: series.length, series });
  } catch (err) {
    return NextResponse.json({ error: "failed_to_load_prices" }, { status: 500 });
  }
}

function clampInt(raw: string | null, def: number, lo: number, hi: number): number {
  const n = raw ? parseInt(raw, 10) : def;
  if (Number.isNaN(n)) return def;
  return Math.min(hi, Math.max(lo, n));
}
