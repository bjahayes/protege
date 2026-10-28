import { NextRequest, NextResponse } from "next/server";
import { authStatus } from "@/lib/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Whether the installed Claude Code program is present and signed in.
// `?refresh=1` skips the 30-second cache (the banner's "Check again" button).
export async function GET(req: NextRequest) {
  const s = await authStatus(req.nextUrl.searchParams.get("refresh") === "1");
  return NextResponse.json(s);
}
