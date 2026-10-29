// Server-only. "What changed", told as a few numbered steps instead of a list of files.
// With the change's code to hand, a small model sorts its separate edits into steps by purpose
// and writes each step's title and one plain sentence; every edit lands in exactly one step
// (lib/story-steps.ts), so no step can claim an edit that wasn't made. Without the code (a run
// straight in a folder, known only from its steps), the files are grouped by the part of the
// project they belong to and the model names the groups. Stories are kept in
// data/stories/<job id>.json, so they outlive the safe copy.
import fs from "fs";
import { createHash } from "crypto";
import path from "path";
import { DATA_DIR } from "./config";
import { query } from "./engine";
import { readAssessment, type ComponentInfo } from "./assessment";
import { ownWords, touchedFiles } from "./live-build";
import { getJobManager } from "./job-manager";
import type { DiffFile, Job } from "./types";
import { groupFiles, splitEdits, assembleSteps, groupingPrompt, MAX_EDITS, type Edit, type StoryFile, type StoryStep } from "./story-steps";
import { explainRules, getExplainStyle } from "./explain-style";

export type { StoryFile, StoryStep } from "./story-steps";

export interface ChangeStory {
  jobId: string;
  steps: StoryStep[];
  /** "model": titles written by the model; "files": named from the parts and files only. */
  written: "model" | "files";
  /** The way of writing it was written in (plain English or Simplified Technical English). */
  style?: string;
  createdAt: number;
}

const STORY_DIR = path.join(DATA_DIR, "stories");

// One quick answer with no tools. Thinking is off: with it on, the same grouping took about 30
// seconds instead of 5, for the same steps.
const QUICK_MODEL = {
  model: "claude-haiku-4-5-20251001",
  tools: [],
  maxTurns: 1,
  settingSources: [],
  persistSession: false,
  env: { MAX_THINKING_TOKENS: "0" },
} as any;

function storyPath(jobId: string) {
  return path.join(STORY_DIR, `${jobId.replace(/[^\w-]/g, "")}.json`);
}

export function readStory(jobId: string): ChangeStory | null {
  try {
    return JSON.parse(fs.readFileSync(storyPath(jobId), "utf8"));
  } catch {
    return null;
  }
}

function saveStory(s: ChangeStory) {
  fs.mkdirSync(STORY_DIR, { recursive: true });
  fs.writeFileSync(storyPath(s.jobId), JSON.stringify(s, null, 2));
}

/** Protégé's own notes aren't part of the change the person asked for. */
function realChange(p: string) {
  return !/^\.protege\//.test(p.replace(/\\/g, "/"));
}

/** The jobs of one conversation, oldest first (each reply continues the one before). */
function chain(job: Job): Job[] {
  const jm = getJobManager();
  const out: Job[] = [job];
  let cur = job;
  for (let i = 0; i < 30 && cur.parentJobId; i++) {
    const p = jm.get(cur.parentJobId);
    if (!p) break;
    out.unshift(p);
    cur = p;
  }
  return out;
}

/** The files the change touched: from the safe copy's diff when there is one, else from the run's steps. */
async function changedFiles(job: Job): Promise<StoryFile[]> {
  const jm = getJobManager();
  if (job.worktreePath && job.worktreeState === "active") {
    // One line of context keeps separate edits apart, so they can go in separate steps.
    const d = await jm.getDiff(job.id, { context: 1 });
    if (d.available) return d.files.filter((f: DiffFile) => realChange(f.path));
  }
  const m = new Map<string, StoryFile>();
  for (const j of chain(job)) {
    for (const t of touchedFiles(jm.getEvents(j.id), [j.worktreePath, j.cwd, j.projectPath])) {
      if (!realChange(t.rel)) continue;
      const p = m.get(t.rel);
      m.set(t.rel, {
        path: t.rel,
        status: p?.status === "A" || t.created ? "A" : "M",
        additions: (p?.additions || 0) + t.added,
        deletions: (p?.deletions || 0) + t.removed,
      });
    }
  }
  return [...m.values()];
}

