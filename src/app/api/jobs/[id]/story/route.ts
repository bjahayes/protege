import { NextRequest, NextResponse } from "next/server";
import { storyFor } from "@/lib/change-story";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// What a job changed, as a few numbered steps (lib/change-story.ts). ?quick=1 returns the
// grouping at once without the written titles.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const quick = req.nextUrl.searchParams.get("quick") === "1";
  const story = await storyFor(id, { quick });
  if (!story) return NextResponse.json({ error: "Unknown job" }, { status: 404 });
  return NextResponse.json({ story });
}
