import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import { getJobManager } from "@/lib/job-manager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Launch a small agent that distils durable learnings from a completed run into CLAUDE.md.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const jm = getJobManager();
  const job = jm.get(id);
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  if (!fs.existsSync(job.projectPath)) {
    return NextResponse.json({ error: "Project folder missing" }, { status: 400 });
  }

  const events = jm.getEvents(id);
  const resultEv = [...events].reverse().find((e) => e.type === "result");
  const finalReport = (resultEv?.payload?.result || "").slice(0, 2500);

  const prompt =
    `A task was just completed in this project. Distil any DURABLE learnings worth remembering for future work — ` +
    `gotchas, conventions, non-obvious decisions, or facts about how this codebase works. ` +
    `Append 1-3 concise dated bullets to CLAUDE.md under a "## Learnings" section (create the section if it doesn't exist). ` +
    `Skip the obvious; if there's nothing durable to record, add nothing and say so. Only edit CLAUDE.md.\n\n` +
    `TASK: ${job.prompt}\n\nWHAT HAPPENED: ${finalReport || "(no report)"}`;

  const newJob = jm.launch({
    projectPath: job.projectPath,
    projectName: job.projectName,
    prompt,
    kind: "run",
    model: "claude-haiku-4-5-20251001",
    permissionMode: "acceptEdits",
    maxTurns: 8,
    primeContext: false,
  });

  return NextResponse.json({ ok: true, job: newJob });
}
