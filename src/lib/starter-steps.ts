// Client-safe. The five steps of starting a project from a template, and where a project is
// up to, worked out from its getting-started record and its history. Shown on the Start
// something new page and on the project page, so the journey reads the same everywhere.

import type { Job } from "./types";

export type StepKey = "choose" | "describe" | "shape" | "try" | "change";

export const STEPS: { key: StepKey; title: string }[] = [
  { key: "choose", title: "Choose a starting point" },
  { key: "describe", title: "Say what it's for" },
  { key: "shape", title: "Protégé shapes it" },
  { key: "try", title: "Try it" },
  { key: "change", title: "Make it yours" },
];

export type StepState = "done" | "current" | "todo" | "skipped" | "problem";

export interface StarterInfo {
  template: string;
  templateName: string;
  description?: string;
  buildJobId?: string;
  triedAt?: number;
  dismissedAt?: number;
  /** Ideas for a first change, from the template. */
  ideas?: string[];
}

const LIVE = ["starting", "running", "idle"];

export interface Progress {
  states: Record<StepKey, StepState>;
  /** The step to do now; null once every step is done. */
  current: StepKey | null;
  buildJob?: Job;
}

export function starterProgress(s: StarterInfo, jobs: Job[]): Progress {
  const build = s.buildJobId ? jobs.find((j) => j.id === s.buildJobId) : undefined;
  let shape: StepState;
  if (!s.buildJobId) shape = "skipped";
  else if (!build || LIVE.includes(build.status)) shape = "current";
  else if (build.status === "done") shape = "done";
  else shape = "problem"; // it stopped or failed

  // A change counts once it's part of the project: kept from a safe copy, or made directly.
  const changed = jobs.some(
    (j) =>
      j.id !== s.buildJobId &&
      j.kind === "run" &&
      j.status === "done" &&
      (j.worktreeState === "applied" || j.worktreeState === "none")
  );

  const states: Record<StepKey, StepState> = {
    choose: "done",
    describe: "done",
    shape,
    try: s.triedAt ? "done" : "todo",
    change: changed ? "done" : "todo",
  };
  const order: StepKey[] = ["shape", "try", "change"];
  let current: StepKey | null = null;
  for (const k of order) {
    if (states[k] === "current" || states[k] === "problem") {
      current = k;
      break;
    }
    if (states[k] === "todo") {
      current = k;
      states[k] = "current";
      break;
    }
  }
  return { states, current, buildJob: build };
}
