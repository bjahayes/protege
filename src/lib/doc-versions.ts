// Server-only. Every version of a project's documents (PLAN.md, DESIGN.md, reports…), kept in
// Protégé's notes: .protege/versions/<document>/v<N> plus index.json saying, for each version,
// when it was made, by whom (an agent, a git save, an edit outside Protégé, or restoring an older
// one), and in which run. A version is saved only when the document actually changed.
//
// Versions don't depend on who changes a document. ensureVersioned() runs whenever Protégé reads
// one: the first time, it brings in the document's past versions from git; after that, any change
// since the last saved version becomes a new version. Agent runs save theirs as they finish, and
// while one is working on a document the check waits, so the version is credited to the agent.

import fs from "fs";
import path from "path";
import { gitExe } from "./git-bin";
import { execFileSync } from "child_process";
import { metaPath } from "./meta";

export interface DocVersion {
  n: number;
  at: number;
  /** Who made it: an agent's name, a git save, "Changed outside Protégé's agents", "As Protégé first found it" or "Restored version N". */
  by: string;
  agentId?: string;
  agentVersion?: number;
  jobId?: string;
  bytes: number;
}

// One folder per document, named from its path so nested files can't collide.
const key = (rel: string) => rel.replace(/[\\/]+/g, "__").replace(/[^A-Za-z0-9._-]/g, "_");
const folder = (dir: string, rel: string) => metaPath(dir, "versions", key(rel));
const indexFile = (dir: string, rel: string) => path.join(folder(dir, rel), "index.json");

export function listVersions(dir: string, rel: string): DocVersion[] {
  try {
    const j = JSON.parse(fs.readFileSync(indexFile(dir, rel), "utf8"));
    return Array.isArray(j.versions) ? j.versions : [];
  } catch {
    return [];
  }
}

export function readVersion(dir: string, rel: string, n: number): string | null {
  try {
    return fs.readFileSync(path.join(folder(dir, rel), `v${n}`), "utf8");
  } catch {
    return null;
  }
}

// The same text with Windows or Unix line endings is the same version.
const CR = String.fromCharCode(13);
const same = (a: string | null, b: string | null) =>
  a !== null && b !== null && a.split(CR).join("") === b.split(CR).join("");

function current(dir: string, rel: string): string | null {
  try {
    return fs.readFileSync(path.join(dir, rel), "utf8");
  } catch {
    return null;
  }
}

/** Save the document as it is now as a new version, unless it's unchanged. Returns the version. */
export function recordVersion(dir: string, rel: string, meta: Omit<DocVersion, "n" | "at" | "bytes">): DocVersion | null {
  const text = current(dir, rel);
  if (text === null) return null;
  const versions = listVersions(dir, rel);
  const last = versions[versions.length - 1];
  if (last && same(readVersion(dir, rel, last.n), text)) return null;
  const v: DocVersion = { n: (last?.n || 0) + 1, at: Date.now(), bytes: Buffer.byteLength(text), ...meta };
  fs.mkdirSync(folder(dir, rel), { recursive: true });
  fs.writeFileSync(path.join(folder(dir, rel), `v${v.n}`), text, "utf8");
  fs.writeFileSync(indexFile(dir, rel), JSON.stringify({ document: rel, versions: [...versions, v] }, null, 2), "utf8");
  return v;
}

// Documents an agent is working on now: their changes are the agent's, recorded when it finishes.
const g = globalThis as any;
const working: Map<string, number> = (g.__protegeDocsInWork ||= new Map());
const workKey = (dir: string, rel: string) => `${path.resolve(dir).toLowerCase()}|${rel}`;

export function startWork(dir: string, rel: string) {
  ensureVersioned(dir, rel);
  working.set(workKey(dir, rel), (working.get(workKey(dir, rel)) || 0) + 1);
}
export function endWork(dir: string, rel: string) {
  const k = workKey(dir, rel);
  const n = (working.get(k) || 1) - 1;
  if (n > 0) working.set(k, n);
  else working.delete(k);
}

const git = (dir: string, args: string[]) =>
  execFileSync(gitExe(), args, { cwd: dir, encoding: "utf8", maxBuffer: 32 * 1024 * 1024, windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });

/** The document's saved versions in git, oldest first (up to the last 50 changes). */
function gitVersions(dir: string, rel: string): { at: number; by: string; text: string }[] {
  try {
    const log = git(dir, ["log", "--follow", "-n", "50", "--format=%H%x09%at%x09%an%x09%s", "--", rel]).trim();
    if (!log) return [];
    const out: { at: number; by: string; text: string }[] = [];
    for (const line of log.split("\n").reverse()) {
      const [hash, at, author, ...subject] = line.split("\t");
      let text: string;
      try {
        text = git(dir, ["show", `${hash}:${rel}`]);
      } catch {
        continue; // the file was under another name then
      }
      const what = subject.join("\t").trim();
      out.push({ at: Number(at) * 1000, by: `Saved in git by ${author}${what ? `: “${what.slice(0, 120)}”` : ""}`, text });
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Make sure the document as it is now is a saved version. The first time, its past versions are
 * brought in from git. Called whenever Protégé reads a document, so every change it sees is kept,
 * whoever made it.
 */
export function ensureVersioned(dir: string, rel: string): void {
  if (working.has(workKey(dir, rel))) return;
  const text = current(dir, rel);
  if (text === null) return;
  let versions = listVersions(dir, rel);
  if (!versions.length) {
    const past = gitVersions(dir, rel);
    if (past.length) {
      fs.mkdirSync(folder(dir, rel), { recursive: true });
      const list: DocVersion[] = [];
      for (const v of past) {
        if (list.length && same(readVersion(dir, rel, list[list.length - 1].n), v.text)) continue;
        const n = list.length + 1;
        fs.writeFileSync(path.join(folder(dir, rel), `v${n}`), v.text, "utf8");
        list.push({ n, at: v.at, by: v.by, bytes: Buffer.byteLength(v.text) });
      }
      fs.writeFileSync(indexFile(dir, rel), JSON.stringify({ document: rel, versions: list }, null, 2), "utf8");
      versions = list;
    }
  }
  const last = versions[versions.length - 1];
  if (last && same(readVersion(dir, rel, last.n), text)) return;
  recordVersion(dir, rel, { by: last ? "Changed outside Protégé's agents" : "As Protégé first found it" });
}

/** Put an older version back as the document, saved as a new version saying where it came from. */
export function restoreVersion(dir: string, rel: string, n: number): DocVersion | null {
  const text = readVersion(dir, rel, n);
  if (text === null) return null;
  // The document as it is now may hold edits never saved as a version (made since the last time
  // Protégé read it): save them first, so putting an old version back never loses them.
  const now = current(dir, rel);
  const versions = listVersions(dir, rel);
  const last = versions[versions.length - 1];
  if (now !== null && !(last && same(readVersion(dir, rel, last.n), now))) {
    recordVersion(dir, rel, { by: `Saved before restoring version ${n}` });
  }
  fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
  fs.writeFileSync(path.join(dir, rel), text, "utf8");
  return recordVersion(dir, rel, { by: `Restored version ${n}` });
}
