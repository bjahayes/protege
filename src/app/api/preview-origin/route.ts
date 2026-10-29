import { NextRequest, NextResponse } from "next/server";
import { previewPort, startPreviewServer } from "@/lib/preview-server";
import { previewPath } from "@/lib/preview-key";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Where project previews are served from (their own origin; see lib/preview-server.ts), and the
// keyed address of one project's preview (?project=<id>) or one safe copy's (?job=<id>).
export async function GET(req: NextRequest) {
  startPreviewServer();
  const host = (req.headers.get("host") || "127.0.0.1").replace(/:\d+$/, "");
  const origin = `http://${host}:${previewPort()}`;
  const project = req.nextUrl.searchParams.get("project");
  const job = req.nextUrl.searchParams.get("job");
  return NextResponse.json({
    origin,
    ...(project ? { url: origin + previewPath("project", project) } : {}),
    ...(job ? { jobUrl: origin + previewPath("job", job) } : {}),
  });
}
