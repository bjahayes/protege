"use client";

// One task in Simple mode, shown the way Claude desktop shows work: a live conversation with
// Claude Code on the left, and the context panel on the right showing whatever is relevant now
// (the plan on the parts map, the run as it happens, what changed step by step, the app before
// and after). The conversation says things in a line; the panel shows them. Below wide screens
// the two sit behind a Conversation / What's happening switch. The keep / throw away review for
// the safe copy and the reply box continue the same Claude Code session.

import { apiFetch } from "@/lib/api-client";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Job, JobEvent } from "@/lib/types";
import type { Assessment, ComponentInfo } from "@/lib/assessment";
import type { ChangeStory } from "@/lib/change-story";
import { stageOf, touchedFiles, partsForFiles, STAGES, ownWords } from "@/lib/live-build";
import { jobTodoSteps, todosFrom } from "@/lib/todo-list";
import { useRequestTodos } from "./TodoList";
import { isChangeStep, stepLabel } from "@/lib/live-build";
import { parsePlan } from "@/lib/plan";
import { plainError } from "@/lib/plain";
import Conversation, { type FeedState } from "./Conversation";
import ContextPanel, { type Moment } from "./ContextPanel";
import { SimpleReview } from "../SimpleRun";
import { ResizeHandle, usePanelWidth } from "../Resizer";

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
      apiFetch(`/api/jobs/${jobId}`, { cache: "no-store" })
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
  assessment,
  previewEntry,
  onTouchedParts,
  onFinished,
  onApplied,
}: {
  projectId: string;
  firstJobId: string;
  gitRepo: boolean;
  assessment?: Assessment | null;
  previewEntry?: string | null;
  onTouchedParts?: (parts: Set<string>) => void;
  onFinished?: () => void;
  onApplied?: () => void;
}) {
  const [ids, setIds] = useState<string[]>([firstJobId]);
  const [feeds, setFeeds] = useState<Record<string, FeedState>>({});
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [settled, setSettled] = useState<"applied" | "discarded" | null>(null);
  // Below wide screens: which side of the task is showing.
  const [tab, setTab] = useState<"chat" | "panel">("chat");
  // On wide screens the panel sits beside the conversation, at a width the person can drag.
  const panelSize = usePanelWidth("protege.panel.task", 620, 380, (vw) => vw - 640);
  const [unseen, setUnseen] = useState(false);
  const [story, setStory] = useState<ChangeStory | null>(null);
  const [storyWriting, setStoryWriting] = useState(false);
  const [step, setStep] = useState<number | null>(null);
  // A part picked on the map to talk about: the next reply is about it.
  const [about, setAbout] = useState<ComponentInfo | null>(null);

  // Opened on a later run of a conversation (a reply, or "Go ahead" after a plan): show the
  // earlier runs too, so the conversation reads from the start.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const before: string[] = [];
      let id: string | undefined = firstJobId;
      for (let i = 0; i < 20 && id; i++) {
        const j: { job?: Job } | null = await apiFetch(`/api/jobs/${id}`, { cache: "no-store" })
          .then((r) => r.json())
          .catch(() => null);
        id = j?.job?.parentJobId;
        if (id) before.unshift(id);
      }
      if (!cancelled && before.length) setIds((x) => (x[0] === firstJobId ? [...before, ...x] : x));
    })();
    return () => {
      cancelled = true;
    };
  }, [firstJobId]);

  const components = useMemo(() => assessment?.components || [], [assessment]);
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
  // Parts the latest run is changing right now (earlier runs' parts aren't "being changed").
  const changingNow = useMemo(() => {
    const j = latest.job;
    if (!j || latest.ended) return new Set<string>();
    return partsForFiles(components, touchedFiles(latest.events, [j.worktreePath, j.cwd, j.projectPath]).map((t) => t.rel));
  }, [components, latest]);
  const parts = useMemo(() => [...partsForFiles(components, touched.map((t) => t.rel))], [components, touched]);
  const partsKey = parts.sort().join("|");

  useEffect(() => {
    onTouchedParts?.(live || latest.job?.worktreeState === "active" ? new Set(parts) : new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partsKey, live, latest.job?.worktreeState]);
  useEffect(() => () => onTouchedParts?.(new Set()), [onTouchedParts]);

  const job = latest.job;
  const failed = latest.ended && (job?.status === "error" || latest.events.some((e) => e.type === "error"));
  const isPlan = job?.kind === "plan";
  const resultText = [...latest.events].reverse().find((e) => e.type === "result")?.payload?.result || "";
  const plan = useMemo(() => (isPlan ? parsePlan(resultText) : null), [isPlan, resultText]);
  // Kept or thrown away here, or before this conversation was reopened.
  const outcome: "applied" | "discarded" | null =
    settled ?? (job?.worktreeState === "applied" ? "applied" : job?.worktreeState === "discarded" ? "discarded" : null);
  const planWaiting = latest.ended && !failed && isPlan && !outcome;
  const review = latest.ended && !failed && !isPlan && job?.worktreeState === "active" && !settled;
  const stage = stageOf(latest.events, latest.ended);

  const moment: Moment = !job
    ? "starting"
    : live
      ? isPlan
        ? "planning"
        : "working"
      : failed
        ? "problem"
        : outcome === "discarded"
          ? "discarded"
          : isPlan
            ? "plan"
            : "changed";
  // The to-do list: Claude's own, or, when it keeps none, the request split into steps by Protégé
  // and ticked off from what Claude changes and says.
  const claudeTodos = useMemo(() => todosFrom(jobTodoSteps(list.map((f) => f.events))), [list]);
  const work = useMemo(
    () => ({
      changes: latest.events.filter(isChangeStep).map((e) => `${stepLabel(e)}${e.payload?.detail?.preview ? `: ${e.payload.detail.preview}` : ""}`),
      said: latest.events.filter((e) => e.type === "text" && !e.payload?.subagent && e.payload?.text).map((e) => String(e.payload.text)),
    }),
    [latest.events]
  );
  const requestTodos = useRequestTodos({
    enabled: !claudeTodos.length && !!job && !isPlan && (moment === "working" || moment === "changed" || moment === "problem"),
    request: job ? ownWords(job.prompt) : "",
    changes: work.changes,
    said: work.said,
    finished: !live,
  });
  const todos = claudeTodos.length ? claudeTodos : requestTodos;

  const stageWords =
    moment === "planning"
      ? "Reading your work to make a plan"
      : moment === "plan"
        ? "The plan is ready"
        : moment === "problem"
          ? "Stopped with a problem"
          : stage === 4 && !review
            ? "Finished"
            : STAGES[stage];

  // Tell the person on the Conversation side when the panel has something new.
  useEffect(() => {
    if (tab === "chat" && (moment === "plan" || moment === "changed" || moment === "problem")) setUnseen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moment]);

  // What changed, step by step: the grouping at once, then the written-up version.
  useEffect(() => {
    if (moment !== "changed") return;
    let cancelled = false;
    let full = false;
    setStep(null);
    setStoryWriting(true);
    apiFetch(`/api/jobs/${latestId}/story?quick=1`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled && !full && j.story) setStory(j.story);
      })
      .catch(() => {});
    apiFetch(`/api/jobs/${latestId}/story`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        full = true;
        if (!cancelled && j.story) setStory(j.story);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setStoryWriting(false);
      });
    return () => {
      cancelled = true;
    };
  }, [moment, latestId]);

  const launch = async (body: Record<string, unknown>) => {
    setSending(true);
    const r = await apiFetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, continueFrom: latestId, permissionMode: "acceptEdits", isolate: gitRepo, ...body }),
    }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setSending(false);
    if (j.job?.id) {
      setSettled(null);
      setStory(null);
      setStep(null);
      setIds((x) => [...x, j.job.id]);
      return true;
    }
    return false;
  };

  const send = async () => {
    const text = reply.trim();
    if (!text || sending) return;
    const prompt = about ? `About the part of the project called “${about.name}” (${about.path}): ${text}` : text;
    const ok = await launch(
      planWaiting
        ? // Changes to the plan: plan again, still without changing anything.
          { prompt, planFirst: true }
        : { prompt, autoVerify: gitRepo, autoFix: gitRepo, maintainTasks: true }
    );
    if (ok) {
      setReply("");
      setAbout(null);
    }
  };
  const goAhead = () =>
    launch({ prompt: "Go ahead with the plan.", agentId: "make-change", autoVerify: gitRepo, autoFix: gitRepo, maintainTasks: true });
  const setPlanAside = async () => {
    if (job?.worktreeState === "active") await apiFetch(`/api/jobs/${latestId}/discard`, { method: "POST" }).catch(() => {});
    setSettled("discarded");
    onFinished?.();
  };
  const stop = () => apiFetch(`/api/jobs/${latestId}/stop`, { method: "POST" }).catch(() => {});

  const showPanel = () => {
    setTab("panel");
    setUnseen(false);
  };

  return (
    <div className="rounded-2xl border border-border bg-panel p-5">
      {ids.map((id) => (
        <JobFeed key={id} jobId={id} onUpdate={onUpdate} />
      ))}

      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="text-sm font-semibold">
          {live
            ? isPlan
              ? "Protégé is working out a plan"
              : "Protégé is working on it"
            : failed
              ? "Protégé ran into a problem"
              : planWaiting
                ? "Protégé has a plan for you to approve"
                : review
                  ? "Protégé made some changes"
                  : "Finished"}
        </div>
        {live && (
          <button onClick={stop} className="text-[11px] px-2 py-1 rounded border border-border text-muted hover:text-bad hover:border-bad/40 shrink-0">
            Stop
          </button>
        )}
      </div>

      {/* Below wide screens, the conversation and the panel take turns. */}
      <div className="xl:hidden inline-flex rounded-lg border border-border p-0.5 text-[12.5px] mb-4" role="tablist">
        <button
          role="tab"
          aria-selected={tab === "chat"}
          onClick={() => setTab("chat")}
          className={`px-3 py-1 rounded-md ${tab === "chat" ? "bg-panel-2 text-text font-medium" : "text-muted hover:text-text"}`}
        >
          Conversation
        </button>
        <button
          role="tab"
          aria-selected={tab === "panel"}
          onClick={showPanel}
          className={`px-3 py-1 rounded-md inline-flex items-center gap-1.5 ${tab === "panel" ? "bg-panel-2 text-text font-medium" : "text-muted hover:text-text"}`}
        >
          What&apos;s happening
          {unseen && tab === "chat" && <span className="w-1.5 h-1.5 rounded-full bg-accent" aria-label="(something new)" />}
        </button>
      </div>

      <div className="xl:flex xl:items-start">
        <div className={`min-w-0 xl:flex-1 xl:pr-5 ${tab === "chat" ? "" : "hidden xl:block"}`}>
          <Conversation feeds={list} />

          {failed && (
            <div className="mt-4 rounded-xl border border-bad/30 bg-bad/5 px-4 py-3">
              <div className="text-sm font-medium text-bad">{plainError(job?.error || "").message}</div>
              <p className="text-[12.5px] text-muted mt-0.5">{plainError(job?.error || "").hint}</p>
            </div>
          )}

          {planWaiting && (
            <div className="mt-4 rounded-2xl border border-warn/30 bg-warn/5 p-4">
              <div className="text-sm font-medium">Happy with the plan?</div>
              <p className="text-[12.5px] text-muted mt-0.5">
                {plan?.parts.length ? "It's drawn on the parts map, with any new parts as dashed outlines. " : ""}
                Nothing has changed yet. Go ahead, or say below what to change in the plan.
              </p>
              <div className="flex items-center gap-2 mt-3">
                <button
                  onClick={goAhead}
                  disabled={sending}
                  className="px-4 py-2 rounded-xl bg-good/15 border border-good/40 text-good hover:bg-good/25 text-sm font-semibold disabled:opacity-50"
                >
                  {sending ? "Starting…" : "Go ahead"}
                </button>
                <button onClick={setPlanAside} disabled={sending} className="px-3 py-2 rounded-xl border border-border text-muted hover:text-text text-sm">
                  Not now
                </button>
              </div>
            </div>
          )}
          {outcome === "discarded" && isPlan && (
            <p className="mt-4 text-sm text-muted">The plan was set aside. Nothing was changed.</p>
          )}

          {review && (
            <div className="mt-4">
              <SimpleReview
                jobId={latestId}
                resultText={resultText}
                compact
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

          {outcome === "applied" && (
            <div className="mt-4 rounded-xl border border-good/30 bg-good/5 px-4 py-3 text-sm text-good font-medium">
              ✓ Kept. The change is in your project now; you can undo it from the project&apos;s History.
            </div>
          )}
          {outcome === "discarded" && !isPlan && (
            <p className="mt-4 text-sm text-muted">The changes were thrown away. Nothing was kept.</p>
          )}

          {moment === "changed" && story && story.steps.length > 0 && (
            <div className="mt-3">
              <div className="text-[12px] text-muted mb-1.5">What changed, step by step:</div>
              <div className="flex flex-wrap gap-1.5">
                {story.steps.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setStep(step === i ? null : i);
                      showPanel();
                    }}
                    aria-pressed={step === i}
                    className={`text-[12px] px-2.5 py-1 rounded-full border ${
                      step === i ? "border-accent bg-accent/15 text-accent" : "border-accent/30 text-accent hover:bg-accent/10"
                    }`}
                  >
                    {i + 1}. {s.title}
                  </button>
                ))}
              </div>
            </div>
          )}

          {latest.ended && outcome !== "discarded" && (
            <div className="mt-4">
              {about && (
                <div className="mb-1.5 inline-flex items-center gap-1.5 text-[12px] px-2.5 py-1 rounded-full border border-accent/40 bg-accent/10 text-accent">
                  About: {about.name}
                  <button onClick={() => setAbout(null)} aria-label="Not about this part" className="hover:text-text">
                    ✕
                  </button>
                </div>
              )}
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
                  placeholder={
                    planWaiting
                      ? "Say what to change in the plan…"
                      : about
                        ? `What about ${about.name}?`
                        : review
                          ? "Ask for another change before you decide…"
                          : "Reply to Protégé…"
                  }
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
                {planWaiting
                  ? "Protégé will change the plan, still without changing anything."
                  : `Your reply continues the same conversation with Claude Code${review ? ", on the same safe copy" : ""}.`}
                {components.length > 0 && !about ? " To talk about one part, tap it on the parts map." : ""}
              </p>
            </div>
          )}
        </div>

        <div className="hidden xl:flex xl:self-stretch">
          <ResizeHandle side="right" label="What's happening panel" width={panelSize.width} onChange={panelSize.set} onReset={panelSize.reset} min={380} />
        </div>
        <div
          style={{ ["--panel-w" as string]: `${panelSize.width}px` }}
          className={`min-w-0 xl:shrink-0 xl:w-[var(--panel-w)] xl:pl-5 xl:border-l xl:border-border xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto ${tab === "panel" ? "" : "hidden xl:block"}`}
        >
          <ContextPanel
            flush
            projectId={projectId}
            assessment={assessment || null}
            previewEntry={previewEntry || null}
            moment={moment}
            run={job ? { events: latest.events, startedAt: job.startedAt, endedAt: job.endedAt } : null}
            todos={todos}
            todosFromRequest={!claudeTodos.length}
            todoRequest={job ? ownWords(job.prompt) : undefined}
            stage={stageWords}
            plan={plan}
            changing={changingNow}
            story={story}
            storyWriting={storyWriting}
            step={step}
            onStep={setStep}
            reviewJobId={review ? latestId : null}
            onPick={
              latest.ended && outcome !== "discarded"
                ? (p) => {
                    setAbout(p);
                    setTab("chat");
                  }
                : undefined
            }
          />
        </div>
      </div>
    </div>
  );
}
