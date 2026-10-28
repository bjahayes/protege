import { NextRequest, NextResponse } from "next/server";
import { projectDir, unknownProject } from "@/lib/project-guard";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Writes/overwrites PLAN.md from provided markdown (e.g. an inferred plan the
// user chose to adopt). Backs up any existing PLAN.md to PLAN.prev.md.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const dir = await projectDir(id);
  if (!dir) return unknownProject();
  if (!fs.existsSync(dir)) {
    return NextResponse.json({ error: "Project folder missing" }, { status: 400 });
  }
  const body = await req.json().catch(() => ({}));
  const markdown: string = body.markdown;
  if (!markdown || typeof markdown !== "string") {
    return NextResponse.json({ error: "markdown is required" }, { status: 400 });
  }
  const planFile = path.join(dir, "PLAN.md");
  try {
    if (fs.existsSync(planFile)) {
      fs.copyFileSync(planFile, path.join(dir, "PLAN.prev.md"));
    }
    fs.writeFileSync(planFile, markdown, "utf8");
  } catch (e: any) {
    return NextResponse.json({ error: `Write failed: ${e?.message}` }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
