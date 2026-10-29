// Server-only. A plan Claude Code wrote in Plan mode (on the Code page), read for the context
// panel: its steps in a line each, and which parts of the project it will change or add, so the
// plan can be drawn on the parts map. Kept in data/plans/<hash>.json, so a plan is read once.
import fs from "fs";
import path from "path";
import { createHash } from "crypto";
import { DATA_DIR } from "./config";
import { query } from "./engine";
import { parsePlan, PLAN_FENCE, type Plan } from "./plan";
import { explainRules, getExplainStyle } from "./explain-style";

const PLAN_DIR = path.join(DATA_DIR, "plans");

const g = globalThis as unknown as { __protegePlanParts?: Map<string, Promise<Plan | null>> };
const inflight = (g.__protegePlanParts ||= new Map());

function promptFor(plan: string, parts: string[]): string {
  return [
    "A coding agent has written this plan for changing a software project. Read it for someone who is not a programmer.",
    "",
    "THE PLAN:",
    plan.slice(0, 12000),
    "",
    parts.length
      ? `The project's parts are: ${parts.map((p) => `"${p}"`).join(", ")}.`
      : "The project has no list of parts.",
    "",
    "Reply with only this block:",
    "```" + PLAN_FENCE,
    '{"steps":["each step in order, one short line each"],"parts":[{"name":"…","change":"change","what":"one plain sentence"}]}',
    "```",
    "Rules:",
    "- Steps: at most 8, each in everyday words a non-programmer understands (no file names or code words). Take them from the plan; add nothing it doesn't say.",
    `- Parts: each part the plan will change ("change") or add ("new"). An existing part uses its exact name from the list. A new part gets a short plain name of two to four words. Leave out parts the plan doesn't touch.`,
  ].join("\n");
}

/** The plan's steps and parts, or null if they couldn't be read. */
export async function planParts(plan: string, parts: string[]): Promise<Plan | null> {
  const key = createHash("sha1").update(JSON.stringify([plan, parts, getExplainStyle()])).digest("hex").slice(0, 24);
  const file = path.join(PLAN_DIR, `${key}.json`);
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    /* not read yet */
  }
  const running = inflight.get(key);
  if (running) return running;
  const p = (async () => {
    let text = "";
    try {
      for await (const msg of query({
        prompt: promptFor(plan, parts) + explainRules({ json: true }),
        // One quick answer, no tools, no thinking (thinking made the same kind of call ~6x slower).
        options: { model: "claude-haiku-4-5-20251001", tools: [], maxTurns: 1, settingSources: [], persistSession: false, env: { MAX_THINKING_TOKENS: "0" } } as any,
      }) as any) {
        if (msg.type === "result" && typeof msg.result === "string") text = msg.result;
      }
    } catch {
      return null;
    }
    const read = parsePlan(text);
    if (read) {
      fs.mkdirSync(PLAN_DIR, { recursive: true });
      fs.writeFileSync(file, JSON.stringify(read, null, 2));
    }
    return read;
  })().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}
