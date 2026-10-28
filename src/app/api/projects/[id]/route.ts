import { NextRequest, NextResponse } from "next/server";
import { projectDir, unknownProject } from "@/lib/project-guard";
import { getProject, sessionsForCwd } from "@/lib/discovery";
import { readProjectDocs, scaffoldProject } from "@/lib/docs";
import { readAssessment } from "@/lib/assessment";
import { readPlainSummary } from "@/lib/plain-summary";
import { unregisterProject } from "@/lib/store";
import { getJobManager } from "@/lib/job-manager";
import { isGitRepo } from "@/lib/git";
import { findPreviewEntry } from "@/lib/preview";
import { isDemoId, demoDetail } from "@/lib/demo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (isDemoId(id)) {
    const detail = demoDetail(id);
    if (!detail) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    return NextResponse.json(detail);
  }
  const projectPath = await projectDir(id);
  if (!projectPath) return unknownProject();
  const project = await getProject(projectPath);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  const docs = project.exists ? readProjectDocs(projectPath) : {
    design: null, plan: null, claudeMd: null, readme: null, status: null, tasks: [],
  };
  const sessions = project.exists ? await sessionsForCwd(projectPath) : [];
  const jobs = getJobManager().jobsForProject(projectPath);
  const assessment = project.exists ? readAssessment(projectPath) : null;
  const plainSummary = project.exists ? readPlainSummary(projectPath) : null;
  const gitRepo = project.exists ? await isGitRepo(projectPath) : false;
  const previewEntry = project.exists ? findPreviewEntry(projectPath) : null;
  // Concrete progress from the task board (the honest basis for "how far along").
  const tasks = docs.tasks || [];
  const doneT = tasks.filter((t: any) => t.status === "done").map((t: any) => t.title);
  const remT = tasks.filter((t: any) => t.status !== "done").map((t: any) => t.title);
  const progress = doneT.length + remT.length > 0 ? { done: doneT, remaining: remT } : null;
  return NextResponse.json({ project, docs, sessions, jobs, assessment, plainSummary, gitRepo, previewEntry, progress });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const projectPath = await projectDir(id);
  if (!projectPath) return unknownProject();
  const body = await req.json().catch(() => ({}));
  if (body.action === "scaffold") {
    const project = await getProject(projectPath);
    const created = scaffoldProject(projectPath, project?.name || "Project");
    return NextResponse.json({ ok: true, scaffolded: created });
  }
  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const dir = await projectDir(id);
  if (dir) unregisterProject(dir);
  return NextResponse.json({ ok: true });
}
