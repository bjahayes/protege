// Client-safe (no Node imports). "Show me the plan first": a task can start with a run that only
// reads and replies with a plan. The plan ends with a fenced JSON block naming the parts of the
// project it will change or add, which the context panel draws on the parts map. The chat
// shows the plan's words without that block.

export const PLAN_FENCE = "protege-plan";

export interface PlanPart {
  name: string;
  change: "change" | "new";
  what: string;
}

export interface Plan {
  steps: string[];
  parts: PlanPart[];
}

const FENCE_RE = new RegExp("```" + PLAN_FENCE + "\\s*([\\s\\S]*?)```", "g");

/** The plan in a reply, or null if it has none (or it can't be read). The last block wins. */
export function parsePlan(text: string): Plan | null {
  const blocks = [...String(text || "").matchAll(FENCE_RE)];
  const last = blocks[blocks.length - 1];
  if (!last) return null;
  try {
    const j = JSON.parse(last[1].trim());
    const steps = Array.isArray(j.steps) ? j.steps.filter((s: unknown) => typeof s === "string" && s.trim()).map((s: string) => s.trim()) : [];
    const parts: PlanPart[] = Array.isArray(j.parts)
      ? j.parts
          .filter((p: any) => p && typeof p.name === "string" && p.name.trim())
          .map((p: any) => ({ name: p.name.trim(), change: p.change === "new" ? "new" : "change", what: String(p.what || "").trim() }))
      : [];
    return steps.length || parts.length ? { steps, parts } : null;
  } catch {
    return null;
  }
}

/** The reply without its plan block, for the chat. */
export function stripPlan(text: string): string {
  return String(text || "").replace(FENCE_RE, "").trim();
}

/** Matches a name the plan used to a part on the map (same words, ignoring case and punctuation). */
export function matchPart(name: string, parts: string[]): string | null {
  const k = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const want = k(name);
  if (!want) return null;
  return parts.find((p) => k(p) === want) || parts.find((p) => k(p).includes(want) || want.includes(k(p))) || null;
}
