import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import { pathFromProjectId } from "@/lib/config";
import { getProject } from "@/lib/discovery";
import { getJobManager } from "@/lib/job-manager";
import { buildAssessmentPrompt, readAssessment } from "@/lib/assessment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const dir = pathFromProjectId(id);
  return NextResponse.json({ assessment: readAssessment(dir) });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const dir = pathFromProjectId(id);
  if (!fs.existsSync(dir)) {
    return NextResponse.json({ error: `Project folder missing: ${dir}` }, { status: 400 });
  }
  const body = await req.json().catch(() => ({}));
  const project = await getProject(dir);

  const job = getJobManager().launch({
    projectPath: dir,
    projectName: project?.name || dir,
    prompt: buildAssessmentPrompt(dir),
    kind: "assess",
    model: body.model || undefined,
    permissionMode: "acceptEdits",
    effort: body.effort || "high",
    maxTurns: body.maxTurns ? Number(body.maxTurns) : 40,
  });
  return NextResponse.json({ job });
}
