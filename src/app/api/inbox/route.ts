import { NextResponse } from "next/server";
import fs from "fs";
import { getJobManager } from "@/lib/job-manager";
import { getChatManager } from "@/lib/chat-manager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The inbox surfaces what needs a human now: Code-page sessions waiting for an OK, changes to
// review, failures, and agents that look stuck. One item per run or session. Only what can still be
// acted on: a change whose safe copy is gone can't be reviewed. Anything older than a week is marked
// `older` (the page folds it away) and doesn't count towards the badge.
const STALE = 7 * 24 * 60 * 60 * 1000;
export async function GET() {
  const jm = getJobManager();
  const recent = jm.recentJobs(120);
  const live = jm.listLive();
  const liveById = new Map(live.map((j) => [j.id, j]));

  const items: any[] = [];
  const seen = new Set<string>();
  // A job that spawned an auto-continuation isn't a "failure" — its work continues in the child.
  const continuedParents = new Set(recent.map((j) => j.parentJobId).filter(Boolean) as string[]);

  const add = (job: any, type: string, action: string, href: string) => {
    if (seen.has(job.id)) return;
    seen.add(job.id);
    items.push({
      jobId: job.id,
      type,
      action,
      href,
      projectId: job.projectId,
      projectName: job.projectName,
      prompt: job.prompt,
      agentId: job.agentId,
      agentName: job.agentName,
      kind: job.kind,
      status: job.status,
      ts: job.endedAt || job.startedAt,
      branch: job.branch,
    });
  };

  const now = Date.now();
  const fresh = (j: any) => now - (j.ts || j.endedAt || j.startedAt || 0) < STALE;

  // Code-page sessions waiting for the person's OK (most urgent), or stopped by an error.
  for (const c of getChatManager().list()) {
    if (c.status !== "waiting" && !c.error) continue;
    const id = `chat:${c.sessionId}`;
    if (seen.has(id)) continue;
    seen.add(id);
    items.push({
      jobId: id,
      type: c.status === "waiting" ? "approve" : "failed",
      action: c.status === "waiting" ? "Claude is waiting for your OK — open the session" : "The session stopped with an error — open it",
      href: `/chat?s=${c.sessionId}`,
      projectId: c.projectId,
      projectName: c.projectName,
      prompt: c.status === "waiting" ? "A Code session needs your approval to carry on" : c.error || "A Code session stopped",
      status: c.status,
      ts: c.lastActivity,
    });
  }

  // Stuck live agents
  for (const j of live) {
    if (j.stuck) add(j, "stuck", "Agent may be looping — check it", `/agents?job=${j.id}`);
  }
  // Worktree changes awaiting review. A run whose safe copy a later run carried on with (a reply,
  // or "Go ahead" after a plan) is reviewed through that later run, so it isn't listed itself.
  for (const j of recent) {
    const cur = liveById.get(j.id) || j;
    if (
      cur.worktreeState === "active" &&
      !continuedParents.has(j.id) &&
      ["done", "stopped", "error", "interrupted"].includes(cur.status) &&
      !!cur.worktreePath &&
      fs.existsSync(cur.worktreePath)
    ) {
      add(j, "review", "Review & apply/discard the changes", `/agents?job=${j.id}`);
    }
  }
  // Checks failed on a run's changes
  for (const j of recent) {
    if (j.checksPassed === 0) add(j, "checks", `Checks failed (${j.checksCommand || "tests"})`, `/agents?job=${j.id}`);
  }
  // Failed runs (excluding ones that auto-continued into a follow-up)
  for (const j of recent) {
    if (j.status === "error" && !continuedParents.has(j.id)) {
      add(j, "failed", "Run failed — see what happened", `/agents?job=${j.id}`);
    }
  }

  items.sort((a, b) => (b.ts || 0) - (a.ts || 0));
  for (const it of items) it.older = !fresh(it);
  return NextResponse.json({ items, count: items.filter((i) => !i.older).length });
}
