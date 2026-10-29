import { NextRequest, NextResponse } from "next/server";
import { projectDir } from "@/lib/project-guard";
import { readAssessment } from "@/lib/assessment";
import { chatStory } from "@/lib/change-story";
import type { StoryFile } from "@/lib/story-steps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILES = 200;
const MAX_PATCH = 40_000;

// What Claude's edits in a Code conversation changed, as a few numbered steps (the context
// panel beside the chat). The page sends the edits it already shows; the steps are written once
// per change and kept.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const files: StoryFile[] = (Array.isArray(body.files) ? body.files : []).slice(0, MAX_FILES).map((f: any) => ({
    path: String(f?.path || "").slice(0, 500),
    status: f?.status === "A" ? "A" : f?.status === "D" ? "D" : "M",
    additions: Math.max(0, Number(f?.additions) || 0),
    deletions: Math.max(0, Number(f?.deletions) || 0),
    patch: typeof f?.patch === "string" ? f.patch.slice(0, MAX_PATCH) : undefined,
  }));
  if (!files.length || files.some((f) => !f.path)) return NextResponse.json({ error: "files are required" }, { status: 400 });
  const dir = await projectDir(String(body.projectId || ""));
  const components = (dir && readAssessment(dir)?.components) || [];
  const story = await chatStory({
    files,
    components,
    request: String(body.request || "").slice(0, 4000),
    report: String(body.report || "").slice(0, 4000),
  });
  return NextResponse.json({ story });
}
