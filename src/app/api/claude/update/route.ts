import { NextResponse } from "next/server";
import { authStatus, updateClaude } from "@/lib/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Update Claude Code on this computer (the same as `claude update`), for when it is too old
// for the model the person picked.
export async function POST() {
  const r = await updateClaude();
  await authStatus(true);
  return NextResponse.json(r);
}
