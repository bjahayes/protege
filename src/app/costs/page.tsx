"use client";

// Usage: the Claude plan's usage limits as Claude Code's /usage shows them (this session window,
// this week, per model, and what is contributing), then what Protégé's own runs used.

import { apiFetch } from "@/lib/api-client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { fmtCost, fmtTokens, timeAgo } from "@/lib/format";
import type { PlanUsage, UsageActivity } from "@/lib/plan-usage";

interface ProjectCost {
  projectId: string;
  name: string;
  runs: number;
  cost: number;
  inputTokens: number;
  outputTokens: number;
  lastRun: number;
}
interface CostData {
  since: number;
  firstRun: number | null;
  totals: { runs: number; cost: number; inputTokens: number; outputTokens: number };
  byProject: ProjectCost[];
  byKind: { kind: string; runs: number; cost: number }[];
  byModel: { model: string; runs: number; cost: number }[];
}

type Period = "session" | "week" | "all";
const WINDOW_HOURS = { session: 5, week: 7 * 24 };

/** When a plan window began: its reset time minus its length. */
function windowStart(plan: PlanUsage | null, w: "session" | "week"): number | null {
  const l = plan?.limits.find((x) => x.window === w);
  const t = l?.resetsAt ? Date.parse(l.resetsAt) : NaN;
  return isNaN(t) ? null : t - WINDOW_HOURS[w] * 3_600_000;
}

function whenText(ms: number): string {
  const d = new Date(ms);
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (Date.now() - ms < 20 * 3_600_000 && d.getDate() === new Date().getDate()) return time;
  return `${d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}, ${time}`;
}

