// Client-safe (no Node imports). The pure parts of "what changed" (lib/change-story.ts): the
// steps' shape, grouping a change's files by part, and splitting it into separate edits that a
// model sorts into steps by purpose, with every edit kept exactly once.
import type { ComponentInfo } from "./assessment";
import { partsForFiles, baseName } from "./live-build";

export const MAX_STEPS = 5;

export interface StoryFile {
  path: string;
  status: string; // A | M | D
  additions: number;
  deletions: number;
  patch?: string;
}

export interface StoryStep {
  title: string;
  plain: string;
  /** The part of the project (from the assessment) this step changed, if the files belong to one. */
  part?: string;
  files: StoryFile[];
}

/** One group per part of the project; files outside every part share a group. At most MAX_STEPS. */
export function groupFiles(files: StoryFile[], components: ComponentInfo[]): StoryStep[] {
  const byPart = new Map<string, StoryFile[]>();
  const loose: StoryFile[] = [];
  for (const f of files) {
    const [part] = [...partsForFiles(components, [f.path])];
    if (part) byPart.set(part, [...(byPart.get(part) || []), f]);
    else loose.push(f);
  }
  const size = (fs: StoryFile[]) => fs.reduce((s, f) => s + f.additions + f.deletions + 1, 0);
  let groups: { part?: string; files: StoryFile[] }[] = [...byPart.entries()].map(([part, fs]) => ({ part, files: fs }));
  groups.sort((a, b) => size(b.files) - size(a.files));
  if (loose.length) groups.push({ files: loose });
  if (groups.length > MAX_STEPS) {
    const keep = groups.slice(0, MAX_STEPS - 1);
    const rest = groups.slice(MAX_STEPS - 1).flatMap((g) => g.files);
    groups = [...keep, { files: rest }];
  }
  return groups.map((g) => ({
    part: g.part,
    title: g.part ? `Changes to ${g.part}` : g.files.length === 1 ? `Changes to ${baseName(g.files[0].path)}` : "Other changes",
    plain: "",
    files: g.files,
  }));
}


// ---------------------------------------------------------------------------------------------
// Grouping by purpose. A small project often lives in one file, and git's blocks of changes
// often mix two purposes (the styles for two new things sit side by side), so grouping by part,
// file or block would tell the whole change as one step. Instead the change is cut into small
// labelled edits (for a small change, each changed line; for a bigger one, each run of changed
// lines), and the model sorts the edits into steps by what they're for. Every edit lands in
// exactly one step: one the model doesn't place goes into "Other small changes", and one it
// names twice stays where it was first placed. So a step can't claim an edit that wasn't made,
// and none is lost.
// ---------------------------------------------------------------------------------------------

export interface EditLine {
  op: "+" | "-";
  text: string;
  /** Position among the file's diff lines, to tell which lines are next to each other. */
  at: number;
}

export interface Edit {
  id: string;
  file: StoryFile;
  /** The file's diff header (diff --git, index, ---, +++). */
  header: string;
  lines: EditLine[];
}

/** Changes up to this many changed lines are cut line by line; bigger ones by runs of lines. */
const LINE_BY_LINE = 150;
/** More edits than this is too many to sort; the change is grouped by part instead. */
export const MAX_EDITS = 120;

/** The change cut into small edits, in file order. A file with no patch to read is one edit. */
export function splitEdits(files: StoryFile[]): Edit[] {
  const changed = files.reduce((n, f) => n + f.additions + f.deletions, 0);
  const lineByLine = changed <= LINE_BY_LINE;
  const out: Edit[] = [];
  let n = 0;
  const id = () => `e${++n}`;
  for (const f of files) {
    const lines = String(f.patch || "").split("\n");
    const first = lines.findIndex((l) => l.startsWith("@@"));
    const header = (first < 0 ? lines : lines.slice(0, first)).join("\n");
    if (first < 0) {
      out.push({ id: id(), file: f, header, lines: [] });
      continue;
    }
    let run: EditLine[] = [];
    const flush = () => {
      if (run.length) out.push({ id: id(), file: f, header, lines: run });
      run = [];
    };
    lines.slice(first).forEach((l, i) => {
      const op = l[0];
      if (op !== "+" && op !== "-") {
        flush(); // context, a new block, or "\ No newline at end of file"
        return;
      }
      const line: EditLine = { op, text: l.slice(1), at: i };
      const blank = !line.text.trim();
      if (blank) {
        // A blank line goes with the edit before it, and ends a run.
        run.push(line);
        if (!lineByLine) flush();
        return;
      }
      if (lineByLine) flush();
      run.push(line);
    });
    flush();
  }
  // A blank line on its own (at the start of a block) joins the edit after it.
  return out.filter((e, i) => {
    if (e.lines.length && e.lines.every((l) => !l.text.trim()) && out[i + 1]?.file === e.file) {
      out[i + 1].lines.unshift(...e.lines);
      return false;
    }
    return true;
  });
}

