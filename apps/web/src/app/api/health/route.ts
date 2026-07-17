import { NextResponse } from "next/server";
import { dataMode } from "@/lib/container";
import { hasFred } from "@/lib/config";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "phoenix-web",
    version: "0.2.0",
    dataMode,
    fredEnabled: hasFred(),
  });
}
