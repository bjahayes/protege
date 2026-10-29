"use client";

import { apiFetch } from "@/lib/api-client";
import { useEffect, useRef, useState } from "react";
import type { Job, JobEvent } from "@/lib/types";
import StatusBadge from "./StatusBadge";
import DiffView from "./DiffView";
import { fmtCost, fmtTokens, fmtDuration } from "@/lib/format";

interface Props {
  jobId: string;
  compact?: boolean;
}

export default function AgentStream({ jobId, compact }: Props) {
  const [events, setEvents] = useState<JobEvent[]>([]);
  const [job, setJob] = useState<Job | null>(null);
  const [ended, setEnded] = useState(false);
  const [view, setView] = useState<"live" | "diff">("live");
  const [evalR, setEvalR] = useState<{ loading?: boolean; score?: number; verdict?: string; reason?: string } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  useEffect(() => {
    setEvents([]);
    setEnded(false);
    const es = new EventSource(`/api/jobs/${jobId}/stream`);
    es.addEventListener("snapshot", (e) => {
      const d = JSON.parse((e as MessageEvent).data);
      setJob(d.job);
    });
    es.addEventListener("event", (e) => {
      const ev = JSON.parse((e as MessageEvent).data) as JobEvent;
      setEvents((prev) => [...prev, ev]);
      if (ev.type === "system" || ev.type === "result" || ev.type === "status") {
        // refresh job meta lazily
        apiFetch(`/api/jobs/${jobId}`, { cache: "no-store" })
          .then((r) => r.json())
          .then((j) => j.job && setJob(j.job))
          .catch(() => {});
      }
    });
    es.addEventListener("end", () => {
      setEnded(true);
      es.close();
      apiFetch(`/api/jobs/${jobId}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((j) => j.job && setJob(j.job))
        .catch(() => {});
    });
    es.onerror = () => {
      /* auto-reconnect handled by browser unless closed */
    };
    return () => es.close();
  }, [jobId]);

  useEffect(() => {
    if (stick.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  };

  const stop = async () => {
    await apiFetch(`/api/jobs/${jobId}/stop`, { method: "POST" });
  };

  const rate = async () => {
    setEvalR({ loading: true });
    try {
      const r = await apiFetch(`/api/jobs/${jobId}/eval`, { method: "POST" });
      setEvalR(await r.json());
    } catch (e: any) {
      setEvalR({ verdict: "error", reason: String(e?.message || e) });
    }
  };

  const [memState, setMemState] = useState<"" | "loading" | "done">("");
  const saveMemory = async () => {
    setMemState("loading");
    try {
      await apiFetch(`/api/jobs/${jobId}/memory`, { method: "POST" });
      setMemState("done");
    } catch {
      setMemState("");
    }
  };

  const live = job && ["starting", "running", "idle"].includes(job.status);
  const hasWorktree = job && job.worktreeState && job.worktreeState !== "none";

  return (
    <div className="flex flex-col h-full min-h-0">
      {job && (
        <div className="flex items-center justify-between gap-3 pb-2.5 mb-2.5 border-b border-border">
          <div className="flex items-center gap-3 min-w-0">
            <StatusBadge status={job.status} />
            <span className="text-xs text-muted font-mono truncate">{job.model || "…"}</span>
            {hasWorktree && (
              <span className="text-[11px] px-1.5 py-0.5 rounded border border-accent/30 text-accent font-mono shrink-0">
                ⎇ {job.branch}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-[11px] text-muted shrink-0">
            <span>{fmtDuration(job.startedAt, job.endedAt)}</span>
            <span>↑{fmtTokens(job.inputTokens)} ↓{fmtTokens(job.outputTokens)}</span>
            <span className="text-good">{fmtCost(job.costUsd)}</span>
            {live ? (
              <button
                onClick={stop}
                className="px-2 py-0.5 rounded border border-bad/40 text-bad hover:bg-bad/15 font-medium"
              >
                Stop
              </button>
            ) : evalR && !evalR.loading && evalR.score != null ? (
              <span
                className={`px-2 py-0.5 rounded-full border font-medium ${
                  evalR.verdict === "success"
                    ? "border-good/40 text-good"
                    : evalR.verdict === "partial"
                    ? "border-warn/40 text-warn"
                    : "border-bad/40 text-bad"
                }`}
                title={evalR.reason}
              >
                {evalR.score}/5 {evalR.verdict}
              </span>
            ) : (
              <button
                onClick={rate}
                disabled={evalR?.loading}
                className="px-2 py-0.5 rounded border border-border text-muted hover:text-text hover:border-accent/40"
                title="Have a judge rate whether this run accomplished its task"
              >
                {evalR?.loading ? "rating…" : "☆ rate run"}
              </button>
            )}
            {!live && (
              <button
                onClick={saveMemory}
                disabled={memState !== ""}
                className="px-2 py-0.5 rounded border border-border text-muted hover:text-text hover:border-accent/40"
                title="Distil durable learnings from this run into CLAUDE.md"
              >
                {memState === "loading" ? "saving…" : memState === "done" ? "📝 saved" : "📝 memory"}
              </button>
            )}
          </div>
        </div>
      )}

      {hasWorktree && (
        <div className="flex gap-1 mb-2.5">
          <TabBtn active={view === "live"} onClick={() => setView("live")}>
            Live
          </TabBtn>
          <TabBtn active={view === "diff"} onClick={() => setView("diff")}>
            Diff & review
          </TabBtn>
        </div>
      )}

      {view === "diff" && job ? (
        <div className="flex-1 min-h-0">
          <DiffView jobId={jobId} worktreeState={job.worktreeState} />
        </div>
      ) : (
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className={`flex-1 min-h-0 overflow-y-auto space-y-1.5 font-mono text-xs pr-1 ${
          compact ? "max-h-[280px]" : ""
        }`}
      >
        {events.length === 0 && (
          <div className="text-muted py-8 text-center">
            {ended ? "No events recorded." : "Waiting for agent…"}
          </div>
        )}
        {events.map((e, i) => (
          <EventRow key={i} e={e} />
        ))}
      </div>
      )}
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 rounded-lg text-xs border transition-colors ${
        active ? "border-accent/50 bg-accent/15 text-accent" : "border-border text-muted hover:text-text"
      }`}
    >
      {children}
    </button>
  );
}

function EventRow({ e }: { e: JobEvent }) {
  const p = e.payload || {};
  switch (e.type) {
    case "status":
      return <Line tag="●" color="text-muted" text={`status: ${p.status}`} dim />;
    case "system":
      return (
        <Line
          tag="⚙"
          color="text-accent"
          text={`session ${String(p.session_id || "").slice(0, 8)} · ${p.model || ""} · auth:${p.apiKeySource || "?"}`}
          dim
        />
      );
    case "text":
      return (
        <div className="text-text whitespace-pre-wrap leading-relaxed py-0.5">
          {p.subagent && <span className="text-running">[{p.subagent}] </span>}
          {p.text}
        </div>
      );
    case "thinking":
      return (
        <div className="text-muted/70 italic whitespace-pre-wrap leading-relaxed py-0.5">
          💭 {p.text}
        </div>
      );
    case "tool":
      return (
        <Line
          tag="🔧"
          color="text-warn"
          text={`${p.name}${p.input ? "  " + p.input : ""}`}
        />
      );
    case "tool_result":
      return <Line tag="↳" color="text-muted" text={p.text} dim />;
    case "result": {
      // Older events have no isError; a non-success subtype still means failure.
      const failed = p.isError === true || p.subtype !== "success";
      return (
        <div className={`mt-2 p-2.5 rounded-lg border ${failed ? "border-bad/30 bg-bad/5" : "border-good/30 bg-good/5"}`}>
          <div className={`${failed ? "text-bad" : "text-good"} font-semibold mb-1`}>
            {failed ? `✗ Failed${p.subtype !== "success" ? ` (${p.subtype})` : ""}` : "✓ Completed"}
          </div>
          {p.result && <div className="text-text whitespace-pre-wrap leading-relaxed">{p.result}</div>}
          <div className="text-[11px] text-muted mt-1.5">
            {p.numTurns} turns · ↑{fmtTokens(p.inputTokens)} ↓{fmtTokens(p.outputTokens)} · {fmtCost(p.cost)}
          </div>
        </div>
      );
    }
    case "auto_continue":
      return <Line tag="↻" color="text-accent" text={`auto-continuing (attempt ${p.attempt} of ${p.of}) — hit the turn limit, resuming the session`} />;
    case "checks":
      if (p.running) return <Line tag="✓" color="text-muted" text={`running checks: ${p.command}`} dim />;
      return (
        <Line
          tag={p.passed ? "✓" : "✗"}
          color={p.passed ? "text-good" : "text-bad"}
          text={`checks ${p.passed ? "passed" : "failed"}: ${p.command}${p.exitCode ? ` (exit ${p.exitCode})` : ""}`}
        />
      );
    case "auto_fix":
      return <Line tag="🔧" color="text-warn" text={`checks failed — spawning a fix pass (attempt ${p.attempt} of ${p.of})`} />;
    case "error":
      return <Line tag="✗" color="text-bad" text={p.message} />;
    default:
      return null;
  }
}

function Line({ tag, color, text, dim }: { tag: string; color: string; text: string; dim?: boolean }) {
  return (
    <div className={`flex gap-2 ${dim ? "opacity-70" : ""}`}>
      <span className={`${color} shrink-0`}>{tag}</span>
      <span className="whitespace-pre-wrap break-words">{text}</span>
    </div>
  );
}
