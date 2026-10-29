import { NextRequest, NextResponse } from "next/server";
import { projectDir } from "@/lib/project-guard";
import { readAssessment } from "@/lib/assessment";
import { planParts } from "@/lib/plan-parts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A Plan-mode plan from the Code page, read for the context panel: its steps, and the parts of
// the project it will change or add (lib/plan-parts.ts).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const plan = String(body.plan || "").trim();
  if (!plan) return NextResponse.json({ error: "plan is required" }, { status: 400 });
  const dir = await projectDir(String(body.projectId || ""));
  const parts = ((dir && readAssessment(dir)?.components) || []).map((c) => c.name);
  return NextResponse.json({ plan: await planParts(plan.slice(0, 20_000), parts) });
}
