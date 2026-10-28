import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { listSessions } from "@anthropic-ai/claude-agent-sdk";
import { isNoisePath, projectIdFromPath, pathFromProjectId } from "@/lib/config";
import { getChatManager } from "@/lib/chat-manager";
import { getDb } from "@/lib/store";
import { ATTACHED_PREFIX } from "@/lib/chat-format";

/** A conversation's title without the "Attached file: …" notes a chat message may carry. */
function cleanTitle(t: string): string {
  const i = t.indexOf(ATTACHED_PREFIX);
  const head = (i >= 0 ? t.slice(0, i) : t).trim();
  return head || (i >= 0 ? "Attached files" : "Untitled");
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Protégé's own one-off helper calls (suggestions, grading, reviews) used to be saved as
// sessions. They aren't conversations, so leave them out of the chat list.
const HELPER_PROMPTS = [
  /^Based on the project below, suggest 5/,
  /^You are grading whether a coding agent/,
  /^You are a rigorous second-opinion code reviewer/,
];

const norm = (p: string) => p.replace(/\\/g, "/").toLowerCase();

// Every saved Claude Code conversation on this computer (terminal, IDE, desktop, Protégé),
// newest first. `?projectId=` narrows to one folder.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const projectId = sp.get("projectId");
  const limit = Math.min(500, Math.max(10, parseInt(sp.get("limit") || "200", 10)));
  const want = projectId ? norm(pathFromProjectId(projectId)) : null;

  let sessions: any[] = [];
  try {
    sessions = await listSessions();
  } catch {
    sessions = [];
  }
  const cm = getChatManager();
  // Protégé's project assessments and summaries run as agent jobs; they aren't chats either.
  let internal = new Set<string>();
  try {
    const rows = getDb().prepare(`SELECT session_id FROM jobs WHERE kind = 'assess' AND session_id IS NOT NULL`).all() as any[];
    internal = new Set(rows.map((r) => r.session_id));
  } catch {
    /* ignore */
  }
  const exists = new Map<string, boolean>();
  const out = sessions
    .filter((s) => s.cwd && !isNoisePath(s.cwd))
    .filter((s) => !internal.has(s.sessionId) && !HELPER_PROMPTS.some((re) => re.test(String(s.firstPrompt || ""))))
    .filter((s) => !want || norm(s.cwd) === want)
    .filter((s) => {
      if (!exists.has(s.cwd)) exists.set(s.cwd, fs.existsSync(s.cwd));
      return exists.get(s.cwd);
    })
    .sort((a, b) => b.lastModified - a.lastModified)
    .slice(0, limit)
    .map((s) => {
      const live = cm.get(s.sessionId);
      return {
        sessionId: s.sessionId,
        cwd: s.cwd,
        projectId: projectIdFromPath(s.cwd),
        projectName: path.basename(s.cwd) || s.cwd,
        title: cleanTitle(String(s.customTitle || s.summary || s.firstPrompt || "Untitled")).slice(0, 200),
        lastModified: s.lastModified,
        gitBranch: s.gitBranch,
        status: live && live.status !== "ended" ? live.status : null,
        hereAt: cm.lastHere(s.sessionId) || undefined,
      };
    });

  // A brand-new chat isn't in the saved list until Claude Code writes its first message.
  const listed = new Set(out.map((s) => s.sessionId));
  const fresh = cm
    .list()
    .filter((c) => !listed.has(c.sessionId))
    .filter((c) => !want || norm(c.projectPath) === want)
    .map((c) => ({
      sessionId: c.sessionId,
      cwd: c.projectPath,
      projectId: c.projectId,
      projectName: c.projectName,
      title: "New chat",
      lastModified: c.lastActivity,
      gitBranch: undefined,
      status: c.status,
    }));

  return NextResponse.json({ sessions: [...fresh, ...out] });
}
