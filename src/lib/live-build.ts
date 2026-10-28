// Client-safe helpers (no Node imports) that turn a job's events into the Simple
// view's live pictures: the five-stage track, plain step labels, the files being
// changed, and which parts of the project those files belong to.
import type { JobEvent } from "./types";
import type { ComponentInfo } from "./assessment";

export const STAGES = ["You asked", "Reading your work", "Making the change", "Checking itself", "Your decision"];

const READ_TOOLS = new Set(["Read", "Grep", "Glob", "LS", "WebFetch", "WebSearch", "NotebookRead", "ToolSearch", "Skill"]);
const CHANGE_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);
const CHECK_CMD = /\b(test|tests|lint|build|tsc|pytest|vitest|jest|check|verify)\b/i;

/** Index into STAGES. Stage 4 is reached when the run has ended. */
export function stageOf(events: JobEvent[], ended: boolean): number {
  let stage = 0;
  let changed = false;
  for (const e of events) {
    if (e.type === "thinking") stage = Math.max(stage, 1);
    else if (e.type === "tool") {
      const n = e.payload?.name;
      const cmd = e.payload?.detail?.command || "";
      if (CHANGE_TOOLS.has(n)) {
        stage = Math.max(stage, 2);
        changed = true;
      } else if (n === "Bash" && changed && CHECK_CMD.test(cmd)) stage = Math.max(stage, 3);
      else stage = Math.max(stage, changed ? 2 : 1);
    } else if (e.type === "checks" || e.type === "auto_fix") stage = Math.max(stage, 3);
  }
  return ended ? 4 : stage;
}

export function baseName(p: string): string {
  return String(p || "").split(/[\\/]/).filter(Boolean).pop() || p;
}

function q(s: string, max = 60): string {
  const t = String(s || "").trim();
  return t.length > max ? t.slice(0, max) + "…" : t;
}

/** Older runs only stored a shortened JSON string of the tool input; pull the useful bits out of it. */
function fromInput(input: unknown): Record<string, string> {
  if (typeof input !== "string") return {};
  const out: Record<string, string> = {};
  for (const [k, field] of [["file", "file_path"], ["file", "notebook_path"], ["file", "path"], ["description", "description"], ["pattern", "pattern"], ["query", "query"], ["command", "command"]] as const) {
    if (out[k]) continue;
    const m = input.match(new RegExp(`"${field}":"((?:[^"\\\\]|\\\\.)*)`));
    if (m) out[k] = m[1].replace(/\\\\/g, "\\");
  }
  return out;
}

/** A short plain sentence for one tool step, e.g. "Read index.html". */
export function stepLabel(e: JobEvent): string {
  const n: string = e.payload?.name || "";
  const d = { ...fromInput(e.payload?.input), ...(e.payload?.detail || {}) };
  const file = d.file ? baseName(d.file) : "";
  switch (n) {
    case "Read":
      return file ? `Read ${file}` : "Read a file";
    case "Edit":
    case "MultiEdit":
    case "NotebookEdit":
      return file ? `Edited ${file}` : "Edited a file";
    case "Write":
      return file ? `Wrote ${file}` : "Wrote a file";
    case "Grep":
      return d.pattern ? `Searched the files for “${q(d.pattern, 40)}”` : "Searched the files";
    case "Glob":
      return d.pattern ? `Looked for files matching ${q(d.pattern, 40)}` : "Looked at what files exist";
    case "Bash":
    case "PowerShell":
      return d.description ? `Ran a step: ${q(d.description)}` : "Ran a step";
    case "WebSearch":
      return d.query ? `Searched the web for “${q(d.query, 40)}”` : "Searched the web";
    case "WebFetch":
      return "Opened a web page";
    case "Task":
    case "Agent":
      return d.description ? `Asked a helper to ${q(d.description)}` : "Asked a helper";
    case "TodoWrite":
    case "TaskCreate":
    case "TaskUpdate":
      return "Updated its to-do list";
    case "Skill":
      return "Used a skill";
    default:
      if (n.startsWith("mcp__")) return "Used a connected app";
      return n ? `Used ${n}` : "Worked";
  }
}

export function isChangeStep(e: JobEvent): boolean {
  return e.type === "tool" && CHANGE_TOOLS.has(e.payload?.name);
}

/** The person's own words: Simple-mode jobs append a checklist directive after them. */
export function ownWords(prompt: string): string {
  const i = String(prompt || "").indexOf("\n\n---\nIMPORTANT");
  return (i >= 0 ? prompt.slice(0, i) : prompt).trim();
}

export interface Touched {
  rel: string;
  added: number;
  removed: number;
  edits: number;
  created: boolean;
}

function norm(p: string): string {
  return String(p || "").replace(/\\/g, "/").replace(/\/+$/, "");
}

/** Path relative to the first matching root (case-insensitive, either slash style). */
export function relPath(file: string, roots: (string | undefined)[]): string {
  const f = norm(file);
  for (const r of roots) {
    if (!r) continue;
    const root = norm(r);
    if (f.toLowerCase().startsWith(root.toLowerCase() + "/")) return f.slice(root.length + 1);
  }
  return f;
}

