import { NextRequest, NextResponse } from "next/server";
import { projectDir, unknownProject } from "@/lib/project-guard";
import fs from "fs";
import { getProject } from "@/lib/discovery";
import { getJobManager } from "@/lib/job-manager";
import { buildPlainSummaryPrompt, readPlainSummary } from "@/lib/plain-summary";

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
  const job = getJobManager().launch({
    projectPath: dir,
    projectName: project?.name || dir,
    prompt: buildPlainSummaryPrompt(dir),
    kind: "assess",
    model: body.model || undefined,
    permissionMode: "acceptEdits",
    effort: body.effort || "high",
    maxTurns: 30,
    primeContext: false,
  });
  return NextResponse.json({ job });
}
