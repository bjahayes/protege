import { NextRequest, NextResponse } from "next/server";
import { readStarter } from "@/lib/starter";
import { getTemplate } from "@/lib/templates";
import { projectDir, unknownProject } from "@/lib/project-guard";
import { getProject, sessionsForCwd } from "@/lib/discovery";
import { claudeMdPath, designPath, planPath, readmePath, readProjectDocs, scaffoldProject } from "@/lib/docs";
import { ensureVersioned, listVersions } from "@/lib/doc-versions";
import { listAgents } from "@/lib/agent-store";
import path from "path";
import { readAssessment } from "@/lib/assessment";
import { readPlainSummary } from "@/lib/plain-summary";
import { unregisterProject } from "@/lib/store";
import { getJobManager } from "@/lib/job-manager";
import { isGitRepo } from "@/lib/git";
import { findPreviewEntry } from "@/lib/preview";
import { isDemoId, demoDetail } from "@/lib/demo";

// What each built-in document agent's document is called in the Documents list.
const DOC_TITLES: Record<string, string> = { "user-guide": "User guide", changes: "What changed", "plain-summary": "Plain-English summary" };

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
  // Every document is versioned whoever changes it: each look saves any change since the last version.
  const rel = (abs: string | null) => (abs ? path.relative(projectPath, abs).split(path.sep).join("/") : null);
  const docPaths = project.exists
    ? { design: rel(designPath(projectPath)), plan: rel(planPath(projectPath)), claudeMd: rel(claudeMdPath(projectPath)) }
    : { design: null, plan: null, claudeMd: null };
  // The documents and their versions, for the Overview's Documents list.
  const documents: { file: string; title: string; agentId?: string; agentName?: string; versions: number; lastBy?: string; lastAt?: number }[] = [];
  if (project.exists) {
    const agents = listAgents();
    const titles = new Map<string, { title: string; agentId?: string }>();
    if (docPaths.plan) titles.set(docPaths.plan, { title: "Plan", agentId: "update-plan" });
    if (docPaths.design) titles.set(docPaths.design, { title: "Design", agentId: "update-design" });
    if (docPaths.claudeMd) titles.set(docPaths.claudeMd, { title: "Claude's notes", agentId: "update-claude-md" });
    const readme = rel(readmePath(projectPath));
    if (readme) titles.set(readme, { title: "Read me" });
    titles.set(".protege/status.md", { title: "Status" });
    for (const a of agents)
      if (a.document && !titles.has(a.document) && !a.document.endsWith(".json"))
        titles.set(a.document, { title: a.kind === "report" ? `Report: ${a.name}` : DOC_TITLES[a.id] || a.name, agentId: a.id });
    const tracked = new Set<string>([...titles.keys(), ...agents.filter((a) => a.document).map((a) => a.document!)]);
    for (const p of [docPaths.design, docPaths.plan, docPaths.claudeMd, rel(readmePath(projectPath))]) if (p) tracked.add(p);
    for (const a of listAgents()) if (a.document) tracked.add(a.document);
    for (const d of tracked) {
      try {
        ensureVersioned(projectPath, d);
      } catch {
        /* a document that can't be read is skipped */
      }
    }
    for (const [file, t] of titles) {
      const v = listVersions(projectPath, file);
      if (!v.length) continue; // doesn't exist yet
      const last = v[v.length - 1];
      const agentName = t.agentId ? agents.find((a) => a.id === t.agentId)?.name : undefined;
      documents.push({ file, ...t, agentName, versions: v.length, lastBy: last.by, lastAt: last.at });
    }
  }
  const sessions = project.exists ? await sessionsForCwd(projectPath) : [];
  const jobs = getJobManager().jobsForProject(projectPath);
  const assessment = project.exists ? readAssessment(projectPath) : null;
  const plainSummary = project.exists ? readPlainSummary(projectPath) : null;
  const gitRepo = project.exists ? await isGitRepo(projectPath) : false;
  const previewEntry = project.exists ? findPreviewEntry(projectPath) : null;
  // Projects made in Start something new: where they are in the getting-started steps.
  const record = project.exists ? readStarter(projectPath) : null;
  const starter = record ? { ...record, ideas: getTemplate(record.template)?.ideas || [] } : null;
  // Concrete progress from the task board (the honest basis for "how far along").
  const tasks = docs.tasks || [];
  const doneT = tasks.filter((t: any) => t.status === "done").map((t: any) => t.title);
  const remT = tasks.filter((t: any) => t.status !== "done").map((t: any) => t.title);
  const progress = doneT.length + remT.length > 0 ? { done: doneT, remaining: remT } : null;
  return NextResponse.json({ project, docs, docPaths, sessions, jobs, assessment, plainSummary, gitRepo, previewEntry, progress, starter, documents });
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
