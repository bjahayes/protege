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
import { readAssessment } from "@/lib/assessment";
import { PLAN_FENCE } from "@/lib/plan";
import { explainRules } from "@/lib/explain-style";

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
    // The person watches this list tick off live in the "What's happening" panel (lib/todo-list.ts).
    `IMPORTANT — the person watches a live to-do list of your work. Before you change any file, if the request ` +
    `has more than one part or the work takes more than one step, call TaskCreate once for each step (or TodoWrite ` +
    `with the whole list), each a short line saying what it does for them. Then, as you go, call TaskUpdate to ` +
    `mark each step in_progress when you start it and completed when it's done. Don't skip this for quick work.\n\n` +
    `IMPORTANT — keep the project checklist accurate. It lives in \`${metaRel(dir, "tasks.json")}\` ` +
    `(an object with a "tasks" array; each item is {id, title, status, createdAt, updatedAt}, ` +
    `status is "todo" | "doing" | "done"). As the final step of your work, edit that file so it ` +
    `reflects reality:\n` +
    `- Set any item you actually completed to "done".\n` +
    `- If your change introduced obvious, concrete follow-up work, add a new item (unique id, short plain-English title, status "todo").\n` +
    `- Don't invent progress: only mark done what you genuinely finished, and keep titles short and jargon-free.\n` +
    `Current checklist:\n${list}\n` +
    (explainRules() ? `\nWhen you report back to the person at the end, write your report this way:${explainRules()}` : "")
  );
}

// "Show me the plan first": the run only reads, then replies with a plan whose last block
// names the parts it will change or add, so the plan can be drawn on the parts map (lib/plan.ts).
// It starts like the other directives, so the chat shows only the person's own words.
function planDirective(dir: string): string {
  const parts = (readAssessment(dir)?.components || []).map((c) => c.name);
  return (
    `\n\n---\n` +
    `IMPORTANT — don't change anything yet. The person wants to see your plan first. Read what you need, ` +
    `then reply with one or two plain-English sentences on what you'll do, and anything the person needs to ` +
    `decide. Don't list the steps in your reply: Protégé shows them beside the conversation, from this block, ` +
    `which ends your reply with nothing after it. Write each step in everyday words a non-programmer ` +
    `understands (no file names or code words):\n` +
    "```" + PLAN_FENCE + "\n" +
    `{"steps":["each step in order, one short line each"],"parts":[{"name":"…","change":"change","what":"one plain sentence"}]}\n` +
    "```\n" +
    `In "parts", list each part of the project the plan will change ("change") or add ("new"). ` +
    (parts.length
      ? `For an existing part, use its exact name from this list: ${parts.map((p) => `"${p}"`).join(", ")}. A new part gets a short plain name of two to four words.`
      : `Name each part in two to four plain words.`) +
    `\n` +
    explainRules()
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

  // Simple-mode changes ask the agent to keep the checklist in sync (living plan); a plan-first
  // run asks for a plan instead, and may only read.
  const planFirst = !!body.planFirst;
  const finalPrompt = planFirst
    ? prompt + planDirective(projectPath)
    : body.maintainTasks
      ? prompt + maintainTasksDirective(projectPath)
      : prompt;

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
    kind: planFirst ? "plan" : "run",
    model: body.model || undefined,
    ...(planFirst ? { disallowedTools: ["Edit", "Write", "MultiEdit", "NotebookEdit", "Bash", "PowerShell"] } : {}),
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
    autoVerify: !planFirst && !!body.autoVerify,
    autoFix: !planFirst && !!body.autoFix,
  });
  return NextResponse.json({ job });
}
