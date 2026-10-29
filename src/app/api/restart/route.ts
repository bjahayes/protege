import { NextRequest, NextResponse } from "next/server";
import { cancelRestart, requestRestart, restartState } from "@/lib/restart";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Restarting Protégé to load a new version (see src/lib/restart.ts).
//   GET                        where a restart is up to
//   POST {}                    build the new version, then restart once nothing is mid-turn
//   POST { action: "cancel" }  stop waiting
//   POST { action: "force" }   restart as soon as the new version is built, without waiting
//                              (a session or task mid-turn stops, and carries on from its saved history)
export async function GET() {
  return NextResponse.json(restartState());
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  return NextResponse.json(b.action === "cancel" ? cancelRestart() : requestRestart({ force: b.action === "force" }));
}
