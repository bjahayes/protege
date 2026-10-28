import path from "path";
import os from "os";

export const APP_PORT = 4317;
export const DATA_DIR = path.join(process.cwd(), "data");
export const DB_PATH = path.join(DATA_DIR, "protege.db");

/** Where newly-created (not discovered) projects live. Friendly, findable, in the user's home. */
export const PROJECTS_ROOT = path.join(os.homedir(), "Protégé Projects");

/** Turn a free-text name into a safe folder name. */
export function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "project"
  );
}

/** Stable, reversible id for a project derived from its absolute path. */
export function projectIdFromPath(p: string): string {
  return Buffer.from(p, "utf8").toString("base64url");
}
export function pathFromProjectId(id: string): string {
  return Buffer.from(id, "base64url").toString("utf8");
}

// Session cwds we never want to surface as "projects" — temp runs, scratchpads,
// the claude config dir itself, and dependency folders.
const NOISE_PATTERNS = [
  /[\\/]AppData[\\/]Local[\\/]Temp/i,
  /[\\/]scratchpad/i,
  /[\\/]\.claude[\\/]/i,
  /[\\/]node_modules[\\/]/i,
  /[\\/]\.git[\\/]/i,
  /[\\/]\.demo[\\/]/i, // materialized demo projects — only shown in demo mode
];

export function isNoisePath(p: string): boolean {
  if (!p) return true;
  return NOISE_PATTERNS.some((re) => re.test(p));
}
