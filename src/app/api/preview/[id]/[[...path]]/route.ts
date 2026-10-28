import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import { pathFromProjectId } from "@/lib/config";
import { contentTypeFor, injectBase, isHtml, resolvePreviewFile } from "@/lib/preview";
import { isDemoId, materializeDemo } from "@/lib/demo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Serve a static file from a project's directory so it can be previewed in an
// iframe. Read-only, confined to the project dir (traversal-guarded), localhost.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; path?: string[] }> }) {
  const { id, path: parts } = await params;

  let projectPath: string;
  if (isDemoId(id)) {
    // Demo projects are real folders on disk (materialized on demand), so the
    // preview reflects any changes the agent actually made.
    try {
      projectPath = materializeDemo(id);
    } catch {
      return new NextResponse("Unknown demo project", { status: 404 });
    }
  } else {
    try {
      projectPath = pathFromProjectId(id);
    } catch {
      return new NextResponse("Bad project id", { status: 400 });
    }
  }
  if (!fs.existsSync(projectPath)) {
    return new NextResponse("Project not found", { status: 404 });
  }

  const file = resolvePreviewFile(projectPath, parts || []);
  if (!file) {
    return new NextResponse("Nothing to preview here yet.", { status: 404 });
  }

  try {
    const headers = {
      "Content-Type": contentTypeFor(file),
      // Preview should always reflect the latest saved files.
      "Cache-Control": "no-store, must-revalidate",
    };
    if (isHtml(file)) {
      const html = injectBase(fs.readFileSync(file, "utf8"), `/api/preview/${id}/`);
      return new NextResponse(html, { status: 200, headers });
    }
    return new NextResponse(fs.readFileSync(file), { status: 200, headers });
  } catch {
    return new NextResponse("Couldn't read that file.", { status: 500 });
  }
}
