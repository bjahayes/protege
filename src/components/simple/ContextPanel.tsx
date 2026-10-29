"use client";

// The context panel beside a task's conversation. It shows one picture at a time, chosen by
// where the task is up to, so the person never has to work out where to look:
//   - while Protégé plans: the plan drawn on the parts map (dashed outlines for new parts,
//     amber for parts it will change) and the plan's steps;
//   - while it works: the parts being changed light up, and the run's replay strip;
//   - after a change: what changed as numbered steps, each on the map, with its code changes
//     one tap away, and the app before and after.
// The parts map stays the same picture throughout; only its markings change. A switch swaps it
// for the app itself. The panel follows the task, and stops following when the person uses it
// ("Paused" with a way back to live). It serves both a Simple-mode task and a Code (Chat page)
// conversation: each passes its latest run as events with times.

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import type { Assessment, ComponentInfo } from "@/lib/assessment";
import type { ReactNode } from "react";
import type { JobEvent } from "@/lib/types";
import type { ChangeStory } from "@/lib/change-story";
import type { DiffLine } from "@/lib/chat-changes";
import { matchPart, type Plan } from "@/lib/plan";
import PartsMap, { type PartMark } from "./PartsMap";
import ReplayStrip from "./ReplayStrip";
import TodoList from "./TodoList";
import type { TodoItem } from "@/lib/todo-list";
import { DiffLines } from "../chat/Changes";

export type Moment = "starting" | "planning" | "plan" | "working" | "changed" | "problem" | "discarded" | "quiet";

/** A run of work for the replay strip: its events, and when it started and finished. */
export interface PanelRun {
  events: JobEvent[];
  startedAt: number;
  endedAt?: number;
}

const headline = (who: string): Record<Moment, string> => ({
  starting: "Getting started",
  planning: `${who} is reading your work to make a plan`,
  plan: `The plan ${who} wants to follow`,
  working: `What ${who} is doing now`,
  changed: "What changed",
  problem: "Where it stopped",
  discarded: "Nothing was kept",
  quiet: "Nothing has changed yet",
});

/** The lines of one file's unified diff, without the headers. */
function patchLines(patch: string): DiffLine[] {
  const out: DiffLine[] = [];
  for (const l of String(patch || "").split("\n")) {
    if (/^(diff --git|index |--- |\+\+\+ |new file mode|deleted file mode|similarity|rename )/.test(l)) continue;
    if (l.startsWith("@@")) {
      if (out.length) out.push({ op: " ", text: "…" });
      continue;
    }
    if (l.startsWith("+")) out.push({ op: "+", text: l.slice(1) });
    else if (l.startsWith("-")) out.push({ op: "-", text: l.slice(1) });
    else if (l.startsWith(" ")) out.push({ op: " ", text: l.slice(1) });
  }
  return out;
}

function FileCounts({ f }: { f: { status: string; additions: number; deletions: number } }) {
  return (
    <span className="shrink-0 tabular-nums text-[11.5px] text-muted">
      {f.status === "A" ? (
        <span className="text-good">new file</span>
      ) : f.status === "D" ? (
        <span className="text-bad">removed</span>
      ) : (
        <>
          <span className="text-good">+{f.additions}</span> <span className="text-bad">−{f.deletions}</span>
        </>
      )}
    </span>
  );
}

