import { NextRequest, NextResponse } from "next/server";
import { projectDir, unknownProject } from "@/lib/project-guard";
import { projectTurns, sessionTurns } from "@/lib/turn-history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The project's History tab.
//   GET                          every turn of every saved conversation in the folder, newest first
//                                (with the summaries already written)
//   GET ?session=<id>&turn=<n>   one turn's chat items, to show it in full
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const dir = await projectDir(id);
  if (!dir) return unknownProject();
  const session = req.nextUrl.searchParams.get("session");
  if (session) {
    const n = Number(req.nextUrl.searchParams.get("turn") || 0);
    const ts = await sessionTurns(session, dir, req.nextUrl.searchParams.get("stamp") || "");
    return NextResponse.json({ items: ts[n] || [], cwd: dir });
  }
  return NextResponse.json({ turns: await projectTurns(dir), cwd: dir });
}
