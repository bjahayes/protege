// Server-only. Claude's to-do items reworded for the person ("Add onePerCopy queue to git.ts" →
// "Stop two saves clashing on the safe copy"), for the live to-do list in the "What's happening" panel.
// Haiku, all new items in one call; each item is reworded once and kept in data/todo-plain.json by
// its text and the writing style.
import fs from "fs";
import path from "path";
import { DATA_DIR } from "./config";
import { query } from "./engine";
import { explainRules, getExplainStyle } from "./explain-style";

const FILE = path.join(DATA_DIR, "todo-plain.json");
let cache: Record<string, string> | null = null;
const load = (): Record<string, string> => {
  if (!cache)
    try {
      cache = JSON.parse(fs.readFileSync(FILE, "utf8"));
    } catch {
      cache = {};
    }
  return cache!;
};
const k = (t: string) => `${getExplainStyle()}:${t}`;

const g = globalThis as unknown as { __protegeTodoPlain?: Map<string, Promise<void>> };
const inflight = (g.__protegeTodoPlain ||= new Map());

async function reword(items: string[], request: string): Promise<void> {
  let text = "";
  try {
    for await (const msg of query({
      prompt:
        [
          "A coding agent is working through this to-do list for someone who is not a programmer. Reword each item so they understand what it means for their project.",
          request ? `What the person asked for: ${request.slice(0, 800)}` : "",
          "",
          ...items.map((t, i) => `${i + 1}. ${t}`),
          "",
          "Rules:",
          "- At most 9 words each, starting with a verb (\"Add a reminder box to the page\").",
          "- Everyday words: no file names, function names or code words. Keep the meaning exact; add nothing.",
          'Reply with only JSON: {"items":["…","…"]} with one entry per item, in order.',
        ].join("\n") + explainRules({ json: true }),
      options: { model: "claude-haiku-4-5-20251001", tools: [], maxTurns: 1, settingSources: [], persistSession: false, env: { MAX_THINKING_TOKENS: "0" } } as any,
    }) as any) {
      if (msg.type === "result" && typeof msg.result === "string") text = msg.result;
    }
    const m = text.match(/\{[\s\S]*\}/);
    const list: unknown[] = m ? JSON.parse(m[0]).items || [] : [];
    const c = load();
    items.forEach((t, i) => {
      if (typeof list[i] === "string" && (list[i] as string).trim()) c[k(t)] = (list[i] as string).trim().replace(/\.$/, "").slice(0, 100);
    });
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(c));
  } catch {
    /* the items keep Claude's own words */
  }
}

/** The plain wording of these items, rewording the ones not done yet. */
export async function plainTodos(items: string[], request = ""): Promise<Record<string, string>> {
  const c = load();
  const todo = [...new Set(items)].filter((t) => t && !c[k(t)] && !inflight.has(k(t)));
  if (todo.length) {
    const p = reword(todo.slice(0, 40), request).finally(() => todo.forEach((t) => inflight.delete(k(t))));
    todo.forEach((t) => inflight.set(k(t), p));
  }
  await Promise.all(items.map((t) => inflight.get(k(t))).filter(Boolean));
  const out: Record<string, string> = {};
  for (const t of items) if (c[k(t)]) out[t] = c[k(t)];
  return out;
}
