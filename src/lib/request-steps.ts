// Server-only. A to-do list Protégé makes from the person's request when Claude doesn't keep one of
// its own: the request split into a few plain steps (once per request), then, as Claude works, which
// are done and which it is on, read from what it has changed and said so far. Haiku; the steps are
// kept in data/request-steps.json, and each reading of progress is kept by what it was read from.
import fs from "fs";
import path from "path";
import { createHash } from "crypto";
import { DATA_DIR } from "./config";
import { query } from "./engine";
import { explainRules, getExplainStyle } from "./explain-style";
import type { TodoStatus } from "./todo-list";

const FILE = path.join(DATA_DIR, "request-steps.json");
let cache: Record<string, any> | null = null;
const load = (): Record<string, any> => {
  if (!cache)
    try {
      cache = JSON.parse(fs.readFileSync(FILE, "utf8"));
    } catch {
      cache = {};
    }
  return cache!;
};
const save = () => {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(load()));
};
const hash = (x: unknown) => createHash("sha1").update(JSON.stringify(x)).digest("hex").slice(0, 20);

async function ask(prompt: string): Promise<any> {
  let text = "";
  for await (const msg of query({
    prompt: prompt + explainRules({ json: true }),
    options: { model: "claude-haiku-4-5-20251001", tools: [], maxTurns: 1, settingSources: [], persistSession: false, env: { MAX_THINKING_TOKENS: "0" } } as any,
  }) as any) {
    if (msg.type === "result" && typeof msg.result === "string") text = msg.result;
  }
  const m = text.match(/\{[\s\S]*\}/);
  return m ? JSON.parse(m[0]) : null;
}

const g = globalThis as unknown as { __protegeReqSteps?: Map<string, Promise<any>> };
const inflight = (g.__protegeReqSteps ||= new Map());
const once = <T>(key: string, f: () => Promise<T>): Promise<T> => {
  const p = inflight.get(key);
  if (p) return p;
  const q = f().finally(() => inflight.delete(key));
  inflight.set(key, q);
  return q;
};

/** The request as a few plain steps. */
export async function requestSteps(request: string): Promise<string[]> {
  const key = `steps:${getExplainStyle()}:${hash(request)}`;
  if (load()[key]) return load()[key];
  return once(key, async () => {
    try {
      const j = await ask(
        [
          "Someone who is not a programmer asked a coding agent to do this in their project:",
          request.slice(0, 2000),
          "",
          "Split it into the steps the agent will work through, for a to-do list they can watch.",
          "Rules:",
          "- 1 to 6 steps, in the order they'd be done. A small, single request is one step.",
          "- Each at most 9 words, starting with a verb, in everyday words (no file names or code words). Take them from the request; add nothing it doesn't ask for (no testing or checking steps unless asked).",
          'Reply with only JSON: {"steps":["…","…"]}',
        ].join("\n")
      );
      const steps: string[] = (Array.isArray(j?.steps) ? j.steps : []).filter((s: unknown) => typeof s === "string" && s.trim()).map((s: string) => s.trim().replace(/\.$/, "")).slice(0, 6);
      if (steps.length) {
        load()[key] = steps;
        save();
      }
      return steps;
    } catch {
      return [];
    }
  });
}

/**
 * Which steps are done and which the agent is on, from what it has changed and said so far.
 * `finished`: the run has ended (nothing is "in progress" any more).
 */
export async function requestProgress(
  request: string,
  work: { changes: string[]; said: string[] },
  finished: boolean
): Promise<{ text: string; status: TodoStatus }[]> {
  const steps = await requestSteps(request);
  if (!steps.length) return [];
  const none = (): { text: string; status: TodoStatus }[] => steps.map((text, i) => ({ text, status: !finished && i === 0 ? "in_progress" : "pending" }));
  if (!work.changes.length && !work.said.length) return none();
  const key = `progress:${hash([steps, work, finished])}`;
  if (load()[key]) return load()[key];
  return once(key, async () => {
    try {
      const j = await ask(
        [
          "A coding agent is working through this to-do list for someone's project:",
          ...steps.map((s, i) => `${i + 1}. ${s}`),
          "",
          "What it has changed so far:",
          ...(work.changes.length ? work.changes.slice(-30) : ["(nothing yet)"]),
          "",
          "What it has said so far, most recent last:",
          ...(work.said.length ? work.said.slice(-6).map((s, i, a) => `- ${s.slice(0, i === a.length - 1 ? 1500 : 300)}`) : ["(nothing yet)"]),
          "",
          finished
            ? "The agent has finished. For each step, say whether it was done (\"completed\") or not (\"pending\"). Count a step as done if the changes show it or the agent's last words say it did it; \"pending\" only if it wasn't done."
            : "For each step, say \"completed\" if the changes show it is done, \"in_progress\" for the one step it is working on now (at most one), or \"pending\".",
          'Reply with only JSON: {"status":["completed","in_progress","pending"]} with one entry per step, in order.',
        ].join("\n")
      );
      const st: unknown[] = Array.isArray(j?.status) ? j.status : [];
      let current = false;
      const out = steps.map((text, i) => {
        let s: TodoStatus = st[i] === "completed" ? "completed" : st[i] === "in_progress" && !finished && !current ? "in_progress" : "pending";
        if (s === "in_progress") current = true;
        return { text, status: s };
      });
      // While working, the first step not done is the one it's on, if the reading named none.
      if (!finished && !current) {
        const k = out.findIndex((s) => s.status === "pending");
        if (k >= 0) out[k].status = "in_progress";
      }
      load()[key] = out;
      save();
      return out;
    } catch {
      return none();
    }
  });
}
