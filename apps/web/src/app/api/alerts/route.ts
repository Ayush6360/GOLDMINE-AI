import { NextResponse } from "next/server";
import { createAlert, deleteAlert, listAlerts, listTriggered, type AlertType } from "@/lib/alerts/alertsEngine";
import type { Currency } from "@/lib/currency";

export const dynamic = "force-dynamic";

const VALID_TYPES: AlertType[] = ["price_above", "price_below", "direction_flip"];

export async function GET() {
  return NextResponse.json({ alerts: listAlerts(), triggered: listTriggered() });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const b = body as { type?: string; threshold?: number; currency?: string };

  if (!b.type || !VALID_TYPES.includes(b.type as AlertType)) {
    return NextResponse.json({ error: "invalid_type", valid: VALID_TYPES }, { status: 422 });
  }
  if (b.type !== "direction_flip") {
    if (typeof b.threshold !== "number" || b.threshold <= 0) {
      return NextResponse.json({ error: "threshold_required" }, { status: 422 });
    }
  }
  const currency: Currency = b.currency === "INR" ? "INR" : "USD";
  const alert = createAlert({ type: b.type as AlertType, threshold: b.threshold, currency });
  return NextResponse.json({ alert }, { status: 201 });
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = Number(searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "id_required" }, { status: 422 });
  const ok = deleteAlert(id);
  return NextResponse.json({ deleted: ok }, { status: ok ? 200 : 404 });
}