export function StorySteps({
  story,
  writing,
  step,
  onStep,
}: {
  story: ChangeStory;
  writing: boolean;
  step: number | null;
  onStep: (i: number | null) => void;
}) {
  const [code, setCode] = useState<string | null>(null);
  if (!story.steps.length) return <p className="text-[12.5px] text-muted">It didn&apos;t change any of the project&apos;s files.</p>;
  return (
    <div>
      <div className="text-[12px] text-muted mb-2">
        {story.steps.length === 1 ? "The change, in one step" : `The change, in ${story.steps.length} steps`}
        {writing ? " (writing them up…)" : ""}. Tap a step to see it on the map.
      </div>
      <ol className="flex flex-col gap-2">
        {story.steps.map((s, i) => {
          const open = step === i;
          return (
            <li key={i} className={`rounded-xl border ${open ? "border-accent/60 bg-accent/5" : "border-border bg-panel"}`}>
              <button onClick={() => onStep(open ? null : i)} aria-expanded={open} className="w-full text-left px-3 py-2.5 flex items-start gap-2.5">
                <span className="shrink-0 w-5 h-5 mt-px rounded-full bg-accent text-bg text-[11px] font-bold flex items-center justify-center">{i + 1}</span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold leading-snug">{s.title}</span>
                  {s.plain && <span className="block text-[12.5px] text-muted leading-snug mt-0.5">{s.plain}</span>}
                </span>
              </button>
              {open && (
                <div className="px-3 pb-3 -mt-0.5">
                  <div className="rounded-lg border border-border divide-y divide-border">
                    {s.files.map((f) => (
                      <div key={f.path}>
                        <div className="flex items-center justify-between gap-3 px-2.5 py-1.5 text-[12px]">
                          <span className="font-mono truncate min-w-0">{f.path}</span>
                          <FileCounts f={f} />
                        </div>
                        {f.patch ? (
                          code === f.path ? (
                            <div className="px-2 pb-2">
                              <DiffLines lines={patchLines(f.patch)} className="max-h-72" />
                              <button onClick={() => setCode(null)} className="text-[11.5px] text-muted hover:text-text mt-1">
                                Hide the code changes
                              </button>
                            </div>
                          ) : (
                            <button onClick={() => setCode(f.path)} className="px-2.5 pb-1.5 text-[11.5px] text-accent hover:underline">
                              See the code changes
                            </button>
                          )
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function PlanSteps({ plan, reading, past }: { plan: Plan | null; reading?: boolean; past?: boolean }) {
  if (!plan?.steps.length && reading) return <p className="text-[12.5px] text-muted">Reading the plan…</p>;
  if (!plan?.steps.length)
    return <p className="text-[12.5px] text-muted">The plan is in the conversation. It didn&apos;t name the parts it would change, so there&apos;s nothing marked on the map.</p>;
  return (
    <div>
      <div className="text-[12px] text-muted mb-2">
        {past ? "What it would do" : "What it will do"}
        {reading ? " (finding the parts it touches…)" : ""}
        {past ? "." : ". Approve it, or say what to change, in the conversation."}
      </div>
      <ol className="flex flex-col gap-1.5">
        {plan.steps.map((s, i) => (
          <li key={i} className="flex items-start gap-2.5 text-[13px] leading-snug">
            <span className="shrink-0 w-5 h-5 rounded-full border border-warn/60 text-warn text-[11px] font-bold flex items-center justify-center">{i + 1}</span>
            <span>{s}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default function ContextPanel({
  projectId,
  assessment,
  previewEntry,
  moment,
  run,
  stage,
  plan,
  planReading,
  storyControls,
  todos = [],
  todoRequest,
  todosFromRequest,
  onClose,
  changing,
  story,
  storyWriting,
  step,
  onStep,
  reviewJobId,
  onPick,
  who = "Protégé",
  flush,
}: {
  projectId: string;
  assessment: Assessment | null;
  previewEntry: string | null;
  moment: Moment;
  /** The latest run of the conversation, for the replay strip. */
  run: PanelRun | null;
  /** The plan's parts are still being worked out. */
  planReading?: boolean;
  /** Shown above the steps of what changed (the Code page's "Last change / Whole session"). */
  storyControls?: ReactNode;
  /** Claude Code's to-do list for the turn shown (lib/todo-list.ts), live while it works. */
  todos?: TodoItem[];
  /** What the person asked, to word the to-do items for them. */
  todoRequest?: string;
  /** The list was made by Protégé from the request, as Claude didn't keep one. */
  todosFromRequest?: boolean;
  /** Shown as a close button (the Code page's panel can be closed). */
  onClose?: () => void;
  /** Where the task is up to, in words. */
  stage: string;
  plan: Plan | null;
  /** Parts being changed right now. */
  changing: Set<string>;
  story: ChangeStory | null;
  storyWriting: boolean;
  step: number | null;
  onStep: (i: number | null) => void;
  /** A run whose safe copy is waiting for Keep or Throw away: its app can be shown beside the original. */
  reviewJobId: string | null;
  onPick?: (part: ComponentInfo) => void;
  /** Who does the work, for the headings: Protégé in Simple mode, Claude on the Code page. */
  who?: string;
  /** No card of its own (it sits in a side column that already frames it), leaving the map room. */
  flush?: boolean;
}) {
  const [paused, setPaused] = useState(false);
  const [shown, setShown] = useState<Moment>(moment);
  const [view, setView] = useState<"map" | "app">("map");
  const [side, setSide] = useState<"before" | "after">("after");
  const [origin, setOrigin] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  // The map is shown when something on it is marked; otherwise it waits behind a button.
  const [mapOpen, setMapOpen] = useState(false);

  // Follow the task: move on with it, unless the person is using the panel.
  useEffect(() => {
    if (!paused && moment !== shown) {
      setShown(moment);
      setView("map");
      setSide("after");
    }
  }, [moment, paused, shown]);
  const pause = () => setPaused(true);
  const backToLive = () => {
    setPaused(false);
    setShown(moment);
    setView("map");
    setSide("after");
    onStep(null);
  };

  useEffect(() => {
    if (!previewEntry || origin) return;
    apiFetch("/api/preview-origin", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setOrigin(j.origin || null))
      .catch(() => setOrigin(null));
  }, [previewEntry, origin]);
  // A finished change: reload the app so it shows the new version.
  useEffect(() => setNonce((n) => n + 1), [moment, reviewJobId]);

  const partNames = useMemo(() => (assessment?.components || []).map((c) => c.name), [assessment]);

  // The map's markings for what's shown.
  const { marks, ghosts } = useMemo(() => {
    const marks = new Map<string, PartMark>();
    const ghosts: { name: string; what: string }[] = [];
    if (shown === "plan" && plan) {
      for (const p of plan.parts) {
        const hit = matchPart(p.name, partNames);
        if (hit) marks.set(hit, { tone: "plan", label: p.change === "new" ? "Will be extended" : "Will change" });
        else ghosts.push({ name: p.name, what: p.what || "A new part the plan would add." });
      }
    } else if (shown === "changed" && story) {
      story.steps.forEach((s, i) => {
        if (!s.part || (step != null && step !== i)) return;
        if (!marks.has(s.part)) marks.set(s.part, { tone: "step", label: `Step ${i + 1}: ${s.title}`, n: i + 1 });
      });
    }
    return { marks, ghosts };
  }, [shown, plan, story, step, partNames]);

  const liveChanging = shown === "working" || shown === "planning" ? changing : new Set<string>();
  const mapMarked = marks.size > 0 || ghosts.length > 0 || liveChanging.size > 0;
  const hasMap = !!assessment?.components?.length;
  // With no map of the project, the app is the picture.
  const shownView = hasMap ? view : previewEntry ? "app" : view;
  const appSrc =
    origin && previewEntry
      ? reviewJobId && side === "after" && shown === "changed"
        ? `${origin}/_job/${encodeURIComponent(reviewJobId)}/`
        : `${origin}/${encodeURIComponent(projectId)}/`
      : null;

  const strip = run ? (
    <ReplayStrip
      events={run.events}
      startedAt={run.startedAt}
      endedAt={run.endedAt}
      live={shown === "working" || shown === "planning" || shown === "starting"}
      stage={stage}
      onInteract={pause}
    />
  ) : null;

  return (
    <section aria-label="What's happening" className={`flex flex-col gap-3 min-w-0 ${flush ? "" : "rounded-2xl border border-border bg-bg/40 p-4"}`}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">{headline(who)[shown]}</h3>
        <div className="flex items-center gap-1.5 shrink-0">
          {paused && (
            <button onClick={backToLive} className="shrink-0 text-[11.5px] px-2 py-1 rounded-lg border border-accent/40 text-accent hover:bg-accent/10">
              {moment !== shown ? "It has moved on · Back to live" : "Paused · Back to live"}
            </button>
          )}
          {onClose && (
            <button onClick={onClose} aria-label="Close this panel" title="Close" className="w-6 h-6 rounded text-muted hover:text-text hover:bg-panel-2">
              ×
            </button>
          )}
        </div>
      </div>

      {/* While it works (or where it stopped), its to-do list comes first: what's done, what's left. */}
      {todos.length > 0 && (shown === "working" || shown === "planning" || shown === "starting" || shown === "problem") && (
        <TodoList todos={todos} request={todoRequest} live={shown !== "problem"} fromRequest={todosFromRequest} />
      )}

      {/* Each switch shows only when there are two things to switch between. */}
      {((hasMap && !!previewEntry) || (shownView === "app" && reviewJobId && shown === "changed")) && (
        <div className="flex items-center gap-2 flex-wrap">
          {hasMap && !!previewEntry && (
          <div className="inline-flex rounded-lg border border-border p-0.5 text-[12px]" role="tablist">
            {assessment?.components?.length ? (
              <button
                role="tab"
                aria-selected={view === "map"}
                onClick={() => {
                  setView("map");
                  pause();
                }}
                className={`px-2.5 py-1 rounded-md ${view === "map" ? "bg-panel-2 text-text font-medium" : "text-muted hover:text-text"}`}
              >
                Parts map
              </button>
            ) : null}
            {previewEntry && (
              <button
                role="tab"
                aria-selected={view === "app"}
                onClick={() => {
                  setView("app");
                  pause();
                }}
                className={`px-2.5 py-1 rounded-md ${view === "app" ? "bg-panel-2 text-text font-medium" : "text-muted hover:text-text"}`}
              >
                See it working
              </button>
            )}
          </div>
          )}
          {shownView === "app" && reviewJobId && shown === "changed" && (
            <div className="inline-flex rounded-lg border border-border p-0.5 text-[12px]" role="tablist" aria-label="Before or after the change">
              {(["before", "after"] as const).map((s) => (
                <button
                  key={s}
                  role="tab"
                  aria-selected={side === s}
                  onClick={() => setSide(s)}
                  className={`px-2.5 py-1 rounded-md ${side === s ? "bg-panel-2 text-text font-medium" : "text-muted hover:text-text"}`}
                >
                  {s === "before" ? "Before" : "After"}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {shownView === "app" && previewEntry ? (
        appSrc ? (
          <div>
            <iframe
              key={`${appSrc}-${nonce}`}
              src={appSrc}
              title={side === "before" && reviewJobId ? "The app before the change" : "The app"}
              className="w-full h-[440px] rounded-xl border border-border bg-white"
              sandbox="allow-scripts allow-forms allow-popups allow-modals"
            />
            <div className="flex items-center justify-between gap-3 mt-1.5 text-[11.5px] text-muted">
              <span>
                {reviewJobId && shown === "changed"
                  ? side === "after"
                    ? "With the change, on the safe copy."
                    : "As it is now, without the change."
                  : "The project as it is now."}
              </span>
              <a href={appSrc} target="_blank" rel="noreferrer" className="text-accent hover:underline shrink-0">
                Open in a new tab
              </a>
            </div>
          </div>
        ) : (
          <div className="h-[200px] rounded-xl border border-border flex items-center justify-center text-[12.5px] text-muted">Loading the app…</div>
        )
      ) : assessment?.components?.length && !mapMarked && !mapOpen ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-[12.5px] text-muted">
          <span>
            {shown === "changed" ? "This change didn’t touch any of the parts on the map." : "Nothing on the parts map is involved yet."}
          </span>
          <button onClick={() => setMapOpen(true)} className="shrink-0 text-accent hover:underline">
            Show the map
          </button>
        </div>
      ) : assessment?.components?.length ? (
        <div className={flush ? "" : "rounded-xl border border-border bg-panel p-3"}>
          <PartsMap assessment={assessment} changing={liveChanging} marks={marks} ghosts={ghosts} onPick={onPick} compact />
          <MapKey moment={shown} marked={marks.size > 0 || liveChanging.size > 0} hasGhosts={ghosts.length > 0} />
        </div>
      ) : (
        <p className="text-[12.5px] text-muted">
          There&apos;s no map of this project&apos;s parts yet, so there&apos;s nothing to draw here. You can ask for one on the project page.
        </p>
      )}

      <div className="border-t border-border pt-3">
        {shown === "plan" ? (
          <PlanSteps plan={plan} reading={planReading} />
        ) : shown === "changed" ? (
          <div className="flex flex-col gap-3">
            {storyControls}
            {story ? (
              <StorySteps
                story={story}
                writing={storyWriting}
                step={step}
                onStep={(i) => {
                  onStep(i);
                  pause();
                }}
              />
            ) : (
              <p className="text-[12.5px] text-muted">Working out what changed…</p>
            )}
            {todos.length > 0 && (
              <details className="group">
                <summary className="text-[12px] text-muted cursor-pointer hover:text-text select-none">
                  The to-do list it worked through ({todos.filter((t) => t.status === "completed").length} of {todos.length} done)
                </summary>
                <div className="mt-2">
                  <TodoList todos={todos} request={todoRequest} live={false} fromRequest={todosFromRequest} />
                </div>
              </details>
            )}
            {strip && (
              <details className="group">
                <summary className="text-[12px] text-muted cursor-pointer hover:text-text select-none">How the run went</summary>
                <div className="mt-2">{strip}</div>
              </details>
            )}
          </div>
        ) : shown === "quiet" ? (
          <div className="flex flex-col gap-3">
            <p className="text-[12.5px] text-muted">Claude hasn&apos;t changed any files in this conversation yet. When it does, the change shows here step by step.</p>
            {strip && (
              <details className="group">
                <summary className="text-[12px] text-muted cursor-pointer hover:text-text select-none">How the last turn went</summary>
                <div className="mt-2">{strip}</div>
              </details>
            )}
          </div>
        ) : (
          strip
        )}
      </div>
    </section>
  );
}

/** One line under the map saying what its markings mean right now (only those on the map). */
function MapKey({ moment, marked, hasGhosts }: { moment: Moment; marked: boolean; hasGhosts: boolean }) {
  const items: { cls: string; text: string }[] = [];
  if (moment === "plan") {
    if (marked) items.push({ cls: "bg-warn", text: "the plan will change it" });
    if (hasGhosts) items.push({ cls: "border border-dashed border-warn", text: "a new part the plan would add" });
  } else if (moment === "working" && marked) items.push({ cls: "bg-accent", text: "being changed now" });
  else if (moment === "changed" && marked) items.push({ cls: "bg-accent", text: "numbered: changed in that step" });
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11px] text-muted">
      {items.map((it) => (
        <span key={it.text} className="inline-flex items-center gap-1.5">
          <span className={`w-2.5 h-2.5 rounded-sm ${it.cls}`} />
          {it.text}
        </span>
      ))}
    </div>
  );
}
