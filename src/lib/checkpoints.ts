import fs from "fs";
import path from "path";
import { metaPath } from "./meta";

// The project's Protégé-tracked state files that a checkpoint snapshots.
function tracked(dir: string): string[] {
  const rel = (f: string) => path.relative(dir, metaPath(dir, f));
  return ["DESIGN.md", "PLAN.md", "CLAUDE.md", rel("tasks.json"), rel("status.md"), rel("assessment.json")];
}

export interface CheckpointMeta {
  id: string;
  name: string;
  createdAt: number;
  files: string[];
}

function cpRoot(dir: string) {
  return metaPath(dir, "checkpoints");
}

export function listCheckpoints(dir: string): CheckpointMeta[] {
  const root = cpRoot(dir);
  let ids: string[] = [];
  try {
    ids = fs.readdirSync(root);
  } catch {
    return [];
  }
  const out: CheckpointMeta[] = [];
  for (const id of ids) {
    try {
      const raw = fs.readFileSync(path.join(root, id, "meta.json"), "utf8");
      out.push(JSON.parse(raw));
    } catch {
      /* ignore malformed */
    }
  }
  return out.sort((a, b) => b.createdAt - a.createdAt);
}

export function createCheckpoint(dir: string, name: string, id: string): CheckpointMeta {
  const cpDir = path.join(cpRoot(dir), id);
  fs.mkdirSync(cpDir, { recursive: true });
  const saved: string[] = [];
  for (const rel of tracked(dir)) {
    const src = path.join(dir, rel);
    if (fs.existsSync(src)) {
      const dest = path.join(cpDir, rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
      saved.push(rel);
    }
  }
  const meta: CheckpointMeta = { id, name: name || `Checkpoint ${id}`, createdAt: Number(id) || Date.now(), files: saved };
  fs.writeFileSync(path.join(cpDir, "meta.json"), JSON.stringify(meta, null, 2), "utf8");
  return meta;
}

export function restoreCheckpoint(dir: string, id: string): { ok: boolean; restored: string[]; error?: string } {
  const cpDir = path.join(cpRoot(dir), id);
  let meta: CheckpointMeta;
  try {
    meta = JSON.parse(fs.readFileSync(path.join(cpDir, "meta.json"), "utf8"));
  } catch {
    return { ok: false, restored: [], error: "Checkpoint not found" };
  }
  const restored: string[] = [];
  for (const rel of meta.files) {
    const src = path.join(cpDir, rel);
    const dest = path.join(dir, rel);
    if (fs.existsSync(src)) {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
      restored.push(rel);
    }
  }
  return { ok: true, restored };
}

export function deleteCheckpoint(dir: string, id: string) {
  try {
    fs.rmSync(path.join(cpRoot(dir), id), { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

export function exportCheckpoint(dir: string, id: string): { meta: CheckpointMeta; files: Record<string, string> } | null {
  const cpDir = path.join(cpRoot(dir), id);
  let meta: CheckpointMeta;
  try {
    meta = JSON.parse(fs.readFileSync(path.join(cpDir, "meta.json"), "utf8"));
  } catch {
    return null;
  }
  const files: Record<string, string> = {};
  for (const rel of meta.files) {
    try {
      files[rel] = fs.readFileSync(path.join(cpDir, rel), "utf8");
    } catch {
      /* ignore */
    }
  }
  return { meta, files };
}
