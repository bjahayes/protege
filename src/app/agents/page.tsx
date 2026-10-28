"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import type { Job } from "@/lib/types";
import { timeAgo, fmtCost, fmtTokens, fmtDuration } from "@/lib/format";
import StatusBadge from "@/components/StatusBadge";
import AgentStream from "@/components/AgentStream";

const LIVE_STATUSES = ["starting", "running", "idle"];

export default function AgentsPage() {
  const [live, setLive] = useState<Job[]>([]);
  const [recent, setRecent] = useState<Job[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [, setTick] = useState(0);
  const [fProject, setFProject] = useState("all");
  const [fStatus, setFStatus] = useState("all");

  const load = useCallback(async () => {
    const r = await fetch("/api/jobs", { cache: "no-store" });
    const j = await r.json();
    setLive(j.live || []);
    setRecent(j.jobs || []);
    // Follow the newest live agent if nothing is usefully selected yet.
    setSelected((cur) => cur ?? (j.live?.[0]?.id || j.jobs?.[0]?.id || null));
  }, []);

  useEffect(() => {
    const jobParam = new URLSearchParams(window.location.search).get("job");
    if (jobParam) setSelected(jobParam);
    load();
    const poll = setInterval(load, 3000);
    const tick = setInterval(() => setTick((n) => n + 1), 1000); // advance live durations/timers
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [load]);

  const liveIds = new Set(live.map((j) => j.id));
  const allPast = recent.filter((j) => !liveIds.has(j.id));

  // Distinct projects present across all jobs, for the filter dropdown.
  const projects = Array.from(
    new Map([...live, ...recent].map((j) => [j.projectId, j.projectName])).entries()
  ).sort((a, b) => a[1].localeCompare(b[1]));

  const matchStatus = (j: Job) => {
    if (fStatus === "all") return true;
    if (fStatus === "live") return LIVE_STATUSES.includes(j.status);
    return j.status === fStatus;
  };
  const matches = (j: Job) => (fProject === "all" || j.projectId === fProject) && matchStatus(j);
  const filteredLive = live.filter(matches);
  const past = allPast.filter(matches);
  const filtering = fProject !== "all" || fStatus !== "all";

  return (
    <div className="flex h-full">
      <div className="w-[380px] shrink-0 border-r border-border overflow-y-auto">
        <header className="px-5 py-4 border-b border-border sticky top-0 bg-bg z-10">
          <h1 className="text-lg font-bold">Agents</h1>
          <p className="text-xs text-muted mt-0.5 flex items-center gap-1.5">
            {filteredLive.length > 0 ? (
              <span className="live-dot inline-flex items-center gap-1 text-running">
                <span className="w-1.5 h-1.5 rounded-full bg-running" />
                {filteredLive.length} live
              </span>
            ) : (
              "none running"
            )}{" "}
            · {past.length} recent
            {filtering && <span className="text-muted/60"> (filtered)</span>} ·{" "}
            <span className="opacity-60">auto-refreshing</span>
          </p>
          <div className="flex gap-2 mt-2.5">
            <select
              value={fProject}
              onChange={(e) => setFProject(e.target.value)}
              className="flex-1 min-w-0 px-2 py-1.5 rounded-lg bg-panel border border-border text-xs focus:outline-none focus:border-accent/60"
            >
              <option value="all">All projects</option>
              {projects.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
            <select
              value={fStatus}
              onChange={(e) => setFStatus(e.target.value)}
              className="px-2 py-1.5 rounded-lg bg-panel border border-border text-xs focus:outline-none focus:border-accent/60"
            >
              <option value="all">Any status</option>
              <option value="live">Live</option>
              <option value="done">Done</option>
              <option value="error">Error</option>
              <option value="stopped">Stopped</option>
              <option value="interrupted">Interrupted</option>
            </select>
          </div>
        </header>

        {filteredLive.length > 0 && (
          <Section title="Live">
            {filteredLive.map((j) => (
              <JobRow key={j.id} j={j} selected={selected === j.id} onClick={() => setSelected(j.id)} />
            ))}
          </Section>
        )}
        <Section title="Recent">
          {past.length === 0 && (
            <div className="px-5 py-3 text-xs text-muted">{filtering ? "No runs match the filter." : "No past runs yet."}</div>
          )}
          {past.map((j) => (
            <JobRow key={j.id} j={j} selected={selected === j.id} onClick={() => setSelected(j.id)} />
          ))}
        </Section>
      </div>

      <div className="flex-1 min-w-0 p-6">
        {selected ? (
          <div className="flex flex-col h-full">
            <JobHeader jobId={selected} live={live} recent={recent} />
            <div className="flex-1 min-h-0 rounded-xl border border-border bg-panel p-4 mt-3">
              <AgentStream jobId={selected} />
            </div>
          </div>
        ) : (
          <div className="text-muted text-sm h-full flex items-center justify-center">
            Select an agent to view its live context.
          </div>
        )}
      </div>
    </div>
  );
}

function JobHeader({ jobId, live, recent }: { jobId: string; live: Job[]; recent: Job[] }) {
  const j = [...live, ...recent].find((x) => x.id === jobId);
  if (!j) return null;
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <Link href={`/projects/${j.projectId}`} className="text-accent text-sm font-medium hover:underline">
          {j.projectName}
        </Link>
        <p className="text-xs text-muted truncate mt-0.5">{j.prompt}</p>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="py-2">
      <div className="px-5 py-1.5 text-[11px] uppercase tracking-wide text-muted/70 font-semibold">{title}</div>
      {children}
    </div>
  );
}

function JobRow({ j, selected, onClick }: { j: Job; selected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-5 py-3 border-l-2 transition-colors ${
        selected ? "border-accent bg-panel-2" : "border-transparent hover:bg-panel/60"
      }`}
    >
      <div className="flex items-center gap-2 mb-1">
        <StatusBadge status={j.status} />
        <span className="text-[11px] text-muted truncate ml-auto">{j.projectName}</span>
      </div>
      <div className="text-sm truncate">{j.prompt}</div>
      {j.recentEvents && j.recentEvents.length > 0 && (
        <div className="text-[11px] text-muted font-mono truncate mt-1 live-dot">
          {(() => {
            const e = j.recentEvents[j.recentEvents.length - 1];
            const icon = e.type === "tool" ? "🔧" : e.type === "text" ? "▪" : e.type === "thinking" ? "💭" : "↳";
            return `${icon} ${e.label}`;
          })()}
        </div>
      )}
      <div className="flex items-center gap-3 text-[11px] text-muted mt-1">
        <span>{fmtDuration(j.startedAt, j.endedAt)}</span>
        <span>{fmtTokens((j.inputTokens || 0) + (j.outputTokens || 0))} tok</span>
        <span className="text-good">{fmtCost(j.costUsd)}</span>
        {j.evalScore != null && (
          <span
            className={
              j.evalVerdict === "success" ? "text-good" : j.evalVerdict === "partial" ? "text-warn" : "text-bad"
            }
            title={j.evalReason}
          >
            {j.evalScore}/5
          </span>
        )}
        {j.checksPassed != null && (
          <span className={j.checksPassed ? "text-good" : "text-bad"} title={j.checksCommand}>
            {j.checksPassed ? "✓" : "✗"} checks
          </span>
        )}
        <span className="ml-auto">{timeAgo(j.startedAt)}</span>
      </div>
    </button>
  );
}
