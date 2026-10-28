import { NextRequest, NextResponse } from "next/server";
import { getJobManager } from "@/lib/job-manager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Keep a change made on a safe copy. { saveFirst: true } first saves any unsaved changes in
// the project (exactly as they are), when the first try said there were some.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const res = await getJobManager().applyJob(id, { saveFirst: body.saveFirst === true });
  return NextResponse.json(res, { status: res.ok ? 200 : 409 });
}
