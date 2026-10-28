import { NextRequest, NextResponse } from "next/server";
import { getJobManager } from "@/lib/job-manager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await getJobManager().discardJob(id);
  return NextResponse.json(res);
}
