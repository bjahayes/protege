import { NextRequest, NextResponse } from "next/server";
import { getJobManager } from "@/lib/job-manager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Undo a change that was applied (merged) into the project.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await getJobManager().undoJob(id);
  return NextResponse.json(res, { status: res.ok ? 200 : 409 });
}
