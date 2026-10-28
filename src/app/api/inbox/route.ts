import { NextResponse } from "next/server";
import { getJobManager } from "@/lib/job-manager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The inbox surfaces agent runs that need a human: changes to review, failures,
// and agents that look stuck — one actionable item per job.
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
      status: job.status,
      ts: job.endedAt || job.startedAt,
      branch: job.branch,
    });
  };

  // Stuck live agents (most urgent)
  for (const j of live) {
    if (j.stuck) add(j, "stuck", "Agent may be looping — check it", `/agents?job=${j.id}`);
  }
  // Worktree changes awaiting review
  for (const j of recent) {
    const cur = liveById.get(j.id) || j;
    if (cur.worktreeState === "active" && ["done", "stopped", "error", "interrupted"].includes(cur.status)) {
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
  return NextResponse.json({ items, count: items.length });
}
