import fs from "fs";
import path from "path";
import os from "os";
import matter from "gray-matter";

// Protégé reads the brainchild "second brain" directly off disk (markdown +
// frontmatter) — no need to run brainchild's own server.
export function brainDir(): string {
  return (
    process.env.PROTEGE_BRAIN_DIR ||
    process.env.BUILDWORK_BRAIN_DIR || // the name before the rename
    path.join(os.homedir(), "brainchild", "data", "brain")
  );
}

export function brainAvailable(): boolean {
  try {
    return fs.existsSync(path.join(brainDir(), "projects")) || fs.existsSync(path.join(brainDir(), "notes"));
  } catch {
    return false;
  }
}

export interface BrainNote {
  slug: string;
  title: string;
  summary?: string;
  category?: string;
  tags?: string[];
  projects?: string[];
  level?: string;
  kind?: string;
  hubOf?: string;
  parent?: string;
}
export interface BrainProject {
  slug: string;
  title: string;
  summary?: string;
  status?: string;
  stack?: string[];
  tags?: string[];
  notes?: string[];
  path?: string;
}

function normPath(p?: string): string {
  return (p || "").replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

function readMdFiles(dir: string): { slug: string; data: any; body: string }[] {
  let names: string[] = [];
  try {
    names = fs.readdirSync(dir).filter((n) => n.endsWith(".md"));
  } catch {
    return [];
  }
  const out: { slug: string; data: any; body: string }[] = [];
  for (const n of names) {
    try {
      const raw = fs.readFileSync(path.join(dir, n), "utf8");
      const g = matter(raw);
      out.push({ slug: n.replace(/\.md$/, ""), data: g.data || {}, body: g.content || "" });
    } catch {
      /* skip malformed */
    }
  }
  return out;
}

function toNote(f: { slug: string; data: any }): BrainNote {
  const d = f.data;
  return {
    slug: d.slug || f.slug,
    title: d.title || f.slug,
    summary: d.summary,
    category: d.category,
    tags: d.tags,
    projects: d.projects,
    level: d.level,
    kind: d.kind,
    hubOf: d.hubOf,
    parent: d.parent,
  };
}

export interface ProjectBrain {
  available: boolean;
  matched: boolean;
  page?: { meta: BrainProject; body: string };
  notes: BrainNote[]; // notes linked to this project (declared + reverse), deduped
}

export function getProjectBrain(projectPath: string): ProjectBrain {
  if (!brainAvailable()) return { available: false, matched: false, notes: [] };
  const root = brainDir();
  const projFiles = readMdFiles(path.join(root, "projects"));
  const target = normPath(projectPath);
  const base = path.basename(projectPath).toLowerCase();

  const pageFile =
    projFiles.find((f) => normPath(f.data.path) === target) ||
    projFiles.find((f) => (f.data.slug || f.slug).toLowerCase() === base) ||
    projFiles.find((f) => (f.data.title || "").toLowerCase() === base);

  if (!pageFile) return { available: true, matched: false, notes: [] };

  const meta: BrainProject = {
    slug: pageFile.data.slug || pageFile.slug,
    title: pageFile.data.title || pageFile.slug,
    summary: pageFile.data.summary,
    status: pageFile.data.status,
    stack: pageFile.data.stack,
    tags: pageFile.data.tags,
    notes: pageFile.data.notes,
    path: pageFile.data.path,
  };

  const allNotes = readMdFiles(path.join(root, "notes")).map(toNote);
  const bySlug = new Map(allNotes.map((n) => [n.slug, n]));

  const collected = new Map<string, BrainNote>();
  for (const s of meta.notes || []) {
    const n = bySlug.get(s);
    if (n) collected.set(n.slug, n);
  }
  for (const n of allNotes) {
    if (n.projects?.includes(meta.slug)) collected.set(n.slug, n);
  }

  return {
    available: true,
    matched: true,
    page: { meta, body: pageFile.body },
    notes: [...collected.values()].sort((a, b) => (a.category || "").localeCompare(b.category || "")),
  };
}

export function getBrainNote(slug: string): { meta: BrainNote; body: string } | null {
  const root = brainDir();
  try {
    const raw = fs.readFileSync(path.join(root, "notes", `${slug}.md`), "utf8");
    const g = matter(raw);
    return { meta: toNote({ slug, data: g.data || {} }), body: g.content || "" };
  } catch {
    return null;
  }
}

export interface BrainProjectSummary {
  slug: string;
  title: string;
  summary?: string;
  status?: string;
  path?: string;
  tags?: string[];
  noteCount: number;
}
export interface BrainIndex {
  available: boolean;
  notes: BrainNote[];
  projects: BrainProjectSummary[];
  categories: string[];
}

// Reading a few hundred small md files is cheap, but the explorer polls — cache briefly.
let indexCache: { t: number; data: BrainIndex } | null = null;
const INDEX_TTL = 20_000;

export function listBrain(): BrainIndex {
  if (indexCache && Date.now() - indexCache.t < INDEX_TTL) return indexCache.data;
  if (!brainAvailable()) {
    const empty: BrainIndex = { available: false, notes: [], projects: [], categories: [] };
    indexCache = { t: Date.now(), data: empty };
    return empty;
  }
  const root = brainDir();
  const notes = readMdFiles(path.join(root, "notes")).map(toNote);
  const projFiles = readMdFiles(path.join(root, "projects"));
  const projects: BrainProjectSummary[] = projFiles.map((f) => ({
    slug: f.data.slug || f.slug,
    title: f.data.title || f.slug,
    summary: f.data.summary,
    status: f.data.status,
    path: f.data.path,
    tags: f.data.tags,
    noteCount: Array.isArray(f.data.notes) ? f.data.notes.length : 0,
  }));
  const categories = [...new Set(notes.map((n) => n.category || "Notes"))].sort();
  const data: BrainIndex = { available: true, notes, projects, categories };
  indexCache = { t: Date.now(), data };
  return data;
}

export function getBrainProjectPage(slug: string): { meta: BrainProject; body: string } | null {
  const root = brainDir();
  const dir = path.join(root, "projects");
  const direct = path.join(dir, `${slug}.md`);
  try {
    if (fs.existsSync(direct)) {
      const g = matter(fs.readFileSync(direct, "utf8"));
      return { meta: pageMeta(slug, g.data), body: g.content || "" };
    }
  } catch {
    /* fall through to scan */
  }
  const f = readMdFiles(dir).find((x) => (x.data.slug || x.slug) === slug);
  if (!f) return null;
  return { meta: pageMeta(f.slug, f.data), body: f.body };
}

function pageMeta(slug: string, d: any): BrainProject {
  return {
    slug: d.slug || slug,
    title: d.title || slug,
    summary: d.summary,
    status: d.status,
    stack: d.stack,
    tags: d.tags,
    notes: d.notes,
    path: d.path,
  };
}