function promptFor(request: string, report: string, steps: StoryStep[]): string {
  const per = Math.floor(14000 / steps.length);
  // A run straight in a folder (or one already kept) leaves only which files changed, not how.
  const code = steps.some((s) => s.files.some((f) => f.patch));
  const blocks = steps.map((s, i) => {
    const files = s.files
      .map((f) => {
        const what = f.status === "A" ? "new file" : f.status === "D" ? "removed" : `+${f.additions} −${f.deletions}`;
        return code ? `--- ${f.path} (${what})\n${(f.patch || "").slice(0, Math.floor(per / s.files.length))}` : `- ${f.path} (${what})`;
      })
      .join("\n");
    // Without the code, a part's name only invites a guess ("Urgency colours" → "changed the colours").
    return `STEP ${i + 1}${s.part && code ? ` (the part of the project called "${s.part}")` : ""}:\n${files}`;
  });
  return [
    "A coding agent has just changed a software project for someone who is not a programmer. The change has been split into steps, one per part of the project. For each step, write a short title and one plain sentence, so the person can understand what changed without reading code.",
    "",
    `What the person asked for: ${request || "(not recorded)"}`,
    `What the agent said it did: ${report.slice(0, 2000) || "(nothing)"}`,
    "",
    code ? "The code changes in each step:" : "Only the files each step changed are known, not the code changes themselves:",
    blocks.join("\n\n"),
    "",
    "Rules:",
    "- Title: at most 7 words, says what changed, e.g. \"Added the deadline reminder\". No file names, no code words.",
    code
      ? "- Sentence: what someone using the project will notice, or what it now does, in everyday words. No file names, function names or jargon. Describe only what the step's code changes show."
      : "- Sentence: what someone using the project will notice, in everyday words, taken from what the agent said it did. Never guess from a part's name or a file's name. If the agent's words don't say what changed in a step's files, give that step an empty title and sentence.",
    "- Also give the order a person should read the steps in (the most important or the first in the flow first).",
    'Reply with only JSON: {"order":[step numbers],"steps":[{"step":1,"title":"…","plain":"…"}]}',
  ].join("\n") + explainRules({ json: true });
}

async function writeTitles(request: string, report: string, steps: StoryStep[]): Promise<StoryStep[] | null> {
  let text = "";
  try {
    for await (const msg of query({
      prompt: promptFor(request, report, steps),
      options: QUICK_MODEL,
    }) as any) {
      if (msg.type === "result" && typeof msg.result === "string") text = msg.result;
    }
    const m = text.match(/\{[\s\S]*\}/);
    const j = m ? JSON.parse(m[0]) : null;
    if (!j || !Array.isArray(j.steps)) return null;
    const out = steps.map((s, i) => {
      const w = j.steps.find((x: any) => Number(x?.step) === i + 1);
      return w && typeof w.title === "string" && w.title.trim()
        ? { ...s, title: w.title.trim().slice(0, 80), plain: String(w.plain || "").trim().slice(0, 300) }
        : s;
    });
    const order: number[] = Array.isArray(j.order) ? j.order.map(Number).filter((n: number) => n >= 1 && n <= steps.length) : [];
    if (new Set(order).size !== steps.length) return out;
    return order.map((n) => out[n - 1]);
  } catch {
    return null;
  }
}

async function groupByPurpose(request: string, report: string, edits: Edit[], components: ComponentInfo[]): Promise<StoryStep[] | null> {
  let text = "";
  try {
    for await (const msg of query({
      prompt: groupingPrompt(request, report, edits) + explainRules({ json: true }),
      options: QUICK_MODEL,
    }) as any) {
      if (msg.type === "result" && typeof msg.result === "string") text = msg.result;
    }
    const m = text.match(/\{[\s\S]*\}/);
    const j = m ? JSON.parse(m[0]) : null;
    if (!j || !Array.isArray(j.steps) || !j.steps.length) return null;
    const steps = assembleSteps(edits, j.steps, components);
    return steps.length ? steps : null;
  } catch {
    return null;
  }
}

