import { NextRequest, NextResponse } from "next/server";
import { loginState, startLogin, submitLoginCode } from "@/lib/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Sign Claude Code in, using Claude Code's own sign-in (lib/engine.ts startLogin).
//   GET                                    where the sign-in is up to (it checks `claude auth status`)
//   POST { action: "start" }               start it, out of sight (a window if that can't work)
//   POST { action: "start", window: true } start it in a window of its own
//   POST { action: "code", code }          pass on the code the sign-in page shows
export async function GET() {
  return NextResponse.json(await loginState());
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  if (b.action === "start") return NextResponse.json(startLogin({ window: !!b.window }));
  if (b.action === "code" && typeof b.code === "string" && b.code.trim()) return NextResponse.json(submitLoginCode(b.code.slice(0, 2000)));
  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
