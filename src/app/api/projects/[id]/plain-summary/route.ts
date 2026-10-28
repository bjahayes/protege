import { NextRequest, NextResponse } from "next/server";
import { runAgent } from "@/lib/agent-run";
import { getAgent } from "@/lib/agent-store";
import { projectDir, unknownProject } from "@/lib/project-guard";
import fs from "fs";
import { getProject } from "@/lib/discovery";
import { readPlainSummary } from "@/lib/plain-summary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const dir = await projectDir(id);
  if (!dir) return unknownProject();
  return NextResponse.json({ summary: readPlainSummary(dir) });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const dir = await projectDir(id);
  if (!dir) return unknownProject();
  if (!fs.existsSync(dir)) return NextResponse.json({ error: "Project folder missing" }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  const project = await getProject(dir);
  // Run by its agent, so the run is named and each result is kept as a version.
  const job = await runAgent(getAgent("plain-summary")!, {
    dir,
    projectName: project?.name || dir,
    model: body.model || undefined,
    effort: body.effort || undefined,
  });
  return NextResponse.json({ job });
}
