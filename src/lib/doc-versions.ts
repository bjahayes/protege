// Server-only. Every version of a project's documents (PLAN.md, DESIGN.md, reports…), kept in
// Protégé's notes: .protege/versions/<document>/v<N> plus index.json saying, for each version,
// when it was made, by which agent (or by restoring an older one), and in which run.
// A version is saved only when the document actually changed.

import fs from "fs";
import path from "path";
import { metaPath } from "./meta";

export interface DocVersion {
  n: number;
  at: number;
  /** Who made it: an agent's name, "Before Protégé's agents" or "Restored version N". */
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
  if (last && readVersion(dir, rel, last.n) === text) return null;
  const v: DocVersion = { n: (last?.n || 0) + 1, at: Date.now(), bytes: Buffer.byteLength(text), ...meta };
  fs.mkdirSync(folder(dir, rel), { recursive: true });
  fs.writeFileSync(path.join(folder(dir, rel), `v${v.n}`), text, "utf8");
  fs.writeFileSync(indexFile(dir, rel), JSON.stringify({ document: rel, versions: [...versions, v] }, null, 2), "utf8");
  return v;
}

/** Before an agent first changes a document, keep the version it started from. */
export function keepStartingVersion(dir: string, rel: string) {
  if (!listVersions(dir, rel).length) recordVersion(dir, rel, { by: "Before Protégé's agents" });
}

/** Put an older version back as the document, saved as a new version saying where it came from. */
export function restoreVersion(dir: string, rel: string, n: number): DocVersion | null {
  const text = readVersion(dir, rel, n);
  if (text === null) return null;
  fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
  fs.writeFileSync(path.join(dir, rel), text, "utf8");
  return recordVersion(dir, rel, { by: `Restored version ${n}` });
}
