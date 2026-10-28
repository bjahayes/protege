// Server-only. Folders Claude Code has been used in, beyond the ones it still has saved sessions
// for: Claude Code deletes old sessions (after 30 days by default), but its settings file
// (~/.claude.json) keeps every folder it has opened, and Claude desktop keeps a record of each
// Code session's folder. Read only, for finding projects; anything missing or unreadable is skipped.

import fs from "fs";
import os from "os";
import path from "path";
import { isNoisePath } from "./config";

export interface KnownFolder {
  path: string;
  /** When Claude desktop last used it, or else when the folder last changed. */
  last: number;
}

function desktopDir(): string {
  if (process.platform === "win32") return path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "Claude");
  if (process.platform === "darwin") return path.join(os.homedir(), "Library", "Application Support", "Claude");
  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), "Claude");
}

/** Claude desktop's Code session records: <dir>/claude-code-sessions/<account>/<org>/local_*.json. */
function desktopFolders(add: (p: string, last: number) => void) {
  const root = path.join(desktopDir(), "claude-code-sessions");
  const walk = (d: string, depth: number) => {
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory() && depth < 3) walk(p, depth + 1);
      else if (e.isFile() && /^local_.*\.json$/.test(e.name)) {
        try {
          const j = JSON.parse(fs.readFileSync(p, "utf8"));
          if (typeof j.cwd === "string") add(j.cwd, Number(j.lastActivityAt) || 0);
        } catch {
          /* unreadable record */
        }
      }
    }
  };
  walk(root, 0);
}

function settingsFolders(add: (p: string, last: number) => void) {
  const file = path.join(process.env.CLAUDE_CONFIG_DIR || os.homedir(), ".claude.json");
  try {
    const j = JSON.parse(fs.readFileSync(file, "utf8"));
    for (const p of Object.keys(j.projects || {})) add(p, 0);
  } catch {
    /* no settings file */
  }
}

let cache: { at: number; folders: KnownFolder[] } | null = null;

/** Existing folders Claude Code or Claude desktop has been used in, one entry per folder. */
export function knownFolders(): KnownFolder[] {
  if (cache && Date.now() - cache.at < 30_000) return cache.folders;
  const byKey = new Map<string, KnownFolder>();
  const add = (raw: string, last: number) => {
    if (!raw || !path.isAbsolute(raw)) return;
    const p = path.resolve(raw);
    if (isNoisePath(p)) return;
    const key = process.platform === "win32" ? p.toLowerCase() : p;
    const cur = byKey.get(key);
    if (cur) cur.last = Math.max(cur.last, last);
    else byKey.set(key, { path: p, last });
  };
  settingsFolders(add);
  desktopFolders(add);
  const folders = [...byKey.values()].filter((f) => {
    try {
      const st = fs.statSync(f.path);
      // With no record of when it was last used, the folder's own last change stands in.
      if (!f.last) f.last = st.mtimeMs;
      return st.isDirectory();
    } catch {
      return false;
    }
  });
  cache = { at: Date.now(), folders };
  return folders;
}
