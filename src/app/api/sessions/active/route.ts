import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { listSessions } from "@anthropic-ai/claude-agent-sdk";
import { isNoisePath, projectIdFromPath } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Sessions whose transcript was written very recently are "live" — this catches
// interactive Claude Code sessions (your terminal/IDE) that Protégé didn't launch.
export async function GET(req: NextRequest) {
  const windowSec = Math.min(600, Math.max(20, parseInt(req.nextUrl.searchParams.get("window") || "90", 10)));
  const windowMs = windowSec * 1000;
  const now = Date.now();

  let sessions: any[] = [];
  try {
    sessions = await listSessions();
  } catch {
    sessions = [];
  }

  const active = sessions
    .filter((s) => s.cwd && !isNoisePath(s.cwd) && now - s.lastModified < windowMs)
    .map((s) => ({
      sessionId: s.sessionId,
      cwd: s.cwd,
      projectId: projectIdFromPath(s.cwd),
      projectName: path.basename(s.cwd) || s.cwd,
      summary: s.customTitle || s.summary || s.firstPrompt || "(untitled)",
      lastModified: s.lastModified,
      gitBranch: s.gitBranch,
    }))
    .sort((a, b) => b.lastModified - a.lastModified);

  return NextResponse.json({ sessions: active });
}
