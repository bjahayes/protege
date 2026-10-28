import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import { pathFromProjectId } from "@/lib/config";
import { getProject } from "@/lib/discovery";
import { getJobManager } from "@/lib/job-manager";
import { buildPlainSummaryPrompt, readPlainSummary } from "@/lib/plain-summary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return NextResponse.json({ summary: readPlainSummary(pathFromProjectId(id)) });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const dir = pathFromProjectId(id);
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
