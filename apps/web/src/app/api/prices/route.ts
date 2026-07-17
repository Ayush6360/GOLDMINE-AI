import { NextResponse } from "next/server";
import { priceRepo } from "@/lib/container";
import { priceProvenance } from "@/lib/data/cachedRepository";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const days = clampInt(searchParams.get("days"), 90, 1, 400);
  try {
    const series = await priceRepo.getSeries("gold", days);
    const prov = priceProvenance("gold");
    return NextResponse.json({
      asset: "gold",
      live: prov.live,
      source: prov.source,
      count: series.length,
      series,
    });
  } catch {
    return NextResponse.json({ error: "failed_to_load_prices" }, { status: 500 });
  }
}

function clampInt(raw: string | null, def: number, lo: number, hi: number): number {
  const n = raw ? parseInt(raw, 10) : def;
  if (Number.isNaN(n)) return def;
  return Math.min(hi, Math.max(lo, n));
}
