import { NextRequest, NextResponse } from "next/server";
import { createProjectFromTemplate, getTemplate } from "@/lib/templates";
import { projectIdFromPath } from "@/lib/config";
import { launchShaping, writeStarter } from "@/lib/starter";
import { excludeNotes } from "@/lib/git";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Create a brand-new project from a friendly template, then (optionally) launch
// an agent to tailor it to the user's plain-language description.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const templateId: string = (body.templateId || "").trim();
  const name: string = (body.name || "").trim();
  const description: string = (body.description || "").trim();

  const tpl = getTemplate(templateId);
  if (!tpl) {
    return NextResponse.json({ error: "Please choose a template." }, { status: 400 });
  }
  if (!name) {
    return NextResponse.json({ error: "Please give your project a name." }, { status: 400 });
  }
  if (tpl.needsDescription && !description) {
    return NextResponse.json({ error: "Please say what you'd like it to do, so Protégé knows what to build." }, { status: 400 });
  }

  let created;
  try {
    created = createProjectFromTemplate({ templateId, name });
  } catch (e: any) {
    return NextResponse.json({ error: `Couldn't create the project: ${e?.message}` }, { status: 500 });
  }

  const projectId = projectIdFromPath(created.path);

  // If they described what they want, put an agent on it right away.
  const jobId = description ? launchShaping(created.path, created.name, tpl, description) : undefined;

  // The getting-started record the project page shows its steps from. Protégé's notes stay
  // out of the project's git history, as in any project.
  await excludeNotes(created.path);
  writeStarter(created.path, {
    template: tpl.id,
    templateName: tpl.name,
    name: created.name,
    createdAt: Date.now(),
    description: description || undefined,
    buildJobId: jobId,
  });

  return NextResponse.json({
    ok: true,
    projectId,
    path: created.path,
    name: created.name,
    preview: created.preview,
    gitRepo: created.gitRepo,
    jobId,
  });
}
