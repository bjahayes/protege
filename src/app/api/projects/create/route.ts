import { NextRequest, NextResponse } from "next/server";
import { createProjectFromTemplate, getTemplate } from "@/lib/templates";
import { projectIdFromPath } from "@/lib/config";
import { getJobManager } from "@/lib/job-manager";

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

  let created;
  try {
    created = createProjectFromTemplate({ templateId, name });
  } catch (e: any) {
    return NextResponse.json({ error: `Couldn't create the project: ${e?.message}` }, { status: 500 });
  }

  const projectId = projectIdFromPath(created.path);

  // If they described what they want, put an agent on it right away.
  let jobId: string | undefined;
  if (description) {
    const prompt =
      `This is a brand-new project started from the "${tpl.name}" template ` +
      `(${tpl.blurb}). The starter files already work. ` +
      `Tailor the project to what the user wants, keeping it a simple, self-contained web page ` +
      `(HTML/CSS/JS, no build step) unless they clearly need more.\n\n` +
      `What the user wants:\n${description}`;
    const job = getJobManager().launch({
      projectPath: created.path,
      projectName: created.name,
      prompt,
      kind: "run",
      permissionMode: "acceptEdits",
      isolate: false, // brand-new empty repo — build directly; history still allows undo
      primeContext: false, // nothing to prime yet
      autoVerify: false,
    });
    jobId = job.id;
  }

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
