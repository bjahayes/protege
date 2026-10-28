import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import { pathFromProjectId } from "@/lib/config";
import { getProject } from "@/lib/discovery";
import { getMissionManager } from "@/lib/mission-manager";
import type { PermissionMode } from "@anthropic-ai/claude-agent-sdk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const dir = pathFromProjectId(id);
  return NextResponse.json({ mission: getMissionManager().get(dir) });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const dir = pathFromProjectId(id);
  if (!fs.existsSync(dir)) {
    return NextResponse.json({ error: "Project folder missing" }, { status: 400 });
  }
  const body = await req.json().catch(() => ({}));
  const mm = getMissionManager();

  if (body.action === "stop") {
    mm.stop(dir);
    return NextResponse.json({ mission: mm.get(dir) });
  }

  // start
  const project = await getProject(dir);
  const mission = mm.start(dir, project?.name || dir, {
    model: body.model || undefined,
    permissionMode: (body.permissionMode as PermissionMode) || "acceptEdits",
    isolate: !!body.isolate,
    autoResume: body.autoResume !== false,
  });
  return NextResponse.json({ mission });
}
