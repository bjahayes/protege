import { NextRequest, NextResponse } from "next/server";
import { listAgents, saveAgent } from "@/lib/agent-store";
import { GROUPS } from "@/lib/agents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Every agent: the built-in ones and the ones people have made.
export async function GET() {
  return NextResponse.json({ agents: listAgents(), groups: GROUPS });
}

// Make an agent, or save a new version of one someone made.
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  try {
    return NextResponse.json({ agent: saveAgent(b) });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 400 });
  }
}