const g = globalThis as unknown as { __protegeStories?: Map<string, Promise<ChangeStory | null>> };
const inflight = (g.__protegeStories ||= new Map());

/**
 * The story of what a job (and the replies before it) changed. `quick` returns the grouping alone,
 * at once, without writing titles or saving. The full story is written once and then kept.
 */
export async function storyFor(jobId: string, opts: { quick?: boolean; refresh?: boolean } = {}): Promise<ChangeStory | null> {
  const job = getJobManager().get(jobId);
  if (!job) return null;
  if (!opts.refresh) {
    const saved = readStory(jobId);
    if (saved && (saved.style || "plain") === getExplainStyle()) return saved;
  }
  const build = async (): Promise<ChangeStory | null> => {
    const files = await changedFiles(job);
    if (!files.length) return { jobId, steps: [], written: "files", createdAt: Date.now() };
    const components = readAssessment(job.projectPath)?.components || [];
    const grouped = groupFiles(files, components);
    if (opts.quick) return { jobId, steps: grouped, written: "files", createdAt: Date.now() };
    const jobs = chain(job);
    const request = jobs.map((j) => ownWords(j.prompt)).join("\nThen: ");
    const jm = getJobManager();
    const report = jobs
      .map((j) => [...jm.getEvents(j.id)].reverse().find((e) => e.type === "result")?.payload?.result || "")
      .filter(Boolean)
      .join("\n");
    const { steps, written } = await writeStory(files, components, request, report);
    const story: ChangeStory = { jobId, steps, written, style: getExplainStyle(), createdAt: Date.now() };
    // Only a finished run's story is final; one written mid-run would go stale.
    if (written === "model" && job.endedAt) saveStory(story);
    return story;
  };
  if (opts.quick) return build();
  const running = inflight.get(jobId);
  if (running) return running;
  const p = build().finally(() => inflight.delete(jobId));
  inflight.set(jobId, p);
  return p;
}

/**
 * The steps of a change, from its files. With the code to hand, the edits are sorted by purpose;
 * otherwise (a run straight in a folder, known only from its steps) the per-part groups are named.
 */
export async function writeStory(
  files: StoryFile[],
  components: ComponentInfo[],
  request: string,
  report: string
): Promise<{ steps: StoryStep[]; written: "model" | "files" }> {
  const grouped = groupFiles(files, components);
  const edits = files.some((f) => f.patch) ? splitEdits(files) : [];
  const titled =
    edits.length && edits.length <= MAX_EDITS
      ? (await groupByPurpose(request, report, edits, components)) || (await writeTitles(request, report, grouped))
      : await writeTitles(request, report, grouped);
  return { steps: titled || grouped, written: titled ? "model" : "files" };
}

/**
 * The story of edits Claude made in a Code conversation (which has no safe copy: its edits are
 * the record). Kept by the content of the edits, so the same change is only written up once.
 */
export async function chatStory(input: { files: StoryFile[]; components: ComponentInfo[]; request: string; report: string }): Promise<ChangeStory> {
  const key = createHash("sha1")
    .update(JSON.stringify({ f: input.files, c: input.components.map((c) => [c.name, c.path]), r: input.request, s: getExplainStyle() }))
    .digest("hex")
    .slice(0, 24);
  const id = `chat-${key}`;
  const saved = readStory(id);
  if (saved) return saved;
  const running = inflight.get(id);
  if (running) return (await running) as ChangeStory;
  const p = (async () => {
    const { steps, written } = await writeStory(input.files, input.components, input.request, input.report);
    const story: ChangeStory = { jobId: id, steps, written, style: getExplainStyle(), createdAt: Date.now() };
    if (written === "model") saveStory(story);
    return story;
  })().finally(() => inflight.delete(id));
  inflight.set(id, p);
  return p;
}
