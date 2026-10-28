import { NextRequest, NextResponse } from "next/server";
import { sessionTranscript } from "@/lib/discovery";
import { itemsFromMessage } from "@/lib/chat-format";
import { getChatManager, openElsewhere } from "@/lib/chat-manager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A saved conversation as chat items, plus its live state if its process is running.
export async function GET(req: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const cwd = req.nextUrl.searchParams.get("cwd") || undefined;
  const raw = (await sessionTranscript(sessionId, cwd)) as any[];
  const items = raw.flatMap((m) => itemsFromMessage(m));
  const cm = getChatManager();
  const live = cm.get(sessionId);
  // Open in another app (and not here): a reply here carries it on as a copy.
  const openIn = live && live.status !== "ended" ? null : openElsewhere(sessionId);
  return NextResponse.json({ sessionId, items, live: live ? cm.state(live) : null, openIn });
}
