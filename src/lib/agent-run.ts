// Server-only. Running an agent (agents.ts) on a project: its instructions, and what it may
// change, enforced through Claude Code's own permission rules rather than only asked for.
//   document / report  may edit only its one file; the version it started from and the new one
//                      are kept (doc-versions.ts)
//   plan               plan mode: reads, changes nothing
//   change             edits the project, on a safe copy when the project uses git

import { getJobManager } from "./job-manager";
import { DOC, REPORT, instructionsFor, type AgentDef } from "./agents";
import { buildAssessmentPrompt } from "./assessment";
import { buildPlainSummaryPrompt } from "./plain-summary";
import { endWork, recordVersion, startWork } from "./doc-versions";
import { isGitRepo } from "./git";
import { execFileSync } from "child_process";
import type { Job } from "./types";

// What a document or report agent may use: reading and searching, and its one file. No shell or
// other editing tools at all, even if the person's own settings allow them, so the limit holds.
const READ_TOOLS = ["Read", "Glob", "Grep", "LS"];
const NEVER = ["Bash", "NotebookEdit", "PowerShell"];

/** The project's recent saved history, for agents that write about what changed. */
function gitHistory(dir: string): string {
  try {
    return execFileSync("git", ["log", "-n", "80", "--date=short", "--pretty=format:%h %ad %s", "--stat"], {
      cwd: dir,
      encoding: "utf8",
      maxBuffer: 4 * 1024 * 1024,
      windowsHide: true,
    }).slice(0, 60_000);
  } catch {
    return "";
  }
}

export interface RunAgentOptions {
  dir: string;
  projectName: string;
  input?: string;
  model?: string;
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
}

/** The full instructions an agent is given, the same for built-in agents and ones people make. */
export function agentPrompt(a: AgentDef, dir: string, input?: string): string {
  if (a.special === "map") return buildAssessmentPrompt(dir);
  if (a.special === "plain-summary") return buildPlainSummaryPrompt(dir);
  let task = instructionsFor(a, input);
  if (a.id === "changes") {
    const log = gitHistory(dir);
    task += log
      ? `\n\nThe project's saved history (newest first, with the files each change touched):\n\n${log}`
      : "\n\nThis project has no saved git history; say so in CHANGES.md and describe the project as it stands.";
  }
  if (a.builtIn) return task;
  if (a.kind === "document") return DOC(a.document!, task);
  if (a.kind === "report") return REPORT(a.document!, task);
  if (a.kind === "plan") return `${task}\n\nDon't change anything; read and answer.`;
  return task;
}

export async function runAgent(a: AgentDef, o: RunAgentOptions): Promise<Job> {
  if (a.input?.required && !(o.input || "").trim()) throw new Error(`Answer "${a.input.label}" first; ${a.name} needs it.`);
  const agent = { id: a.id, name: a.name, version: a.version };
  const prompt = agentPrompt(a, o.dir, o.input);
  const base = { projectPath: o.dir, projectName: o.projectName, prompt, agent, model: o.model, effort: o.effort };
  const jm = getJobManager();

  if (a.kind === "document" || a.kind === "report") {
    const doc = a.document!;
    // Save any change made since the last version first, so the agent's version is only its own.
    startWork(o.dir, doc);
    const onDone = (j: Job) => {
      endWork(o.dir, doc);
      if (j.status === "done") recordVersion(o.dir, doc, { by: a.name, agentId: a.id, agentVersion: a.version, jobId: j.id });
    };
    if (a.special)
      // Protégé's own map and summary instructions, run the way they always have been.
      return jm.launch({ ...base, kind: "assess", permissionMode: "acceptEdits", effort: o.effort || "high", maxTurns: a.special === "map" ? 40 : 30, primeContext: false, onDone });
    return jm.launch({
      ...base,
      kind: "run",
      permissionMode: "default",
      allowedTools: [...READ_TOOLS, `Edit(${doc})`, `Write(${doc})`],
      disallowedTools: NEVER,
      primeContext: false,
      onDone,
    });
  }
  if (a.kind === "plan") return jm.launch({ ...base, kind: "run", permissionMode: "plan", primeContext: true });

  const git = await isGitRepo(o.dir);
  return jm.launch({ ...base, kind: "run", permissionMode: "acceptEdits", isolate: git, autoVerify: git, autoFix: git, primeContext: true });
}
