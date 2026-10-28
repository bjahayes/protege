import fs from "fs";
import path from "path";
import { metaPath, metaRel } from "./meta";
import type { Task, TaskCounts } from "./types";

export function readFileSafe(p: string | null): string | null {
  if (!p) return null;
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return null;
  }
}

function firstExisting(dir: string, names: string[]): string | null {
  for (const n of names) {
    const p = path.join(dir, n);
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      /* ignore */
    }
  }
  return null;
}

export function designPath(dir: string) {
  return firstExisting(dir, ["DESIGN.md", "design.md", path.join("docs", "DESIGN.md")]);
}
export function planPath(dir: string) {
  return firstExisting(dir, ["PLAN.md", "plan.md", path.join("docs", "PLAN.md")]);
}
export function claudeMdPath(dir: string) {
  return firstExisting(dir, ["CLAUDE.md", path.join(".claude", "CLAUDE.md")]);
}
export function readmePath(dir: string) {
  return firstExisting(dir, ["README.md", "readme.md"]);
}
export function tasksFilePath(dir: string) {
  return metaPath(dir, "tasks.json");
}
export function statusFilePath(dir: string) {
  return metaPath(dir, "status.md");
}

export function readTasks(dir: string): Task[] {
  const raw = readFileSafe(tasksFilePath(dir));
  if (!raw) return [];
  try {
    const j = JSON.parse(raw);
    return Array.isArray(j?.tasks) ? j.tasks : [];
  } catch {
    return [];
  }
}

export function writeTasks(dir: string, tasks: Task[]) {
  const file = tasksFilePath(dir);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ tasks }, null, 2), "utf8");
}

export function taskCounts(tasks: Task[]): TaskCounts {
  const c: TaskCounts = { todo: 0, doing: 0, done: 0 };
  for (const t of tasks) if (c[t.status] !== undefined) c[t.status]++;
  return c;
}

export interface DocsMeta {
  hasDesign: boolean;
  hasPlan: boolean;
  hasClaudeMd: boolean;
  taskCounts: TaskCounts;
}

export function readDocsMeta(dir: string): DocsMeta {
  let tasks: Task[] = [];
  try {
    tasks = readTasks(dir);
  } catch {
    /* ignore */
  }
  return {
    hasDesign: !!designPath(dir),
    hasPlan: !!planPath(dir),
    hasClaudeMd: !!claudeMdPath(dir),
    taskCounts: taskCounts(tasks),
  };
}

export interface ProjectDocs {
  design: string | null;
  plan: string | null;
  claudeMd: string | null;
  readme: string | null;
  status: string | null;
  tasks: Task[];
}

export function readProjectDocs(dir: string): ProjectDocs {
  return {
    design: readFileSafe(designPath(dir)),
    plan: readFileSafe(planPath(dir)),
    claudeMd: readFileSafe(claudeMdPath(dir)),
    readme: readFileSafe(readmePath(dir)),
    status: readFileSafe(statusFilePath(dir)),
    tasks: readTasks(dir),
  };
}

// ---- Scaffolding: bake in best-practice structure for a project ----

const DESIGN_TEMPLATE = (name: string) => `# ${name} — Design Doc

> One-paragraph summary of what this project is and why it exists.

Status: **draft** · Last updated: (fill in)

## Problem
What problem does this solve? Who is it for?

## Goals / Non-goals
- Goal:
- Non-goal:

## Approach
The high-level shape of the solution.

## Architecture
Key components and how they fit together.

## Open questions
-
`;

const PLAN_TEMPLATE = (name: string) => `# ${name} — Plan

Phased plan. Check milestones off as they land.

## Phase 1 — (name)
- [ ] Task
- [ ] Task

## Phase 2 — (name)
- [ ] Task

## Backlog
- [ ] Later idea
`;

const CLAUDE_TEMPLATE = (name: string) => `# ${name}

Guidance for Claude Code working in this repo.

## Build & test
- Install:
- Run:
- Test:

## Conventions
-

## Architecture notes
-

## Gotchas
-
`;

export function scaffoldProject(dir: string, name: string): string[] {
  const created: string[] = [];
  const ensure = (rel: string, content: string) => {
    const p = path.join(dir, rel);
    if (fs.existsSync(p)) return;
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content, "utf8");
    created.push(rel);
  };
  ensure("DESIGN.md", DESIGN_TEMPLATE(name));
  ensure("PLAN.md", PLAN_TEMPLATE(name));
  ensure("CLAUDE.md", CLAUDE_TEMPLATE(name));
  const tasksP = tasksFilePath(dir);
  if (!fs.existsSync(tasksP)) {
    fs.mkdirSync(path.dirname(tasksP), { recursive: true });
    fs.writeFileSync(tasksP, JSON.stringify({ tasks: [] }, null, 2), "utf8");
    created.push(metaRel(dir, "tasks.json"));
  }
  return created;
}
