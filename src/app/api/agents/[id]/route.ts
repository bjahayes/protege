import { NextRequest, NextResponse } from "next/server";
import { agentHistory, deleteAgent, getAgent } from "@/lib/agent-store";
import { changesText } from "@/lib/agents";
import { getJobManager } from "@/lib/job-manager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// One agent: what it does, what it may change, its saved versions and its recent runs.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const agent = getAgent(id);
  if (!agent) return NextResponse.json({ error: "No such agent" }, { status: 404 });
  const runs = getJobManager().recentJobs(400).filter((j) => j.agentId === id).slice(0, 30);
  return NextResponse.json({ agent, changes: changesText(agent), history: agent.builtIn ? [] : agentHistory(id), runs });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const agent = getAgent(id);
  if (!agent || agent.builtIn) return NextResponse.json({ error: "Only agents you made can be deleted." }, { status: 400 });
  deleteAgent(id);
  return NextResponse.json({ ok: true });
}
