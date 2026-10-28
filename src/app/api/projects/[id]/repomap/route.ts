import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import { pathFromProjectId } from "@/lib/config";
import { computeRepoMap } from "@/lib/repomap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const dir = pathFromProjectId(id);
  if (!fs.existsSync(dir)) {
    return NextResponse.json({ error: "Project folder missing" }, { status: 400 });
  }
  try {
    const map = computeRepoMap(dir);
    return NextResponse.json({ map });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to compute repo map" }, { status: 500 });
  }
}