/** The step's files, each with only the step's own edits in its patch. */
function filesOf(edits: Edit[]): StoryFile[] {
  const byPath = new Map<string, Edit[]>();
  for (const e of edits) byPath.set(e.file.path, [...(byPath.get(e.file.path) || []), e]);
  return [...byPath.values()].map((es) => {
    const lines = es.flatMap((e) => e.lines).sort((a, b) => a.at - b.at);
    const body: string[] = [];
    lines.forEach((l, i) => {
      if (i === 0 || l.at !== lines[i - 1].at + 1) body.push("@@");
      body.push(l.op + l.text);
    });
    const f = es[0].file;
    const whole = es.every((e) => !e.lines.length);
    return {
      path: f.path,
      status: f.status,
      additions: whole ? f.additions : lines.filter((l) => l.op === "+").length,
      deletions: whole ? f.deletions : lines.filter((l) => l.op === "-").length,
      patch: whole ? f.patch : [es[0].header, ...body].filter(Boolean).join("\n"),
    };
  });
}

/** The part of the project most of a step's changed lines belong to, if any. */
function mainPart(files: StoryFile[], components: ComponentInfo[]): string | undefined {
  const weight = new Map<string, number>();
  for (const f of files) {
    const [part] = [...partsForFiles(components, [f.path])];
    if (part) weight.set(part, (weight.get(part) || 0) + f.additions + f.deletions + 1);
  }
  return [...weight.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

/** Puts the model's grouping together, keeping every edit exactly once. */
export function assembleSteps(
  edits: Edit[],
  reply: { title?: unknown; plain?: unknown; edits?: unknown }[],
  components: ComponentInfo[]
): StoryStep[] {
  const known = new Set(edits.map((e) => e.id));
  const used = new Set<string>();
  const steps: StoryStep[] = [];
  for (const r of reply.slice(0, MAX_STEPS)) {
    const ids = (Array.isArray(r.edits) ? r.edits : []).map(String).filter((id) => known.has(id) && !used.has(id));
    if (!ids.length || typeof r.title !== "string" || !r.title.trim()) continue;
    ids.forEach((id) => used.add(id));
    const files = filesOf(edits.filter((e) => ids.includes(e.id)));
    steps.push({ title: r.title.trim().slice(0, 80), plain: String(r.plain || "").trim().slice(0, 300), part: mainPart(files, components), files });
  }
  const rest = edits.filter((e) => !used.has(e.id));
  if (rest.length) {
    const files = filesOf(rest);
    steps.push({ title: steps.length ? "Other small changes" : "The changes", plain: "", part: mainPart(files, components), files });
  }
  return steps;
}

/** What the model is asked: the request, the agent's report, and every edit by its id. */
export function groupingPrompt(request: string, report: string, edits: Edit[]): string {
  const per = Math.max(160, Math.floor(18000 / Math.max(1, edits.length)));
  const blocks: string[] = [];
  let file = "";
  for (const e of edits) {
    if (e.file.path !== file) {
      file = e.file.path;
      const what = e.file.status === "A" ? "a new file" : e.file.status === "D" ? "a removed file" : "changed";
      blocks.push(`\nIn ${file} (${what}):`);
    }
    if (!e.lines.length) {
      blocks.push(`${e.id}: (the whole file, +${e.file.additions} −${e.file.deletions}, no text to show)`);
      continue;
    }
    let text = e.lines.map((l) => `${l.op} ${l.text}`).join("\n    ");
    if (text.length > per) text = text.slice(0, per) + " … (cut short)";
    blocks.push(`${e.id}: ${text}`);
  }
  return [
    "A coding agent has just changed a software project for someone who is not a programmer. Below is every edit it made, each with an id (+ is a line added, − a line removed). Sort the edits into steps by what they are for, so the person can follow the change as a short story without reading code.",
    "",
    `What the person asked for: ${request || "(not recorded)"}`,
    `What the agent said it did: ${report.slice(0, 2000) || "(nothing)"}`,
    blocks.join("\n"),
    "",
    "Rules:",
    `- Between 1 and ${MAX_STEPS} steps, one for each thing the person would see as a separate change. Edits that serve one purpose go in one step, even across files: the styling, the page and the code for one new feature belong together.`,
    "- Put every edit in exactly one step, by its id. Small supporting edits (comments, spacing) go with the step they support.",
    "- Order the steps the way a person should read them: the most important, or the first in the flow, first.",
    '- Title: at most 7 words, says what changed, e.g. "Added the deadline reminder". No file names, no code words.',
    "- Sentence: what someone using the project will notice, or what it now does, in everyday words. No file names, function names or jargon. Describe only what that step's edits show.",
    'Reply with only JSON: {"steps":[{"title":"…","plain":"…","edits":["e1","e4"]}]}',
  ].join("\n");
}
