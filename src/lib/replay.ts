// Client-safe (no Node imports). A task's run as a strip of coloured stretches: reading,
// changing files, running steps, and problems, each as long as the time it took. The context
// panel draws it; a run going round in circles shows as stripes of running and problems.
import type { JobEvent } from "./types";
import { stepLabel } from "./live-build";

export type ReplayKind = "reading" | "changing" | "running" | "problem";

export const REPLAY_KINDS: { kind: ReplayKind; label: string; means: string }[] = [
  { kind: "reading", label: "Reading", means: "reading the project and working out what to do" },
  { kind: "changing", label: "Changing files", means: "writing or editing the project's files" },
  { kind: "running", label: "Running steps", means: "running commands, including the project's checks" },
  { kind: "problem", label: "Problems", means: "a step failed, the checks found a problem, or it repeated itself" },
];

export interface ReplaySegment {
  kind: ReplayKind;
  start: number;
  end: number;
  /** Plain labels of what happened in this stretch, in order. */
  steps: string[];
}

const CHANGE_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);
const RUN_TOOLS = new Set(["Bash", "PowerShell"]);

/** What one event was doing, and how to say it; null for events that don't start a stretch. */
function classify(e: JobEvent): { kind: ReplayKind; label?: string } | null {
  const p = e.payload || {};
  switch (e.type) {
    case "tool": {
      const n = String(p.name || "");
      if (CHANGE_TOOLS.has(n)) return { kind: "changing", label: stepLabel(e) };
      if (RUN_TOOLS.has(n)) return { kind: "running", label: stepLabel(e) };
      return { kind: "reading", label: stepLabel(e) };
    }
    case "thinking":
      return { kind: "reading", label: "Thought it through" };
    case "tool_result":
      return p.isError ? { kind: "problem", label: "A step failed" } : null;
    case "checks":
      if (p.running) return { kind: "running", label: "Ran the project's checks" };
      return p.passed ? { kind: "running", label: "The checks passed" } : { kind: "problem", label: "The checks found a problem" };
    case "auto_fix":
      return { kind: "changing", label: "Fixing what the checks found" };
    case "stuck":
      return { kind: "problem", label: "It repeated the same step" };
    case "error":
      return { kind: "problem", label: "It stopped with an error" };
    case "result":
      return p.isError ? { kind: "problem", label: "It stopped with an error" } : null;
    default:
      return null;
  }
}

/**
 * The run as stretches of one kind each. A stretch lasts from its first event to the first event
 * of the next stretch; the last one runs to `endTs` (now, while the run is live).
 */
export function replaySegments(events: JobEvent[], endTs: number): ReplaySegment[] {
  const out: ReplaySegment[] = [];
  // When the last thing seen in each stretch happened: a long silence after it (the person away, the
  // session picked up again days later) is idle time, not time spent on the stretch.
  const lastSeen: number[] = [];
  const close = (k: number, at: number) => {
    out[k].end = Math.max(out[k].start, at - lastSeen[k] > IDLE ? lastSeen[k] : at);
  };
  for (const e of events) {
    const c = classify(e);
    if (!c) continue;
    const k = out.length - 1;
    const last = out[k];
    if (last && last.kind === c.kind && e.ts - lastSeen[k] <= IDLE) {
      if (c.label && last.steps[last.steps.length - 1] !== c.label) last.steps.push(c.label);
      lastSeen[k] = e.ts;
      continue;
    }
    if (last) close(k, e.ts);
    out.push({ kind: c.kind, start: e.ts, end: e.ts, steps: c.label ? [c.label] : [] });
    lastSeen.push(e.ts);
  }
  if (out.length) close(out.length - 1, endTs);
  return out;
}

/** Longer than this with nothing happening is idle time, left out of the strip. */
export const IDLE = 10 * 60 * 1000;

/** The time a run spent working: its stretches added up, without idle time. */
export function workingTime(segs: ReplaySegment[]): number {
  return segs.reduce((n, s) => n + (s.end - s.start), 0);
}

/** Total time spent on each kind, in milliseconds. */
export function replayTotals(segs: ReplaySegment[]): Record<ReplayKind, number> {
  const t: Record<ReplayKind, number> = { reading: 0, changing: 0, running: 0, problem: 0 };
  for (const s of segs) t[s.kind] += s.end - s.start;
  return t;
}

/** "45 sec", "3 min", "1 hr 5 min". */
export function plainDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} sec`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} hr${m % 60 ? ` ${m % 60} min` : ""}`;
}

/**
 * Whether the run looks like it's going round in circles: in its latest stretches, problems
 * keep coming back after something was tried.
 */
export function goingInCircles(segs: ReplaySegment[]): boolean {
  const recent = segs.slice(-8);
  return recent.filter((s) => s.kind === "problem").length >= 3;
}
