import { NextRequest, NextResponse } from "next/server";
import { previewPort, startPreviewServer } from "@/lib/preview-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Where project previews are served from (their own origin; see lib/preview-server.ts).
export async function GET(req: NextRequest) {
  startPreviewServer();
  const host = (req.headers.get("host") || "127.0.0.1").replace(/:\d+$/, "");
  return NextResponse.json({ origin: `http://${host}:${previewPort()}` });
}
