import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/engine";
import { getJobManager } from "@/lib/job-manager";
import { worktreeDiff } from "@/lib/git";
import { getDb } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// LLM-judge whether a completed run accomplished its task.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const jm = getJobManager();
  const job = jm.get(id);
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  const events = jm.getEvents(id);
  const resultEv = [...events].reverse().find((e) => e.type === "result");
  const finalReport = (resultEv?.payload?.result || "").slice(0, 3000);

  let changes = "";
  if (job.worktreePath) {
    try {
      const d = await worktreeDiff({ worktreePath: job.worktreePath, branch: job.branch, baseRef: job.baseRef });
      if (d.available) changes = d.files.map((f) => `${f.path} (+${f.additions} -${f.deletions})`).join(", ");
    } catch {
      /* ignore */
    }
  }

  const prompt =
    `You are grading whether a coding agent accomplished its task. Be strict but fair.\n\n` +
    `TASK: ${job.prompt}\n\n` +
    `OUTCOME STATUS: ${job.status}${job.error ? ` (${job.error})` : ""}\n` +
    `AGENT'S FINAL REPORT: ${finalReport || "(none)"}\n` +
    (changes ? `FILES CHANGED: ${changes}\n` : "") +
    `\nReturn ONLY a JSON object: {"score": <1-5 integer>, "verdict": "success"|"partial"|"failed", "reason": "<one sentence>"}.`;

  let text = "";
  try {
    for await (const msg of query({
      prompt,
      options: { model: "claude-haiku-4-5-20251001", tools: [], maxTurns: 1, settingSources: [], persistSession: false } as any,
    }) as any) {
      if (msg.type === "result" && typeof msg.result === "string") text = msg.result;
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Eval failed" }, { status: 500 });
  }

  let parsed: any = null;
  try {
    const m = text.match(/\{[\s\S]*\}/);
    parsed = m ? JSON.parse(m[0]) : null;
  } catch {
    parsed = null;
  }
  if (!parsed) return NextResponse.json({ score: null, verdict: "unknown", reason: text.slice(0, 200) });
  try {
    getDb()
      .prepare(`UPDATE jobs SET eval_score = ?, eval_verdict = ?, eval_reason = ? WHERE id = ?`)
      .run(Number(parsed.score) || null, String(parsed.verdict || ""), String(parsed.reason || ""), id);
  } catch {
    /* ignore */
  }
  return NextResponse.json({ score: parsed.score, verdict: parsed.verdict, reason: parsed.reason });
}
