import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import { projectDir, unknownProject } from "@/lib/project-guard";
import { getAgent } from "@/lib/agent-store";
import { runAgent } from "@/lib/agent-run";
import { getProject } from "@/lib/discovery";
import { isDemoId, demoSummaries } from "@/lib/demo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Run an agent on a project: { projectId, input?, model?, effort? }.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const agent = getAgent(id);
  if (!agent) return NextResponse.json({ error: "No such agent" }, { status: 404 });
  const b = await req.json().catch(() => ({}));
  const projectId = String(b.projectId || "");
  const dir = await projectDir(projectId);
  if (!dir) return unknownProject();
  if (!fs.existsSync(dir)) return NextResponse.json({ error: `Project folder missing: ${dir}` }, { status: 400 });
  const projectName = isDemoId(projectId)
    ? demoSummaries().find((p) => p.id === projectId)?.name || "Demo project"
    : (await getProject(dir))?.name || dir;
  try {
    const job = await runAgent(agent, { dir, projectName, input: b.input, model: b.model || undefined, effort: b.effort || undefined });
    return NextResponse.json({ job });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 400 });
  }
}
