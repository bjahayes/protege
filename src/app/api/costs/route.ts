import { NextResponse } from "next/server";
import { getDb } from "@/lib/store";
import { projectIdFromPath } from "@/lib/config";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const db = getDb();

  const totals = db
    .prepare(
      `SELECT COUNT(*) AS runs,
              COALESCE(SUM(cost_usd),0) AS cost,
              COALESCE(SUM(input_tokens),0) AS inTok,
              COALESCE(SUM(output_tokens),0) AS outTok
       FROM jobs`
    )
    .get() as any;

  const byProject = db
    .prepare(
      `SELECT project_path, project_name,
              COUNT(*) AS runs,
              COALESCE(SUM(cost_usd),0) AS cost,
              COALESCE(SUM(input_tokens),0) AS inTok,
              COALESCE(SUM(output_tokens),0) AS outTok,
              MAX(started_at) AS lastRun
       FROM jobs
       GROUP BY project_path
       ORDER BY cost DESC`
    )
    .all() as any[];

  const byKind = db
    .prepare(`SELECT kind, COUNT(*) AS runs, COALESCE(SUM(cost_usd),0) AS cost FROM jobs GROUP BY kind`)
    .all() as any[];

  const byModel = db
    .prepare(
      `SELECT COALESCE(model,'(default)') AS model, COUNT(*) AS runs, COALESCE(SUM(cost_usd),0) AS cost
       FROM jobs GROUP BY model ORDER BY cost DESC`
    )
    .all() as any[];

  return NextResponse.json({
    totals: {
      runs: totals.runs,
      cost: totals.cost,
      inputTokens: totals.inTok,
      outputTokens: totals.outTok,
    },
    byProject: byProject.map((r) => ({
      projectId: projectIdFromPath(r.project_path),
      projectPath: r.project_path,
      name: r.project_name || path.basename(r.project_path),
      runs: r.runs,
      cost: r.cost,
      inputTokens: r.inTok,
      outputTokens: r.outTok,
      lastRun: r.lastRun,
    })),
    byKind: byKind.map((r) => ({ kind: r.kind || "run", runs: r.runs, cost: r.cost })),
    byModel: byModel.map((r) => ({ model: r.model, runs: r.runs, cost: r.cost })),
  });
}
