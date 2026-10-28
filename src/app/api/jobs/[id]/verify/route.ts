import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import { getJobManager } from "@/lib/job-manager";
import { verifyDir, persistChecks } from "@/lib/verify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = getJobManager().get(id);
  const cwd = job?.worktreePath && fs.existsSync(job.worktreePath) ? job.worktreePath : job?.projectPath;
  if (!cwd || !fs.existsSync(cwd)) {
    return NextResponse.json({ error: "No working directory to verify" }, { status: 400 });
  }
  const body = await req.json().catch(() => ({}));
  const result = await verifyDir(cwd, body.command);
  if (result.available) persistChecks(id, !!result.passed, result.command!);
  return NextResponse.json(result);
}