export function touchedFiles(events: JobEvent[], roots: (string | undefined)[]): Touched[] {
  const map = new Map<string, Touched>();
  for (const e of events) {
    if (!isChangeStep(e)) continue;
    const d = e.payload?.detail || {};
    if (!d.file) continue;
    const rel = relPath(d.file, roots);
    const t = map.get(rel) || { rel, added: 0, removed: 0, edits: 0, created: false };
    t.added += Number(d.added || 0);
    t.removed += Number(d.removed || 0);
    t.edits += 1;
    t.created = t.created || !!d.created;
    map.set(rel, t);
  }
  return [...map.values()];
}

// ---------------------------------------------------------------------------
// Parts map
// ---------------------------------------------------------------------------

export const LAYERS = ["What you see", "What it does behind the scenes", "Where it keeps things"];

export function layerOf(c: ComponentInfo): number {
  const s = `${c.path} ${c.name}`.toLowerCase();
  if (/\bapi\b|route|server|endpoint/.test(s)) return 1;
  if (/store|sqlite|database|\bdb\b|storage|cache|schema|migration|\bdata\b/.test(s)) return 2;
  if (/component|pages?\b|\bui\b|views?\b|frontend|layout|\.css|screen|app\/\*\*|page\.tsx/.test(s)) return 0;
  return 1;
}

function pathPrefix(p: string): string {
  return norm(p).replace(/\/?\*\*?$/, "").replace(/\/\*\*\/.*$/, "");
}

/** Which components the changed files belong to (most specific path wins). */
export function partsForFiles(components: ComponentInfo[], rels: string[]): Set<string> {
  const hit = new Set<string>();
  for (const rel of rels) {
    const r = norm(rel).toLowerCase();
    let best: ComponentInfo | null = null;
    let bestLen = -1;
    for (const c of components) {
      const p = pathPrefix(c.path).toLowerCase();
      if (!p) continue;
      if (r === p || r.startsWith(p + "/")) {
        if (p.length > bestLen) {
          best = c;
          bestLen = p.length;
        }
      }
    }
    if (best) hit.add(best.name);
  }
  return hit;
}

function key(s: string): string {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Arrows between parts, read from the assessment's Mermaid diagram where the boxes match parts. */
export function edgesFromMermaid(mermaid: string, components: ComponentInfo[]): { from: string; to: string; label: string }[] {
  if (!mermaid) return [];
  const labels = new Map<string, string>();
  const nodeRe = /(\w+)\s*(?:\[\(|\[\[|\[|\(\(|\(|\{)\s*"?([^\]\)\}"]+)"?/g;
  for (const m of mermaid.matchAll(nodeRe)) if (!labels.has(m[1])) labels.set(m[1], m[2]);

  const matchComp = (id: string): string | null => {
    const label = key(labels.get(id) || id);
    let best: string | null = null;
    let score = 0;
    for (const c of components) {
      const file = key(baseName(pathPrefix(c.path)).replace(/\.\w+$/, ""));
      const name = key(c.name);
      let s = 0;
      if (name && (label === name || label.includes(name) || name.includes(label))) s = 3;
      else if (file && file.length > 2 && label.includes(file)) s = 2;
      if (s > score) {
        score = s;
        best = c.name;
      }
    }
    return best;
  };

  const out: { from: string; to: string; label: string }[] = [];
  const seen = new Set<string>();
  const edgeRe = /^\s*(\w+)(?:\s*[\[\(\{][^\n]*?[\]\)\}])?\s*(?:-->|---|-\.->|==>|-->>)\s*(?:\|"?([^|"]*)"?\|\s*)?(\w+)/;
  for (const line of mermaid.split("\n")) {
    const m = line.match(edgeRe);
    if (!m) continue;
    const a = matchComp(m[1]);
    const b = matchComp(m[3]);
    if (!a || !b || a === b) continue;
    const k = `${a}→${b}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ from: a, to: b, label: (m[2] || "").trim() });
  }
  return out;
}

export const PART_STATUS: Record<string, { label: string; tone: "good" | "warn" | "bad" | "muted"; dashed?: boolean; means: string }> = {
  solid: { label: "Working", tone: "good", means: "does its job; anything noted on it is a smaller point to watch, not a fault" },
  partial: { label: "Partly built", tone: "warn", means: "works in part, but some pieces are missing" },
  stub: { label: "Only started", tone: "warn", dashed: true, means: "a placeholder or outline with little real code yet" },
  broken: { label: "Not working", tone: "bad", means: "has a fault that stops it doing its job" },
  unknown: { label: "Not sure yet", tone: "muted", dashed: true, means: "couldn't be told from reading the code alone" },
};

/**
 * Why a part has its label. Newer assessments give the evidence directly (statusWhy); older
 * ones only list what was found, so show the first finding and say how many more there are.
 */
export function partReason(c: {
  status: string;
  statusWhy?: string;
  issues?: string[];
}): { lead: "Why" | "Found" | "To watch"; text: string } | null {
  if (c.statusWhy?.trim()) return { lead: "Why", text: c.statusWhy.trim() };
  const issues = (c.issues || []).filter((x) => x?.trim());
  if (issues.length)
    return {
      lead: c.status === "solid" ? "To watch" : "Found",
      text: issues[0] + (issues.length > 1 ? ` (and ${issues.length - 1} more)` : ""),
    };
  if (c.status === "solid") return { lead: "Found", text: "No problems in its code." };
  return null;
}
