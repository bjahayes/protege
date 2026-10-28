// Server-only. The figures behind Claude Code's /usage screen: how much of the Claude plan's
// usage limits is used (this session window, this week, per model), when each resets, and what
// is contributing to it. Asked of Claude Code itself, through an open session's process if
// there is one, otherwise a short-lived one that never receives a message, so no model is called.
//
// Claude Code marks this request experimental; if it changes shape or goes away, the Usage page
// says the limits couldn't be read rather than breaking.

import type { SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import { liveQuery } from "./engine";
import { getChatManager } from "./chat-manager";

export interface UsageLimit {
  label: string;
  percent: number;
  resetsAt: string | null;
  /** The plan-wide windows: the current session (5 hours) and the current week (7 days). */
  window?: "session" | "week";
}

export interface UsageActivity {
  requests: number;
  sessions: number;
  /** What is contributing to usage, each with its share as Claude Code reports it. */
  /** What is contributing, each as Claude Code's /usage words it, with its tip. They overlap. */
  contributors: { text: string; tip?: string; percent: number }[];
}

export interface PlanUsage {
  available: boolean;
  plan: string | null;
  limits: UsageLimit[];
  extra: { enabled: boolean; used: number | null; limit: number | null; currency: string | null } | null;
  day: UsageActivity | null;
  week: UsageActivity | null;
  checkedAt: number;
  problem?: string;
}

const PLAN_NAMES: Record<string, string> = { pro: "Pro", max: "Max", team: "Team", enterprise: "Enterprise" };

// Claude Code's own wording for each kind of usage, and its tip.
const BEHAVIOURS: Record<string, { text: (n: number) => string; tip: string }> = {
  cache_miss: {
    text: (n) => `${n}% of your usage hit a cache miss of over 100k tokens`,
    tip: "Uncached input is expensive, and often happens when you message a session that has gone idle. /compact before stepping away keeps the cold start small.",
  },
  long_context: {
    text: (n) => `${n}% of your usage was at over 150k tokens of context`,
    tip: "Longer sessions cost more even when cached. /compact mid-task, and /clear when switching to a new task.",
  },
  subagent_heavy: {
    text: (n) => `${n}% of your usage came from sessions that use many subagents`,
    tip: "Each subagent runs its own requests. Be deliberate about starting them, and consider a cheaper model for them.",
  },
  high_parallel: {
    text: (n) => `${n}% of your usage was while 4 or more sessions ran at once`,
    tip: "All sessions share one limit. If you don't need them all at once, queueing uses it more evenly.",
  },
  cron: {
    text: (n) => `${n}% of your usage came from sessions active for 8 hours or more`,
    tip: "These are often background or looping sessions. Continuous use adds up quickly, so make sure it's intentional.",
  },
};

const words = (key: string) => key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

function limitLabel(l: any): string {
  if (l.kind === "session") return "Current session";
  if (l.kind === "weekly_all") return "Current week (all models)";
  const name = l.scope?.model?.display_name || l.scope?.surface?.display_name || l.scope?.surface;
  if (l.group === "weekly") return `Current week (${name || "some models"})`;
  return name ? `${words(String(l.kind))} (${name})` : words(String(l.kind));
}

function limitsFrom(r: any): UsageLimit[] {
  if (Array.isArray(r?.limits) && r.limits.length) {
    return r.limits
      .filter((l: any) => typeof l.percent === "number")
      .map((l: any) => ({
        label: limitLabel(l),
        percent: l.percent,
        resetsAt: l.resets_at || null,
        window: l.kind === "session" ? "session" : l.kind === "weekly_all" ? "week" : undefined,
      }));
  }
  // Older shape: one field per window.
  const windows: [string, string, ("session" | "week")?][] = [
    ["five_hour", "Current session", "session"],
    ["seven_day", "Current week (all models)", "week"],
    ["seven_day_opus", "Current week (Opus)"],
    ["seven_day_sonnet", "Current week (Sonnet)"],
  ];
  const out: UsageLimit[] = [];
  for (const [k, label, window] of windows) {
    const w = r?.[k];
    if (w && typeof w.utilization === "number") out.push({ label, percent: w.utilization, resetsAt: w.resets_at || null, window });
  }
  for (const m of r?.model_scoped || [])
    if (typeof m.utilization === "number") out.push({ label: `Current week (${m.display_name})`, percent: m.utilization, resetsAt: m.resets_at || null });
  return out;
}

function activityFrom(a: any): UsageActivity | null {
  if (!a) return null;
  const contributors = [
    ...(a.behaviors || []).map((b: any) => {
      const w = BEHAVIOURS[b.key];
      return w
        ? { text: w.text(b.pct), tip: w.tip, percent: b.pct }
        : { text: `${b.pct}% of your usage: ${words(String(b.key)).toLowerCase()}`, percent: b.pct };
    }),
    ...(a.agents || []).map((x: any) => ({ text: `${x.pct}% of your usage came from the ${x.name} agent`, percent: x.pct })),
    ...(a.skills || []).map((x: any) => ({ text: `${x.pct}% of your usage came from the ${x.name} skill`, percent: x.pct })),
    ...(a.plugins || []).map((x: any) => ({ text: `${x.pct}% of your usage came from the ${x.name} plugin`, percent: x.pct })),
    ...(a.mcp_servers || []).map((x: any) => ({ text: `${x.pct}% of your usage came from the ${x.name} connector`, percent: x.pct })),
  ].filter((c) => typeof c.percent === "number");
  return { requests: a.request_count ?? 0, sessions: a.session_count ?? 0, contributors };
}

let cache: PlanUsage | null = null;
let asking: Promise<PlanUsage> | null = null;

async function ask(): Promise<PlanUsage> {
  const timeout = <T,>(p: Promise<T>) =>
    Promise.race([p, new Promise<T>((_, r) => setTimeout(() => r(new Error("Claude Code didn't answer")), 30_000))]);
  const live: any = getChatManager().anyLive();
  let q: any = live;
  let own = false;
  if (!q) {
    const silent: AsyncIterable<SDKUserMessage> = { async *[Symbol.asyncIterator]() { await new Promise(() => {}); } };
    q = liveQuery(silent, { cwd: process.cwd(), persistSession: false });
    own = true;
  }
  try {
    const method = q.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET;
    if (typeof method !== "function") throw new Error("This version of Claude Code doesn't report usage to other apps.");
    const u: any = await timeout(method.call(q));
    const r = u?.rate_limits;
    return {
      available: !!u?.rate_limits_available && !!r,
      plan: u?.subscription_type ? PLAN_NAMES[u.subscription_type] || words(u.subscription_type) : null,
      limits: limitsFrom(r),
      extra: r?.extra_usage
        ? {
            enabled: !!r.extra_usage.is_enabled,
            used: r.extra_usage.used_credits ?? null,
            limit: r.extra_usage.monthly_limit ?? null,
            currency: r.extra_usage.currency ?? null,
          }
        : null,
      day: activityFrom(u?.behaviors?.day),
      week: activityFrom(u?.behaviors?.week),
      checkedAt: Date.now(),
    };
  } finally {
    if (own)
      try {
        q.close();
      } catch {
        /* ignore */
      }
  }
}

/** The plan usage figures, at most a minute old unless `fresh`. */
export async function planUsage(fresh = false): Promise<PlanUsage> {
  if (!fresh && cache && Date.now() - cache.checkedAt < 60_000) return cache;
  asking ||= ask()
    .then((u) => (cache = u))
    .catch(
      (e): PlanUsage => ({
        available: false,
        plan: cache?.plan ?? null,
        limits: [],
        extra: null,
        day: null,
        week: null,
        checkedAt: Date.now(),
        problem: String(e?.message || e),
      })
    )
    .finally(() => (asking = null));
  return asking;
}
