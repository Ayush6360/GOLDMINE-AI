import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ status: "ok", service: "phoenix-web", version: "0.1.0" });
}
