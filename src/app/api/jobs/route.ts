import { NextRequest, NextResponse } from "next/server";
import { projectDir, unknownProject } from "@/lib/project-guard";
import fs from "fs";
import { getJobManager } from "@/lib/job-manager";
import { getProject } from "@/lib/discovery";
import { isDemoId, demoSummaries } from "@/lib/demo";
import { readTasks } from "@/lib/docs";
import { metaRel } from "@/lib/meta";
import { getAgent } from "@/lib/agent-store";
import type { PermissionMode } from "@anthropic-ai/claude-agent-sdk";

// A directive appended to Simple-mode change jobs so the assistant keeps the
// project's checklist (.protege/tasks.json) in sync with what it actually did.
// Because the file is versioned with the change, keep/throw-away stays consistent.
function maintainTasksDirective(dir: string): string {
  const tasks = readTasks(dir);
  const list = tasks.length
    ? tasks.map((t) => `  - [${t.status}] (${t.id}) ${t.title}`).join("\n")
    : "  (none yet)";
  return (
    `\n\n---\n` +
    `IMPORTANT — keep the project checklist accurate. It lives in \`${metaRel(dir, "tasks.json")}\` ` +
    `(an object with a "tasks" array; each item is {id, title, status, createdAt, updatedAt}, ` +
    `status is "todo" | "doing" | "done"). As the final step of your work, edit that file so it ` +
    `reflects reality:\n` +
    `- Set any item you actually completed to "done".\n` +
    `- If your change introduced obvious, concrete follow-up work, add a new item (unique id, short plain-English title, status "todo").\n` +
    `- Don't invent progress: only mark done what you genuinely finished, and keep titles short and jargon-free.\n` +
    `Current checklist:\n${list}\n`
  );
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const jm = getJobManager();
  return NextResponse.json({ jobs: jm.recentJobs(60), live: jm.listLive() });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const projectId: string = body.projectId;
  const prompt: string = (body.prompt || "").trim();
  if (!projectId || !prompt) {
    return NextResponse.json({ error: "projectId and prompt are required" }, { status: 400 });
  }
  const demo = isDemoId(projectId);
  const projectPath = await projectDir(projectId);
  if (!projectPath) return unknownProject();
  if (!fs.existsSync(projectPath)) {
    return NextResponse.json({ error: `Project path missing: ${projectPath}` }, { status: 400 });
  }
  const projectName = demo
    ? demoSummaries().find((p) => p.id === projectId)?.name || "Demo project"
    : (await getProject(projectPath))?.name || projectPath;

  // Simple-mode changes ask the agent to keep the checklist in sync (living plan).
  const finalPrompt = body.maintainTasks ? prompt + maintainTasksDirective(projectPath) : prompt;

  // A follow-up message in the Simple view's conversation: continue the same Claude Code
  // session, and the same safe copy (worktree) if the earlier run made one.
  let resume: string | undefined = body.resume || undefined;
  let worktree: { path: string; branch?: string; baseRef?: string } | undefined;
  let parentJobId: string | undefined;
  let agentId: string | undefined = body.agentId ? String(body.agentId) : undefined;
  if (body.continueFrom) {
    const prev = getJobManager().get(String(body.continueFrom));
    if (prev?.sessionId) {
      resume = prev.sessionId;
      parentJobId = prev.id;
      agentId ||= prev.agentId; // a reply carries on the same agent's work
      if (prev.worktreeState === "active" && prev.worktreePath) {
        worktree = { path: prev.worktreePath, branch: prev.branch, baseRef: prev.baseRef };
      }
    }
  }

  // A run started from somewhere that stands for an agent (the Simple view's "make a change").
  const a = agentId ? getAgent(agentId) : null;
  const job = getJobManager().launch({
    projectPath,
    projectName,
    prompt: finalPrompt,
    agent: a ? { id: a.id, name: a.name, version: a.version } : undefined,
    kind: "run",
    model: body.model || undefined,
    permissionMode: (body.permissionMode as PermissionMode) || "acceptEdits",
    effort: body.effort || undefined,
    maxTurns: body.maxTurns ? Number(body.maxTurns) : undefined,
    maxBudgetUsd: body.maxBudgetUsd ? Number(body.maxBudgetUsd) : undefined,
    resume,
    worktree,
    parentJobId,
    isolate: worktree ? false : !!body.isolate,
    autoResume: !!body.autoResume,
    maxAutoResumes: body.maxAutoResumes ? Number(body.maxAutoResumes) : undefined,
    primeContext: body.primeContext !== false,
    autoVerify: !!body.autoVerify,
    autoFix: !!body.autoFix,
  });
  return NextResponse.json({ job });
}
