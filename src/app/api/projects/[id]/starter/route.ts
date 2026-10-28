import { NextRequest, NextResponse } from "next/server";
import { projectDir, unknownProject } from "@/lib/project-guard";
import { launchShaping, readStarter, writeStarter } from "@/lib/starter";
import { getTemplate } from "@/lib/templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Getting-started steps for a project made in Start something new.
//   { event: "tried" }       the person opened "See it working" (the Try it step)
//   { event: "dismissed" }   hide the steps on the project page
//   { event: "reshape" }     shaping didn't finish: run it again from the same description
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const dir = await projectDir(id);
  if (!dir) return unknownProject();
  const cur = readStarter(dir);
  if (!cur) return NextResponse.json({ ok: false });
  const b = await req.json().catch(() => ({}));
  if (b.event === "tried" && !cur.triedAt) writeStarter(dir, { triedAt: Date.now() });
  else if (b.event === "dismissed") writeStarter(dir, { dismissedAt: Date.now() });
  else if (b.event === "reshape") {
    const tpl = getTemplate(cur.template);
    if (!tpl || !cur.description) return NextResponse.json({ ok: false });
    const jobId = launchShaping(dir, cur.name, tpl, cur.description);
    writeStarter(dir, { buildJobId: jobId });
    return NextResponse.json({ ok: true, jobId });
  }
  return NextResponse.json({ ok: true });
}
