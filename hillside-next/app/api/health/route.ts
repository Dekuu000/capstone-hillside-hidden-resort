import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "hillside-next",
    mode: "foundation-shell",
    timestamp: new Date().toISOString(),
  });
}
