import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import { pathFromProjectId } from "@/lib/config";
import {
  listCheckpoints,
  createCheckpoint,
  restoreCheckpoint,
  deleteCheckpoint,
  exportCheckpoint,
} from "@/lib/checkpoints";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const dir = pathFromProjectId(id);
  const exportId = req.nextUrl.searchParams.get("export");
  if (exportId) {
    const data = exportCheckpoint(dir, exportId);
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(data);
  }
  return NextResponse.json({ checkpoints: listCheckpoints(dir) });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const dir = pathFromProjectId(id);
  if (!fs.existsSync(dir)) return NextResponse.json({ error: "Project folder missing" }, { status: 400 });
  const body = await req.json().catch(() => ({}));

  if (body.action === "restore") {
    const res = restoreCheckpoint(dir, body.checkpointId);
    return NextResponse.json(res, { status: res.ok ? 200 : 404 });
  }
  if (body.action === "delete") {
    deleteCheckpoint(dir, body.checkpointId);
    return NextResponse.json({ ok: true, checkpoints: listCheckpoints(dir) });
  }
  // create — id is time-based; the client passes it to avoid Date.now() differences.
  const cpId = String(body.id || Date.now());
  const meta = createCheckpoint(dir, body.name || "", cpId);
  return NextResponse.json({ ok: true, checkpoint: meta, checkpoints: listCheckpoints(dir) });
}
