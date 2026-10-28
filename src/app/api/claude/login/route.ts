import { NextRequest, NextResponse } from "next/server";
import { loginState, startLogin } from "@/lib/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Sign Claude Code in, using Claude Code's own sign-in in a window of its own.
//   GET                        where the sign-in is up to (it checks `claude auth status`)
//   POST { action: "start" }   open the sign-in window
export async function GET() {
  return NextResponse.json(await loginState());
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  if (b.action === "start") return NextResponse.json(startLogin());
  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
