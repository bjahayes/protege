// Server-only. The one way an API route turns a project id into a folder.
//
// A project id is just the folder path, encoded, so on its own it could name any folder on the
// computer. projectDir only returns the folder if it is a project Protégé knows: one you
// registered, one Claude Code has been used in (from its saved sessions), or a demo project.
// Anything else is "unknown project", so no route can be pointed at an arbitrary folder.

import path from "path";
import { NextResponse } from "next/server";
import { listSessions } from "@anthropic-ai/claude-agent-sdk";
import { isNoisePath, pathFromProjectId } from "./config";
import { getDb } from "./store";
import { isDemoId, materializeDemo } from "./demo";

const norm = (p: string) => {
  const r = path.resolve(p).replace(/\\/g, "/").replace(/\/+$/, "");
  return process.platform === "win32" ? r.toLowerCase() : r;
};

let discovered: { at: number; set: Set<string> } | null = null;

async function discoveredPaths(fresh: boolean): Promise<Set<string>> {
  // A fresh look is rate-limited, so unknown ids can't make it re-read every session file.
  const maxAge = fresh ? 5_000 : 30_000;
  if (discovered && Date.now() - discovered.at < maxAge) return discovered.set;
  let sessions: { cwd?: string }[] = [];
  try {
    sessions = await listSessions();
  } catch {
    sessions = [];
  }
  const set = new Set<string>();
  for (const s of sessions) if (s.cwd && !isNoisePath(s.cwd)) set.add(norm(s.cwd));
  discovered = { at: Date.now(), set };
  return set;
}

function registeredPaths(): Set<string> {
  try {
    const rows = getDb().prepare(`SELECT path FROM projects`).all() as { path: string }[];
    return new Set(rows.map((r) => norm(r.path)));
  } catch {
    return new Set();
  }
}

/** The folder of a known project, or null for an id that names anything else. */
export async function projectDir(id: string | null | undefined): Promise<string | null> {
  if (!id) return null;
  if (isDemoId(id)) {
    try {
      return materializeDemo(id);
    } catch {
      return null;
    }
  }
  let p: string;
  try {
    p = pathFromProjectId(id);
  } catch {
    return null;
  }
  if (!p || !path.isAbsolute(p)) return null;
  const n = norm(p);
  if (registeredPaths().has(n)) return p;
  if ((await discoveredPaths(false)).has(n)) return p;
  // A project Claude Code was used in moments ago may not be in the cached list yet.
  if ((await discoveredPaths(true)).has(n)) return p;
  return null;
}

export function unknownProject() {
  return NextResponse.json({ error: "Unknown project" }, { status: 404 });
}
