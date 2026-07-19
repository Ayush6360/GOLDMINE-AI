import { NextResponse } from "next/server";
import { dataMode } from "@/lib/container";
import { hasFred } from "@/lib/config";
import { macroProvenance } from "@/lib/data/cachedRepository";

export async function GET() {
  const macro = await macroProvenance();
  return NextResponse.json({
    status: "ok",
    service: "phoenix-web",
    version: "0.9.0",
    dataMode,
    fredEnabled: hasFred(),
    // Per-field macro sources — shows whether real FRED data is flowing.
    macroSources: Object.fromEntries(
      Object.entries(macro).map(([k, v]) => [k, v.source]),
    ),
  });
}
