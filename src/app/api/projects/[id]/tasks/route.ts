import { NextRequest, NextResponse } from "next/server";
import { projectDir, unknownProject } from "@/lib/project-guard";
import { readTasks, writeTasks } from "@/lib/docs";
import { isDemoId } from "@/lib/demo";
import type { Task } from "@/lib/types";
import { randomUUID } from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";



export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const dir = await projectDir(id);
  if (!dir) return unknownProject();
  return NextResponse.json({ tasks: readTasks(dir) });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const dir = await projectDir(id);
  if (!dir) return unknownProject();
  const body = await req.json().catch(() => ({}));
  const tasks = readTasks(dir);
  const now = Date.now();

  if (body.op === "add") {
    const t: Task = {
      id: randomUUID(),
      title: String(body.title || "Untitled task"),
      status: "todo",
      notes: body.notes ? String(body.notes) : undefined,
      createdAt: now,
      updatedAt: now,
    };
    tasks.push(t);
  } else if (body.op === "update") {
    const t = tasks.find((x) => x.id === body.id);
    if (t) {
      if (body.status) t.status = body.status;
      if (body.title !== undefined) t.title = body.title;
      if (body.notes !== undefined) t.notes = body.notes;
      t.updatedAt = now;
    }
  } else if (body.op === "delete") {
    const idx = tasks.findIndex((x) => x.id === body.id);
    if (idx >= 0) tasks.splice(idx, 1);
  } else {
    return NextResponse.json({ error: "unknown op" }, { status: 400 });
  }

  try {
    writeTasks(dir, tasks);
  } catch (e: any) {
    return NextResponse.json({ error: `Write failed: ${e?.message}` }, { status: 500 });
  }
  return NextResponse.json({ tasks });
}
