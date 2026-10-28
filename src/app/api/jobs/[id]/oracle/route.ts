import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/engine";
import { getJobManager } from "@/lib/job-manager";
import { worktreeDiff } from "@/lib/git";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A fresh "second opinion" agent reviews an agent's worktree diff for bugs,
// security issues, spec-drift and risks — read-only, findings only.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = getJobManager().get(id);
  if (!job || !job.worktreePath) {
    return NextResponse.json({ error: "No worktree to review" }, { status: 400 });
  }
  const diff = await worktreeDiff({ worktreePath: job.worktreePath, branch: job.branch, baseRef: job.baseRef });
  if (!diff.available || diff.files.length === 0) {
    return NextResponse.json({ review: "No changes to review." });
  }

  const diffText = diff.files
    .map((f) => `### ${f.path} (+${f.additions} -${f.deletions})\n${f.patch}`)
    .join("\n\n")
    .slice(0, 60000);

  const prompt =
    `You are a rigorous second-opinion code reviewer. Another agent made the changes below to complete this task:\n\n` +
    `TASK: ${job.prompt}\n\n` +
    `Review the diff for correctness bugs, security issues, drift from the task's intent, missing edge cases, and anything risky or half-done. ` +
    `Read the changed files and surrounding code (read-only tools) to verify before asserting. ` +
    `Respond in concise markdown: a short verdict line, then a bullet list of findings as \`**[severity]** file:line — issue\` (severity = high/medium/low). If it looks solid, say so plainly. Do not modify anything.\n\n` +
    `DIFF:\n${diffText}`;

  let review = "";
  try {
    for await (const msg of query({
      prompt,
      options: {
        cwd: job.worktreePath,
        tools: ["Read", "Grep", "Glob"],
        permissionMode: "acceptEdits",
        includePartialMessages: false,
        settingSources: ["project"],
        persistSession: false,
        effort: "high",
        maxTurns: 20,
      } as any,
    }) as any) {
      if (msg.type === "result" && typeof msg.result === "string") review = msg.result;
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Review failed" }, { status: 500 });
  }

  return NextResponse.json({ review: review || "The reviewer returned nothing." });
}
