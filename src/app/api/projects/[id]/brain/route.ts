import { NextRequest, NextResponse } from "next/server";
import { pathFromProjectId } from "@/lib/config";
import { getProjectBrain } from "@/lib/brain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const dir = pathFromProjectId(id);
  return NextResponse.json({ brain: getProjectBrain(dir) });
}
