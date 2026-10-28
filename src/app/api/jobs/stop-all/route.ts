import { NextResponse } from "next/server";
import { getJobManager } from "@/lib/job-manager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const stopped = await getJobManager().stopAll();
  return NextResponse.json({ ok: true, stopped });
}