export default function CostsPage() {
  const [data, setData] = useState<CostData | null>(null);
  const [period, setPeriod] = useState<Period>("session");
  const [plan, setPlan] = useState<PlanUsage | null>(null);
  const [checking, setChecking] = useState(false);

  const sessionStart = windowStart(plan, "session");
  const weekStart = windowStart(plan, "week");
  const since = period === "session" ? sessionStart : period === "week" ? weekStart : 0;
  const load = useCallback(async () => {
    if (since === null) return; // the plan windows aren't known yet
    try {
      const r = await apiFetch(`/api/costs?since=${Math.floor(since)}`, { cache: "no-store" });
      setData(await r.json());
    } catch {
      /* ignore */
    }
  }, [since]);
  // Without plan limits there are no windows to match, so show all of Protégé's runs.
  useEffect(() => {
    if (plan && (!plan.available || (sessionStart === null && weekStart === null))) setPeriod("all");
  }, [plan, sessionStart, weekStart]);

  const loadPlan = useCallback(async (fresh = false) => {
    setChecking(true);
    try {
      const r = await apiFetch(`/api/usage${fresh ? "?fresh=1" : ""}`, { cache: "no-store" });
      setPlan(await r.json());
    } catch {
      /* ignore */
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    loadPlan();
    const t = setInterval(() => loadPlan(), 60_000);
    return () => clearInterval(t);
  }, [loadPlan]);

  const maxCost = Math.max(...(data?.byProject || []).map((p) => p.cost), 0.0001);

  return (
    <div className="p-6 max-w-[1100px] mx-auto">
      <header className="mb-5 flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Usage</h1>
          <p className="text-sm text-muted mt-0.5">
            {plan?.plan ? `Your Claude ${plan.plan} plan` : "Your Claude plan"}, as Claude Code reports it
            {plan?.checkedAt ? `, checked ${timeAgo(plan.checkedAt)}` : ""}.
          </p>
        </div>
        <button
          onClick={() => loadPlan(true)}
          disabled={checking}
          className="text-xs px-3 py-1.5 rounded-lg border border-border text-muted hover:text-text disabled:opacity-50"
        >
          {checking ? "Checking…" : "↻ Check again"}
        </button>
      </header>

      <PlanLimits plan={plan} />

      {(plan?.day || plan?.week) && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-muted mb-1">What&apos;s contributing</h2>
          <p className="text-[12px] text-muted mb-2">
            How much of your usage came from sessions of each kind, as Claude Code counts it for /usage. A session can be more
            than one kind, so the shares overlap. Only sessions on this computer are counted, not other devices or claude.ai.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {plan.day && <Activity title="Last 24 hours" a={plan.day} />}
            {plan.week && <Activity title="Last 7 days" a={plan.week} />}
          </div>
        </section>
      )}

      <div className="flex items-end justify-between gap-3 flex-wrap mb-1">
        <h2 className="text-sm font-semibold text-muted">Protégé&apos;s own runs</h2>
        <div className="flex rounded-lg border border-border overflow-hidden text-[12px]">
          {(
            [
              ["session", "This session", sessionStart],
              ["week", "This week", weekStart],
              ["all", "All time", 0],
            ] as [Period, string, number | null][]
          ).map(([k, label, start]) => (
            <button
              key={k}
              onClick={() => setPeriod(k)}
              disabled={start === null}
              className={`px-3 py-1 ${period === k ? "bg-panel-2 text-text" : "text-muted hover:text-text"} disabled:opacity-40`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <p className="text-[12px] text-muted mb-3">
        {period === "session" && sessionStart
          ? `The tasks Protégé has run since your current session's limit began, at ${whenText(sessionStart)}. `
          : period === "week" && weekStart
            ? `The tasks Protégé has run since this week's limit began, on ${whenText(weekStart)}. `
            : `Every task Protégé has run${data?.firstRun ? `, since the first on ${new Date(data.firstRun).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}` : ""}. `}
        Costs are at API prices, as Claude Code reports them; on a Claude plan these runs count toward the limits above instead of
        being billed.
      </p>

      {!data ? (
        <div className="text-muted text-sm">Loading…</div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <Stat label="Cost at API prices" value={fmtCost(data.totals.cost)} accent="text-good" />
            <Stat label="Runs" value={String(data.totals.runs)} />
            <Stat label="Input tokens" value={fmtTokens(data.totals.inputTokens)} />
            <Stat label="Output tokens" value={fmtTokens(data.totals.outputTokens)} />
          </div>

          <section className="mb-6">
            <h3 className="text-sm font-semibold text-muted mb-2">By project</h3>
            {data.byProject.length === 0 ? (
              <p className="text-muted text-sm">No runs yet.</p>
            ) : (
              <div className="rounded-xl border border-border bg-panel divide-y divide-border">
                {data.byProject.map((p) => (
                  <div key={p.projectId} className="px-4 py-3">
                    <div className="flex items-center justify-between gap-3 mb-1.5">
                      <Link href={`/projects/${p.projectId}`} className="font-medium hover:text-accent truncate">
                        {p.name}
                      </Link>
                      <div className="flex items-center gap-4 text-[11px] text-muted shrink-0">
                        <span>{p.runs} runs</span>
                        <span>{fmtTokens(p.inputTokens + p.outputTokens)} tok</span>
                        <span>last {timeAgo(p.lastRun)}</span>
                        <span className="text-good font-medium w-14 text-right">{fmtCost(p.cost)}</span>
                      </div>
                    </div>
                    <div className="h-1.5 rounded-full bg-panel-2 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-accent to-good"
                        style={{ width: `${Math.max(2, (p.cost / maxCost) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Breakdown title="By kind" rows={data.byKind.map((r) => ({ label: r.kind, runs: r.runs, cost: r.cost }))} />
            <Breakdown title="By model" rows={data.byModel.map((r) => ({ label: r.model, runs: r.runs, cost: r.cost }))} />
          </div>
        </>
      )}
    </div>
  );
}

/** When a limit resets, in the viewer's own time: a time within the next day, otherwise a day and time. */
function resetsText(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(+d)) return "";
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (+d - Date.now() < 20 * 3_600_000) return `Resets ${time}`;
  return `Resets ${d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}, ${time}`;
}

function PlanLimits({ plan }: { plan: PlanUsage | null }) {
  if (!plan) return <div className="rounded-xl border border-border bg-panel p-4 mb-8 text-sm text-muted">Asking Claude Code…</div>;
  if (!plan.available || !plan.limits.length)
    return (
      <div className="rounded-xl border border-border bg-panel p-4 mb-8 text-sm text-muted">
        {plan.problem
          ? `Claude Code couldn't report your plan's usage limits: ${plan.problem}`
          : "Claude Code didn't report any plan usage limits. They apply when it's signed in with a Claude plan, not an API key."}
      </div>
    );
  return (
    <section className="mb-8">
      <h2 className="text-sm font-semibold text-muted mb-2">Plan usage limits</h2>
      <div className="rounded-xl border border-border bg-panel divide-y divide-border">
        {plan.limits.map((l) => {
          const pct = Math.max(0, Math.min(100, l.percent));
          const tone = pct >= 95 ? "bg-bad" : pct >= 80 ? "bg-warn" : "bg-accent";
          return (
            <div key={l.label} className="px-4 py-3.5">
              <div className="flex items-baseline justify-between gap-3 mb-1.5">
                <span className="font-medium text-sm">{l.label}</span>
                <span className="text-[12px] text-muted">{resetsText(l.resetsAt)}</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-2 rounded-full bg-panel-2 overflow-hidden">
                  <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct ? Math.max(1.5, pct) : 0}%` }} />
                </div>
                <span className="text-[12.5px] tabular-nums w-20 text-right">{Math.round(l.percent)}% used</span>
              </div>
            </div>
          );
        })}
        {plan.extra && (
          <div className="px-4 py-3 text-[12.5px] text-muted">
            Extra usage:{" "}
            {plan.extra.enabled
              ? plan.extra.used != null
                ? `${plan.extra.used}${plan.extra.limit != null ? ` of ${plan.extra.limit}` : ""} ${plan.extra.currency || ""} used this month`
                : "on"
              : "off"}
          </div>
        )}
      </div>
    </section>
  );
}

function Activity({ title, a }: { title: string; a: UsageActivity }) {
  return (
    <div className="rounded-xl border border-border bg-panel p-4">
      <div className="text-sm font-medium">{title}</div>
      <div className="text-[12px] text-muted mt-0.5 mb-3">
        {a.requests.toLocaleString()} requests to Claude in {a.sessions} {a.sessions === 1 ? "session" : "sessions"}
      </div>
      {a.contributors.length === 0 ? (
        <div className="text-[12.5px] text-muted">Nothing in particular stands out.</div>
      ) : (
        <ul className="space-y-1.5">
          {a.contributors.map((c) => (
            <li key={c.label} className="flex items-center justify-between gap-3 text-[12.5px]">
              <span className="truncate">{c.label}</span>
              <span className="text-muted tabular-nums shrink-0">{c.percent}%</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-xl border border-border bg-panel p-3.5">
      <div className={`text-2xl font-bold ${accent || "text-text"}`}>{value}</div>
      <div className="text-[11px] text-muted mt-0.5">{label}</div>
    </div>
  );
}

function Breakdown({ title, rows }: { title: string; rows: { label: string; runs: number; cost: number }[] }) {
  return (
    <section>
      <h3 className="text-sm font-semibold text-muted mb-2">{title}</h3>
      <div className="rounded-xl border border-border bg-panel divide-y divide-border">
        {rows.length === 0 && <div className="px-4 py-3 text-muted text-sm">—</div>}
        {rows.map((r) => (
          <div key={r.label} className="px-4 py-2.5 flex items-center justify-between text-sm">
            <span className="font-mono text-xs truncate">{r.label}</span>
            <div className="flex items-center gap-4 text-[11px] text-muted shrink-0">
              <span>{r.runs} runs</span>
              <span className="text-good font-medium w-14 text-right">{fmtCost(r.cost)}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
