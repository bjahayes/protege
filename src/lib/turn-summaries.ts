// Server-only. A short summary of what each turn of a conversation did ("Built the context panel and
// its replay strip"), for the side panel's turn picker and the project's History tab. Written by
// Haiku, many turns to one call, from what was asked, what Claude said at the end and which files it
// changed. Kept in data/turn-summaries.json by each turn's key and the writing style, so a turn is
// summarised once.
import fs from "fs";
import path from "path";
import { DATA_DIR } from "./config";
import { query } from "./engine";
import { explainRules, getExplainStyle } from "./explain-style";
import type { TurnDigest } from "./turn-digest";

const FILE = path.join(DATA_DIR, "turn-summaries.json");
const BATCH = 25;

let cache: Record<string, string> | null = null;
function load(): Record<string, string> {
  if (cache) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(FILE, "utf8"));
  } catch {
    cache = {};
  }
  return cache!;
}
function save() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(load()));
}
// v3: summaries of at most 8 words (v1 ran to 15 words; v2 was cut up by a bug).
const k = (key: string) => `v3:${getExplainStyle()}:${key}`;

/** The summaries already written, by turn key. */
export function knownSummaries(keys: string[]): Record<string, string> {
  const c = load();
  const out: Record<string, string> = {};
  for (const key of keys) if (c[k(key)]) out[key] = shorten(c[k(key)]);
  return out;
}

function promptFor(turns: TurnDigest[]): string {
  const blocks = turns.map((t, i) => {
    const files = t.files.length ? t.files.slice(0, 12).map((f) => f.path).join(", ") + (t.files.length > 12 ? `, and ${t.files.length - 12} more` : "") : "none";
    return [
      `TURN ${i + 1}`,
      `The person asked: ${t.request.slice(0, 700) || "(nothing recorded)"}`,
      `Claude said at the end: ${t.report.slice(0, 700) || "(nothing)"}`,
      `Files changed: ${files}`,
    ].join("\n");
  });
  return [
    "Below are turns of a conversation between a person and Claude, a coding agent working on their project. For each turn, write a summary of what Claude did in that turn, for someone scanning a list of past turns.",
    "",
    blocks.join("\n\n"),
    "",
    "Rules:",
    "- 3 to 8 words, never more: one main thing it did, not a list. Start with a past-tense verb: \"Built the replay strip\", \"Fixed the panel not resizing\", \"Researched tools for lawyers\", \"Answered a question about turns\".",
    "- Say what was done or found, not what was asked. No file names or code words.",
    'Reply with only JSON: {"summaries":["…","…"]} with one entry per turn, in order.',
  ].join("\n") + explainRules({ json: true });
}

/** At most 10 words and 70 characters, cut at a word. */
function shorten(s: string): string {
  let w = s.split(/\s+/).slice(0, 10).join(" ");
  if (w.length > 70) w = w.slice(0, 70).replace(/\s+\S*$/, "");
  // A cut can leave it ending on a joining word ("…sub-tabs for"); drop those.
  const loose = /\s+(for|the|a|an|and|or|of|to|in|on|with|by|from|showing|that|its|their|plus)$/i;
  w = w.replace(/[,;:\s]+$/, "");
  while (loose.test(w)) w = w.replace(loose, "").replace(/[,;:\s]+$/, "");
  return w;
}

const g = globalThis as unknown as { __protegeTurnSums?: Map<string, Promise<void>> };
const inflight = (g.__protegeTurnSums ||= new Map());

async function writeBatch(turns: TurnDigest[]): Promise<void> {
  let text = "";
  try {
    for await (const msg of query({
      prompt: promptFor(turns),
      options: { model: "claude-haiku-4-5-20251001", tools: [], maxTurns: 1, settingSources: [], persistSession: false, env: { MAX_THINKING_TOKENS: "0" } } as any,
    }) as any) {
      if (msg.type === "result" && typeof msg.result === "string") text = msg.result;
    }
    const m = text.match(/\{[\s\S]*\}/);
    const j = m ? JSON.parse(m[0]) : null;
    const list: unknown[] = Array.isArray(j?.summaries) ? j.summaries : [];
    const c = load();
    turns.forEach((t, i) => {
      const s = typeof list[i] === "string" ? (list[i] as string).trim().replace(/\.$/, "") : "";
      if (s) c[k(t.key)] = shorten(s);
    });
    save();
  } catch {
    /* the turns keep their first-message labels */
  }
}

/** Summaries for these turns, writing the ones not written yet (several turns per model call). */
export async function summarizeTurns(turns: TurnDigest[]): Promise<Record<string, string>> {
  const known = knownSummaries(turns.map((t) => t.key));
  const todo = turns.filter((t) => !known[t.key] && (t.request || t.report));
  const seen = new Set<string>();
  const unique = todo.filter((t) => !seen.has(t.key) && seen.add(t.key));
  const jobs: Promise<void>[] = [];
  for (let i = 0; i < unique.length; i += BATCH) {
    const batch = unique.slice(i, i + BATCH).filter((t) => !inflight.has(t.key));
    if (!batch.length) continue;
    const p = writeBatch(batch).finally(() => batch.forEach((t) => inflight.delete(t.key)));
    batch.forEach((t) => inflight.set(t.key, p));
    jobs.push(p);
  }
  // Wait also for batches another request already started for these turns.
  for (const t of todo) {
    const p = inflight.get(t.key);
    if (p) jobs.push(p);
  }
  await Promise.all(jobs);
  return knownSummaries(turns.map((t) => t.key));
}
