// Server-only. Where Protégé keeps its notes inside a project: the `.protege/` folder
// (tasks.json, status.md, assessment.json, plain-summary.md, checkpoints/ …).

import path from "path";

export const META_DIR = ".protege";

/** Absolute path of one of Protégé's notes in a project. */
export function metaPath(dir: string, ...parts: string[]): string {
  return path.join(dir, META_DIR, ...parts);
}

/** The same, relative to the project and with forward slashes, for instructions to Claude. */
export function metaRel(_dir: string | undefined, ...parts: string[]): string {
  return [META_DIR, ...parts].join("/");
}

/** True for a project-relative path inside the notes folder. */
export function isMetaRel(rel: string): boolean {
  return rel.replace(/\\/g, "/").startsWith(`${META_DIR}/`);
}
