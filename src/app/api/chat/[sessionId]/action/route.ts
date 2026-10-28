import { NextRequest, NextResponse } from "next/server";
import type { PermissionMode } from "@anthropic-ai/claude-agent-sdk";
import { getChatManager } from "@/lib/chat-manager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Controls for a running conversation:
//   { action: "interrupt" }                         stop what Claude is doing
//   { action: "permission", requestId, decision }   allow | always | deny one tool call
//   { action: "mode", value }                       change the permission mode
//   { action: "model", value }                      change the model ("" = Claude Code's default)
//   { action: "effort", value }                     change the effort level ("" = the model's default)
//   { action: "close" }                             end the conversation's process
export async function POST(req: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const b = await req.json().catch(() => ({}));
  const cm = getChatManager();
  let ok = false;
  switch (b.action) {
    case "interrupt":
      ok = await cm.interrupt(sessionId);
      break;
    case "permission":
      ok = ["allow", "always", "deny"].includes(b.decision) && cm.respond(sessionId, String(b.requestId), b.decision);
      break;
    case "mode":
      ok = await cm.setMode(sessionId, b.value as PermissionMode);
      break;
    case "model":
      ok = await cm.setModel(sessionId, b.value ? String(b.value) : undefined);
      break;
    case "effort":
      ok = await cm.setEffort(sessionId, b.value ? String(b.value) : undefined);
      break;
    case "close":
      cm.close(sessionId);
      ok = true;
      break;
  }
  return NextResponse.json({ ok }, { status: ok ? 200 : 409 });
}
