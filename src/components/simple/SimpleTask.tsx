"use client";

// One task in Simple mode, shown the way Claude desktop shows work: a live conversation with
// Claude Code, the five-stage track, the files and parts being changed, the keep / throw away
// review for the safe copy, and a reply box that continues the same Claude Code session.

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Job, JobEvent } from "@/lib/types";
import type { ComponentInfo } from "@/lib/assessment";
import { stageOf, touchedFiles, partsForFiles } from "@/lib/live-build";
import { plainError } from "@/lib/plain";
import Conversation, { type FeedState } from "./Conversation";
import BuildTrack from "./BuildTrack";
import { SimpleReview } from "../SimpleRun";

const EMPTY: FeedState = { job: null, events: [], ended: false };

function JobFeed({ jobId, onUpdate }: { jobId: string; onUpdate: (id: string, f: FeedState) => void }) {
  useEffect(() => {
    let job: Job | null = null;
    let events: JobEvent[] = [];
    let ended = false;
    let raf = 0;
    const push = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => onUpdate(jobId, { job, events, ended }));
    };
    const refetch = () =>
      fetch(`/api/jobs/${jobId}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((j) => {
          if (j.job) job = j.job;
          push();
        })
        .catch(() => {});
    const es = new EventSource(`/api/jobs/${jobId}/stream`);
    es.addEventListener("snapshot", (e) => {
      job = JSON.parse((e as MessageEvent).data).job;
      events = [];
      push();
    });
    es.addEventListener("event", (e) => {
      const ev = JSON.parse((e as MessageEvent).data) as JobEvent;
      if (!events.some((x) => x.seq === ev.seq)) events = [...events, ev];
      push();
    });
    es.addEventListener("end", () => {
      ended = true;
      es.close();
      refetch();
      // The safe copy is committed and checked just after the run ends; pick that up.
      setTimeout(refetch, 2000);
      setTimeout(refetch, 6000);
    });
    return () => {
      es.close();
      cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);
  return null;
}

export default function SimpleTask({
  projectId,
  firstJobId,
  gitRepo,
  components,
  onTouchedParts,
  onFinished,
  onApplied,
}: {
  projectId: string;
  firstJobId: string;
  gitRepo: boolean;
  components?: ComponentInfo[];
  onTouchedParts?: (parts: Set<string>) => void;
  onFinished?: () => void;
  onApplied?: () => void;
}) {
  const [ids, setIds] = useState<string[]>([firstJobId]);
  const [feeds, setFeeds] = useState<Record<string, FeedState>>({});
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [settled, setSettled] = useState<"applied" | "discarded" | null>(null);

  const onUpdate = useCallback((id: string, f: FeedState) => setFeeds((m) => ({ ...m, [id]: f })), []);
  const list = ids.map((id) => feeds[id] || EMPTY);
  const latestId = ids[ids.length - 1];
  const latest = list[list.length - 1];
  const live = !latest.ended;

  useEffect(() => {
    if (latest.ended) onFinished?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latest.ended, latestId]);

  const touched = useMemo(() => {
    const all = list.flatMap((f) => (f.job ? touchedFiles(f.events, [f.job.worktreePath, f.job.cwd, f.job.projectPath]) : []));
    const m = new Map<string, (typeof all)[number]>();
    for (const t of all) {
      const p = m.get(t.rel);
      m.set(t.rel, p ? { ...p, added: p.added + t.added, removed: p.removed + t.removed, edits: p.edits + t.edits, created: p.created || t.created } : t);
    }
    return [...m.values()];
  }, [list]);
  const parts = useMemo(() => [...partsForFiles(components || [], touched.map((t) => t.rel))], [components, touched]);
  const partsKey = parts.sort().join("|");

  useEffect(() => {
    onTouchedParts?.(live || latest.job?.worktreeState === "active" ? new Set(parts) : new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partsKey, live, latest.job?.worktreeState]);
  useEffect(() => () => onTouchedParts?.(new Set()), [onTouchedParts]);

  const job = latest.job;
  const failed = latest.ended && (job?.status === "error" || latest.events.some((e) => e.type === "error"));
  const review = latest.ended && !failed && job?.worktreeState === "active" && !settled;
  const stage = stageOf(latest.events, latest.ended);
  const resultText = [...latest.events].reverse().find((e) => e.type === "result")?.payload?.result || "";

  const send = async () => {
    const text = reply.trim();
    if (!text || sending) return;
    setSending(true);
    const r = await fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        prompt: text,
        continueFrom: latestId,
        permissionMode: "acceptEdits",
        isolate: gitRepo,
        autoVerify: gitRepo,
        autoFix: gitRepo,
        maintainTasks: true,
      }),
    }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setSending(false);
    if (j.job?.id) {
      setReply("");
      setSettled(null);
      setIds((x) => [...x, j.job.id]);
    }
  };

  const stop = () => fetch(`/api/jobs/${latestId}/stop`, { method: "POST" }).catch(() => {});

  return (
    <div className="rounded-2xl border border-border bg-panel p-5">
      {ids.map((id) => (
        <JobFeed key={id} jobId={id} onUpdate={onUpdate} />
      ))}

      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="text-sm font-semibold">
          {live ? "Protégé is working on it" : failed ? "Protégé ran into a problem" : review ? "Protégé made some changes" : "Finished"}
        </div>
        {live && (
          <button onClick={stop} className="text-[11px] px-2 py-1 rounded border border-border text-muted hover:text-bad hover:border-bad/40 shrink-0">
            Stop
          </button>
        )}
      </div>

      <BuildTrack stage={stage} live={live} decision={!!review || job?.worktreeState === "active"} touched={touched} parts={parts} />

      <div className="mt-5">
        <Conversation feeds={list} />
      </div>

      {failed && (
        <div className="mt-4 rounded-xl border border-bad/30 bg-bad/5 px-4 py-3">
          <div className="text-sm font-medium text-bad">{plainError(job?.error || "").message}</div>
          <p className="text-[12.5px] text-muted mt-0.5">{plainError(job?.error || "").hint}</p>
        </div>
      )}

      {review && (
        <div className="mt-4">
          <SimpleReview
            jobId={latestId}
            resultText={resultText}
            onApplied={() => {
              setSettled("applied");
              onApplied?.();
            }}
            onFinished={() => {
              setSettled((s) => s ?? "discarded");
              onFinished?.();
            }}
          />
        </div>
      )}

      {latest.ended && (
        <div className="mt-4">
          <div className="flex gap-2 items-end">
            <textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={2}
              placeholder={review ? "Ask for another change before you decide…" : "Reply to Protégé…"}
              className="flex-1 px-3 py-2.5 rounded-xl bg-bg border border-border text-sm focus:outline-none focus:border-accent/60 resize-y"
            />
            <button
              onClick={send}
              disabled={sending || !reply.trim()}
              className="px-4 py-2.5 rounded-xl bg-accent/20 border border-accent/40 text-accent hover:bg-accent/30 text-sm font-semibold disabled:opacity-40"
            >
              {sending ? "Sending…" : "Send"}
            </button>
          </div>
          <p className="text-[11px] text-muted mt-1.5">
            Your reply continues the same conversation with Claude Code{review ? ", on the same safe copy" : ""}.
          </p>
        </div>
      )}
    </div>
  );
}
