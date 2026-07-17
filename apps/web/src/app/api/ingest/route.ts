import { NextResponse } from "next/server";
import { runIngestion } from "@/lib/data/ingestion";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Triggers ingestion of live data into SQLite. POST to run.
 * In Phase 1.5 a scheduler (cron/worker) will call this; for now it's on-demand.
 * A shared-secret guard prevents abuse if exposed publicly.
 */
export async function POST(request: Request) {
  const secret = process.env.PHOENIX_INGEST_SECRET;
  if (secret) {
    const provided = request.headers.get("x-ingest-secret");
    if (provided !== secret) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }
  try {
    const report = await runIngestion();
    const code = report.status === "failed" ? 502 : 200;
    return NextResponse.json(report, { status: code });
  } catch (e) {
    return NextResponse.json(
      { error: "ingestion_crashed", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

/** Convenience GET for local dev/manual trigger (same guard). */
export async function GET(request: Request) {
  return POST(request);
}
