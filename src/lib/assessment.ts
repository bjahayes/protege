import fs from "fs";
import path from "path";
import { metaPath, metaRel } from "./meta";
import { readFileSafe } from "./docs";

export interface ComponentInfo {
  name: string;
  path: string;
  what: string; // what it is
  does: string; // what it does
  status: "solid" | "partial" | "stub" | "broken" | "unknown";
  /** One plain sentence: the evidence for that status (what was checked, what was found). */
  statusWhy?: string;
  issues: string[];
}

export interface InferredPhase {
  phase: string;
  items: { title: string; done: boolean }[];
}

export interface Assessment {
  generatedAt: number;
  oneLiner: string;
  status: string; // where it's up to
  phase: string; // prototype | mvp | production ...
  completeness: number; // 0-100
  stack: string[];
  components: ComponentInfo[];
  architecture: { mermaid: string; description: string };
  inferredPlan: InferredPhase[];
  risks: string[];
  planDrift: { hasPlan: boolean; aligned: boolean; notes: string };
}

export function assessmentPath(dir: string) {
  return metaPath(dir, "assessment.json");
}

export function readAssessment(dir: string): Assessment | null {
  const raw = readFileSafe(assessmentPath(dir));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Assessment;
  } catch {
    return null;
  }
}

export function hasAssessment(dir: string): boolean {
  try {
    return fs.existsSync(assessmentPath(dir));
  } catch {
    return false;
  }
}

const SCHEMA_HINT = `{
  "generatedAt": <unix ms number>,
  "oneLiner": "one sentence: what this project is",
  "status": "2-4 sentences: where the project is actually up to right now, based on the code",
  "phase": "one of: idea | prototype | mvp | beta | production",
  "completeness": <integer 0-100, your honest estimate of how complete it is vs its apparent goal>,
  "stack": ["key", "technologies", "detected"],
  "components": [
    {
      "name": "human name of a module/subsystem",
      "path": "relative path (file or dir)",
      "what": "what this component is",
      "does": "what it does / its responsibility",
      "status": "one of: solid | partial | stub | broken | unknown (definitions below)",
      "statusWhy": "one plain-English sentence a non-programmer can follow giving the evidence for that status: what you looked at and what you found, e.g. 'The upload screen calls a save function that is still empty, so nothing is stored.'",
      "issues": ["specific problems, TODOs, gaps, or risks you found (empty array if none)"]
    }
  ],
  "architecture": {
    "mermaid": "a valid Mermaid 'graph TD' (or 'flowchart TD') diagram showing the main components and how they connect. Use short node ids and quoted labels. Keep it to ~6-14 nodes.",
    "description": "1-2 sentences describing the architecture"
  },
  "inferredPlan": [
    { "phase": "phase name", "items": [ { "title": "milestone/task", "done": true|false } ] }
  ],
  "risks": ["top risks or things most likely to be broken/missing"],
  "planDrift": { "hasPlan": true|false, "aligned": true|false, "notes": "if PLAN.md exists, does it still match the code? what's diverged? If no plan, hasPlan=false." }
}`;

export function buildAssessmentPrompt(dir: string): string {
  const hasPlan = fs.existsSync(path.join(dir, "PLAN.md")) || fs.existsSync(path.join(dir, "plan.md"));
  return `You are performing a STRUCTURED PROJECT ASSESSMENT for a project-tracking tool. Your job is to understand this codebase and produce a machine-readable assessment file. Do NOT modify any source code.

Steps:
1. Explore the repository: read the directory structure, key entry points, config, and representative source files. Read README.md, DESIGN.md, PLAN.md and CLAUDE.md if they exist.
2. Identify the real components/subsystems (not every file — the meaningful units), and for each: what it is, what it does, how solid it is, and any concrete issues/TODOs/gaps.
3. Infer where the project is actually up to and roughly how complete it is.
4. ${hasPlan ? "A PLAN.md exists — assess whether it still matches the current code and note any drift." : "There is NO plan — infer a sensible plan (phases + milestones) that reflects what's been built and what remains, marking which items are already done."}
5. Produce a Mermaid architecture diagram of the main components and their relationships.

Then WRITE your assessment as valid JSON to the file \`${metaRel(dir, "assessment.json")}\` (create its folder if needed). The JSON MUST match this schema exactly (types and enum values matter — this is parsed by a program):

${SCHEMA_HINT}

Rules:
- Write ONLY that one file. Output strictly valid JSON (no comments, no trailing commas, no markdown fences inside the file).
- Be concrete and honest — this is a triage tool. If something looks broken or half-built, say so in issues/risks.
- Component status means exactly this: solid = does its whole job with no faults found (any issues listed for it are minor points to watch); partial = works in part but pieces are missing (name them in issues); stub = a placeholder or outline with little real code; broken = has a fault that stops it doing its job (name it); unknown = you could not tell from reading alone. Every component needs a statusWhy that names the specific evidence, never a restatement of the status.
- Make the Mermaid diagram valid and renderable. Prefer 'graph TD'. Quote labels containing spaces.
- When done, reply with a one-line confirmation.`;
}
