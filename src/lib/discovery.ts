import fs from "fs";
import path from "path";
import { listSessions, getSessionMessages } from "@anthropic-ai/claude-agent-sdk";
import { getDb } from "./store";
import { isNoisePath, projectIdFromPath } from "./config";
import { readDocsMeta } from "./docs";
import { plainSummaryExcerpt } from "./plain-summary";
import { readAssessment } from "./assessment";
import { getJobManager } from "./job-manager";
import { knownFolders } from "./known-folders";
import type { ProjectSummary, SessionInfo } from "./types";

interface CwdAgg {
  count: number;
  last: number;
  summary?: string;
  branch?: string;
}

function partsCounts(dir: string): ProjectSummary["parts"] {
  try {
    const a = readAssessment(dir);
    if (!a?.components?.length) return undefined;
    const c = { solid: 0, partial: 0, other: 0 };
    for (const x of a.components) {
      if (x.status === "solid") c.solid++;
      else if (x.status === "partial" || x.status === "stub") c.partial++;
      else c.other++;
    }
    return c;
  } catch {
    return undefined;
  }
}

export async function discoverProjects(): Promise<ProjectSummary[]> {
  let sessions: any[] = [];
  try {
    sessions = await listSessions();
  } catch {
    sessions = [];
  }

  const byCwd = new Map<string, CwdAgg>();
  for (const s of sessions) {
    const cwd: string | undefined = s.cwd;
    if (!cwd || isNoisePath(cwd)) continue;
    const e = byCwd.get(cwd) ?? { count: 0, last: 0 };
    e.count++;
    if ((s.lastModified ?? 0) >= e.last) {
      e.last = s.lastModified ?? 0;
      e.summary = s.customTitle || s.summary || s.firstPrompt;
      e.branch = s.gitBranch;
    }
    byCwd.set(cwd, e);
  }

  // Folders Claude Code or Claude desktop has been used in whose sessions are gone.
  const key = (p: string) => (process.platform === "win32" ? path.resolve(p).toLowerCase() : path.resolve(p));
  const seen = new Set([...byCwd.keys()].map(key));
  for (const f of knownFolders()) {
    if (seen.has(key(f.path))) continue;
    seen.add(key(f.path));
    byCwd.set(f.path, { count: 0, last: f.last });
  }

  const db = getDb();
  const registered = db.prepare(`SELECT * FROM projects`).all() as any[];
  const regByPath = new Map(registered.map((r) => [r.path, r]));
  for (const r of registered) {
    if (!seen.has(key(r.path))) {
      byCwd.set(r.path, { count: 0, last: r.last_seen ?? 0 });
    }
  }

  const live = getJobManager().liveCountByPath();

  const out: ProjectSummary[] = [];
  for (const [p, e] of byCwd) {
    const reg = regByPath.get(p);
    let exists = false;
    try {
      exists = fs.existsSync(p);
    } catch {
      exists = false;
    }
    const docs = exists
      ? readDocsMeta(p)
      : { hasDesign: false, hasPlan: false, hasClaudeMd: false, taskCounts: { todo: 0, doing: 0, done: 0 } };

    out.push({
      id: projectIdFromPath(p),
      path: p,
      name: reg?.name || path.basename(p) || p,
      source: reg ? "registered" : "discovered",
      sessionCount: e.count,
      lastActivity: e.last || null,
      summary: e.summary,
      plainSummaryLine: exists ? plainSummaryExcerpt(p) || undefined : undefined,
      parts: exists ? partsCounts(p) : undefined,
      gitBranch: e.branch,
      tags: reg?.tags ? safeArr(reg.tags) : [],
      liveAgents: live[p] || 0,
      tasks: docs.taskCounts,
      hasDesign: docs.hasDesign,
      hasPlan: docs.hasPlan,
      hasClaudeMd: docs.hasClaudeMd,
      exists,
    });
  }

  out.sort((a, b) => {
    // live agents first, then most-recent activity
    if (b.liveAgents !== a.liveAgents) return b.liveAgents - a.liveAgents;
    return (b.lastActivity || 0) - (a.lastActivity || 0);
  });
  return out;
}

export async function getProject(projectPath: string): Promise<ProjectSummary | null> {
  const all = await discoverProjects();
  return all.find((p) => p.path === projectPath) || null;
}

export async function sessionsForCwd(cwd: string): Promise<SessionInfo[]> {
  let sessions: any[] = [];
  try {
    sessions = await listSessions({ dir: cwd } as any);
  } catch {
    try {
      sessions = (await listSessions()).filter((s: any) => s.cwd === cwd);
    } catch {
      sessions = [];
    }
  }
  return sessions
    .map((s) => ({
      sessionId: s.sessionId,
      summary: s.customTitle || s.summary || s.firstPrompt || "(untitled)",
      firstPrompt: s.firstPrompt,
      lastModified: s.lastModified,
      createdAt: s.createdAt,
      gitBranch: s.gitBranch,
      fileSize: s.fileSize,
    }))
    .sort((a, b) => b.lastModified - a.lastModified);
}

export async function sessionTranscript(sessionId: string, cwd?: string) {
  const tryGet = async (opts?: any) => {
    try {
      return await getSessionMessages(sessionId, opts);
    } catch {
      return [];
    }
  };
  // The SDK's dir→project-folder encoding expects forward slashes; a Windows
  // backslash path silently returns 0 messages. Normalize, and fall back to a
  // dir-less lookup (session ids are unique across projects).
  let msgs: any[] = [];
  if (cwd) msgs = await tryGet({ dir: cwd.replace(/\\/g, "/") });
  if (!msgs.length) msgs = await tryGet(undefined);
  return msgs;
}

function safeArr(s: string): string[] {
  try {
    const j = JSON.parse(s);
    return Array.isArray(j) ? j : [];
  } catch {
    return [];
  }
}
