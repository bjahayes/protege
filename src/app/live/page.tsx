"use client";

import { apiFetch } from "@/lib/api-client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import type { Job } from "@/lib/types";
import { fmtCost, fmtTokens, fmtDuration, timeAgo } from "@/lib/format";
import StatusBadge from "@/components/StatusBadge";
import { runTitle } from "@/lib/agents";

interface ActiveSession {
  sessionId: string;
  cwd: string;
  projectId: string;
  projectName: string;
  summary: string;
  lastModified: number;
  gitBranch?: string;
}

export default function LivePage() {
  const [live, setLive] = useState<Job[]>([]);
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [, setNow] = useState(0); // ticking clock for elapsed times

  const load = useCallback(async () => {
    try {
      const [jr, sr] = await Promise.all([
        apiFetch("/api/jobs", { cache: "no-store" }).then((r) => r.json()),
        apiFetch("/api/sessions/active?window=90", { cache: "no-store" }).then((r) => r.json()),
      ]);
      setLive(jr.live || []);
      setSessions(sr.sessions || []);
    } catch {
      /* ignore */
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 2500);
    return () => clearInterval(t);
  }, [load]);

  // tick every second so elapsed timers advance smoothly
  useEffect(() => {
    const t = setInterval(() => setNow((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const stop = async (id: string) => {
    await apiFetch(`/api/jobs/${id}/stop`, { method: "POST" });
    load();
  };

  const stopAll = async () => {
    if (!confirm(`Stop all ${live.length} running agent(s)?`)) return;
    await apiFetch(`/api/jobs/stop-all`, { method: "POST" });
    load();
  };

  const totalCost = live.reduce((s, j) => s + (j.costUsd || 0), 0);
  // Don't double-list a Protégé-launched agent as an "external" active session.
  const jobSessionIds = new Set(live.map((j) => j.sessionId).filter(Boolean));
  const externalSessions = sessions.filter((s) => !jobSessionIds.has(s.sessionId));
  const nothing = live.length === 0 && externalSessions.length === 0;

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <header className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            Live agents
            {live.length > 0 && (
              <span className="live-dot inline-flex items-center gap-1.5 text-sm text-running font-medium">
                <span className="w-2 h-2 rounded-full bg-running" />
                {live.length}
              </span>
            )}
          </h1>
          <p className="text-sm text-muted mt-0.5">
            {live.length === 0
              ? "No Protégé-launched agents running"
              : `${live.length} agent${live.length > 1 ? "s" : ""} working · ${fmtCost(totalCost)} so far`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {live.length > 0 && (
            <button
              onClick={stopAll}
              className="text-sm text-bad border border-bad/40 rounded-lg px-3 py-1.5 hover:bg-bad/15 font-medium"
            >
              ⨯ Stop all
            </button>
          )}
          <Link
            href="/agents"
            className="text-sm text-muted hover:text-text border border-border rounded-lg px-3 py-1.5 hover:border-accent/40"
          >
            All runs & history →
          </Link>
        </div>
      </header>

      {!loaded ? (
        <div className="text-muted text-sm py-20 text-center">Loading…</div>
      ) : nothing ? (
        <div className="rounded-xl border border-dashed border-border py-20 text-center">
          <div className="text-3xl mb-3 opacity-60">◎</div>
          <p className="text-muted text-sm">
            Nothing active. Launch an agent from a project&apos;s <span className="text-text">Run</span> tab.
          </p>
          <Link href="/" className="inline-block mt-3 text-accent text-sm hover:underline">
            ← Go to projects
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {live.length > 0 && (
            <section>
              <h2 className="text-xs uppercase tracking-wide text-muted/70 font-semibold mb-2">
                Launched by Protégé
              </h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {live.map((j) => (
                  <LiveCard key={j.id} j={j} onStop={() => stop(j.id)} />
                ))}
              </div>
            </section>
          )}

          {externalSessions.length > 0 && (
            <section>
              <h2 className="text-xs uppercase tracking-wide text-muted/70 font-semibold mb-1">
                Active Claude Code sessions
              </h2>
              <p className="text-[11px] text-muted mb-2">
                Running outside Protégé (your terminal / IDE, or a session I'm working in). Read-only — Protégé
                can't stop these, but you can jump in or continue them.
              </p>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {externalSessions.map((s) => (
                  <SessionCard key={s.sessionId} s={s} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function ActivityLine({ e, last }: { e: { type: string; label: string }; last: boolean }) {
  const meta: Record<string, { icon: string; color: string }> = {
    tool: { icon: "🔧", color: "text-warn" },
    tool_result: { icon: "↳", color: "text-muted/70" },
    text: { icon: "▪", color: "text-text" },
    thinking: { icon: "💭", color: "text-muted/60" },
    auto_continue: { icon: "↻", color: "text-accent" },
    result: { icon: "✓", color: "text-good" },
    error: { icon: "✗", color: "text-bad" },
  };
  const m = meta[e.type] || { icon: "·", color: "text-muted" };
  return (
    <div className={`text-[11px] font-mono flex gap-1.5 ${last ? "" : "opacity-70"}`}>
      <span className={`${m.color} shrink-0`}>{m.icon}</span>
      <span className={`truncate ${e.type === "text" ? "text-text" : "text-muted"} ${last ? "live-dot" : ""}`}>
        {e.label}
      </span>
    </div>
  );
}

function SessionCard({ s }: { s: ActiveSession }) {
  return (
    <div className="rounded-xl border border-border bg-panel p-4">
      <div className="flex items-center gap-2">
        <span className="live-dot inline-flex items-center gap-1.5 text-[11px] text-good font-medium shrink-0">
          <span className="w-2 h-2 rounded-full bg-good" /> active
        </span>
        <Link href={`/projects/${s.projectId}`} className="font-semibold truncate hover:text-accent">
          {s.projectName}
        </Link>
        {s.gitBranch && <span className="text-[11px] text-muted font-mono shrink-0 ml-auto">⎇ {s.gitBranch}</span>}
      </div>
      <p className="text-xs text-muted mt-1.5 line-clamp-2 leading-relaxed">{s.summary}</p>
      <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-border text-[11px] text-muted">
        <span className="font-mono">{s.sessionId.slice(0, 8)}</span>
        <div className="flex items-center gap-3">
          <span>updated {timeAgo(s.lastModified)}</span>
          <Link href={`/projects/${s.projectId}`} className="text-accent hover:underline">
            view session →
          </Link>
        </div>
      </div>
    </div>
  );
}

function LiveCard({ j, onStop }: { j: Job; onStop: () => void }) {
  const isolated = j.worktreeState && j.worktreeState !== "none";
  return (
    <div className="rounded-xl border border-border bg-panel p-4 flex flex-col">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <StatusBadge status={j.status} />
            <Link href={`/projects/${j.projectId}`} className="font-semibold truncate hover:text-accent">
              {j.projectName}
            </Link>
            {isolated && (
              <span className="text-[11px] px-1.5 py-0.5 rounded border border-accent/30 text-accent font-mono shrink-0">
                ⎇ {j.branch}
              </span>
            )}
            {j.stuck && (
              <span className="text-[11px] px-1.5 py-0.5 rounded-full border border-warn/40 bg-warn/15 text-warn shrink-0" title="Repeating the same action — may be stuck in a loop">
                ⚠ possibly stuck
              </span>
            )}
          </div>
          <p className="text-xs text-muted mt-1 line-clamp-2 leading-relaxed">{runTitle(j)}</p>
        </div>
        <button
          onClick={onStop}
          className="shrink-0 px-2.5 py-1 rounded-lg border border-bad/40 text-bad hover:bg-bad/15 text-xs font-medium"
        >
          Stop
        </button>
      </div>

      {/* Live activity feed — what it's doing right now */}
      <div className="mt-3 rounded-lg bg-bg border border-border px-3 py-2 h-[140px] overflow-y-auto flex flex-col-reverse">
        <div className="space-y-1">
          {(j.recentEvents || []).map((e, i) => (
            <ActivityLine key={i} e={e} last={i === (j.recentEvents!.length - 1)} />
          ))}
          {(!j.recentEvents || j.recentEvents.length === 0) && (
            <div className="text-xs text-muted">starting…</div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-border text-[11px] text-muted">
        <span className="font-mono">{j.model || "…"}</span>
        <div className="flex items-center gap-3">
          <span>{fmtDuration(j.startedAt, j.endedAt)}</span>
          <span>↑{fmtTokens(j.inputTokens)} ↓{fmtTokens(j.outputTokens)}</span>
          <span className="text-good">{fmtCost(j.costUsd)}</span>
          <Link href={`/agents?job=${j.id}`} className="text-accent hover:underline">
            open →
          </Link>
        </div>
      </div>
    </div>
  );
}
