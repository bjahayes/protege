// Server-only. The "getting started" record of a project made from a template in
// Start something new (.protege/starter.json): which template it came from, the run that
// shaped it to the person's description, and when they first tried it. The steps shown on the
// project page are worked out from this and the project's history (see starter-steps.ts).

import fs from "fs";
import path from "path";
import { metaPath } from "./meta";
import { getJobManager } from "./job-manager";
import type { Template } from "./templates";

export interface StarterRecord {
  template: string;
  templateName: string;
  /** The project's name, as given in Start something new. */
  name: string;
  createdAt: number;
  /** What the person said it's for, if they said. */
  description?: string;
  /** The run that shaped the starter to their description, if there was one. */
  buildJobId?: string;
  triedAt?: number;
  dismissedAt?: number;
}

const file = (dir: string) => metaPath(dir, "starter.json");

export function readStarter(dir: string): StarterRecord | null {
  try {
    return JSON.parse(fs.readFileSync(file(dir), "utf8"));
  } catch {
    return null;
  }
}

export function writeStarter(dir: string, patch: Partial<StarterRecord>): StarterRecord | null {
  const cur = readStarter(dir);
  if (!cur && !patch.template) return null;
  const next = { ...(cur || {}), ...patch } as StarterRecord;
  fs.mkdirSync(path.dirname(file(dir)), { recursive: true });
  fs.writeFileSync(file(dir), JSON.stringify(next, null, 2), "utf8");
  return next;
}

/** Start the run that shapes a fresh starter to what the person said it's for ("Protégé shapes it"). */
export function launchShaping(dir: string, name: string, tpl: Template, description: string): string {
  const prompt =
    `This is a brand-new project started from the "${tpl.name}" template ` +
    `(${tpl.blurb}). The starter files already work. ` +
    `Tailor the project to what the user wants, keeping it a simple, self-contained web page ` +
    `(HTML/CSS/JS, no build step) unless they clearly need more.\n\n` +
    `What the user wants:\n${description}`;
  const job = getJobManager().launch({
    projectPath: dir,
    projectName: name,
    prompt,
    kind: "run",
    permissionMode: "acceptEdits",
    isolate: false, // brand-new repo: build directly; history still allows undo
    primeContext: false, // nothing to prime yet
    autoVerify: false,
  });
  return job.id;
}
