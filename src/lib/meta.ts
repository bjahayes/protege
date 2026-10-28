// Server-only. Where Protégé keeps its notes inside a project: the `.protege/` folder
// (tasks.json, status.md, assessment.json, plain-summary.md, checkpoints/ …).
//
// Projects first used with the earlier name have these files in `.buildwork/`. A file that
// already exists there is read and updated where it is, so nothing in those projects moves;
// anything new goes in `.protege/`.

import fs from "fs";
import path from "path";

export const META_DIR = ".protege";
const OLD_META_DIR = ".buildwork";

/** Absolute path of one of Protégé's notes in a project (an existing old-folder copy wins). */
export function metaPath(dir: string, ...parts: string[]): string {
  const now = path.join(dir, META_DIR, ...parts);
  if (fs.existsSync(now)) return now;
  const old = path.join(dir, OLD_META_DIR, ...parts);
  if (fs.existsSync(old)) return old;
  return now;
}

/** The same, relative to the project and with forward slashes, for instructions to Claude. */
export function metaRel(dir: string | undefined, ...parts: string[]): string {
  if (!dir) return [META_DIR, ...parts].join("/");
  return path.relative(dir, metaPath(dir, ...parts)).replace(/\\/g, "/");
}

/** True for a project-relative path inside either notes folder. */
export function isMetaRel(rel: string): boolean {
  const r = rel.replace(/\\/g, "/");
  return r.startsWith(`${META_DIR}/`) || r.startsWith(`${OLD_META_DIR}/`);
}
