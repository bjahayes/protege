"use client";

// The project's History tab: every turn of every saved Claude Code conversation in the project's
// folder (the Code page, Claude desktop, a terminal, an IDE), newest first, explored the same way
// as the "What's happening" panel, with the room of a full page. On the left, a timeline of turns
// grouped by day, each with a short summary of what it did; on the right, the turn chosen: what was
// asked, the parts map with the turn's steps marked on it, the steps with their code changes, its
// plan if it made one in Plan mode, how the run went, and what Claude said at the end.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import type { Assessment } from "@/lib/assessment";
import type { ChatItem } from "@/lib/chat-format";
import type { ChangeStory } from "@/lib/change-story";
import type { HistoryTurn } from "@/lib/turn-history";
import type { Plan } from "@/lib/plan";
import { matchPart } from "@/lib/plan";
import { collectChanges } from "@/lib/chat-changes";
import { chatEvents, planLines, storyFiles, turnPlan, turnTimes } from "@/lib/chat-panel";
import { inFolder } from "@/lib/turn-digest";
import { groupFiles } from "@/lib/story-steps";
import { plainDuration, replaySegments, workingTime } from "@/lib/replay";
import PartsMap, { type PartMark } from "./simple/PartsMap";
import ReplayStrip from "./simple/ReplayStrip";
import TodoList from "./simple/TodoList";
import { chatTodoSteps, todosFrom } from "@/lib/todo-list";
import { PlanSteps, StorySteps } from "./simple/ContextPanel";
import MarkdownView from "./MarkdownView";
import { ResizeHandle, usePanelWidth } from "./Resizer";

type Filter = "all" | "changed";

function dayLabel(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const y = new Date(today);
  y.setDate(today.getDate() - 1);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, today)) return "Today";
  if (same(d, y)) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: d.getFullYear() === today.getFullYear() ? undefined : "numeric" });
}
const clock = (ts: number) => new Date(ts).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
const firstLine = (s: string) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > 110 ? t.slice(0, 110) + "…" : t;
};

export default function TurnHistory({ projectId, assessment }: { projectId: string; assessment: Assessment | null }) {
  const [turns, setTurns] = useState<HistoryTurn[] | null>(null);
  const [cwd, setCwd] = useState<string>("");
  const [sel, setSel] = useState(0);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [summarising, setSummarising] = useState(false);
  const listW = usePanelWidth("protege.panel.history", 360, 260, (vw) => vw - 760);
  const listRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const r = await apiFetch(`/api/projects/${projectId}/turns`, { cache: "no-store" }).catch(() => null);
    const j = r ? await r.json().catch(() => null) : null;
    if (!j) return;
    setTurns(j.turns || []);
    setCwd(j.cwd || "");
  }, [projectId]);
  useEffect(() => {
    load();
  }, [load]);

  // Summaries for the turns that don't have one yet, a batch at a time, newest first.
  useEffect(() => {
    if (!turns) return;
    const todo = turns.filter((t) => !t.summary && (t.request || t.report));
    if (!todo.length) return;
    let cancelled = false;
    setSummarising(true);
    (async () => {
      for (let i = 0; i < todo.length && !cancelled; i += 50) {
        const batch = todo.slice(i, i + 50).map(({ key, request, report, files }) => ({ key, request, report, files }));
        const r = await apiFetch("/api/turn-summaries", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ turns: batch }) }).catch(() => null);
        const j = r ? await r.json().catch(() => null) : null;
        if (cancelled || !j?.summaries) continue;
        setTurns((ts) => ts && ts.map((t) => (j.summaries[t.key] && !t.summary ? { ...t, summary: j.summaries[t.key] } : t)));
      }
      if (!cancelled) setSummarising(false);
    })();
    return () => {
      cancelled = true;
    };
    // Run when the list arrives, not on every summary that lands.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turns === null, turns?.length]);

  const shown = useMemo(() => {
    const words = q.trim().toLowerCase();
    return (turns || [])
      .map((t, i) => ({ t, i }))
      .filter(({ t }) => (filter === "changed" ? t.files.length > 0 : true))
      .filter(({ t }) => !words || `${t.summary || ""} ${t.request} ${t.sessionTitle}`.toLowerCase().includes(words));
  }, [turns, q, filter]);
  const current = turns?.[sel] || null;

  // Up and down move through the list.
  const move = (d: number) => {
    const pos = shown.findIndex((x) => x.i === sel);
    const next = shown[Math.min(shown.length - 1, Math.max(0, pos + d))];
    if (next) setSel(next.i);
  };
  useEffect(() => {
    listRef.current?.querySelector(`[data-turn="${sel}"]`)?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  if (!turns) return <div className="text-sm text-muted">Reading this project&apos;s conversations…</div>;
  if (!turns.length)
    return <div className="text-sm text-muted">There are no saved Claude Code conversations in this project&apos;s folder yet.</div>;

  let lastDay = "";
  let lastSession = "";
  return (
    <div className="flex h-[calc(100vh-190px)] min-h-[520px] -m-6 max-md:flex-col">
      <div style={{ width: listW.width }} className={`shrink-0 flex flex-col min-h-0 border-r border-border max-md:!w-full max-md:max-h-[45vh] max-md:border-r-0 max-md:border-b`}>
        <div className="p-3 flex flex-col gap-2 border-b border-border">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search the turns"
            className="text-[12.5px] bg-bg border border-border rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-accent/50"
          />
          <div className="flex items-center justify-between gap-2">
            <div className="inline-flex rounded-lg border border-border p-0.5 text-[12px]" role="tablist" aria-label="Which turns">
              {(
                [
                  ["all", "All turns"],
                  ["changed", "Changed files"],
                ] as [Filter, string][]
              ).map(([f, label]) => (
                <button
                  key={f}
                  role="tab"
                  aria-selected={filter === f}
                  onClick={() => setFilter(f)}
                  className={`px-2.5 py-1 rounded-md ${filter === f ? "bg-panel-2 text-text font-medium" : "text-muted hover:text-text"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <span className="text-[11px] text-muted">{summarising ? "Summarising…" : `${shown.length} of ${turns.length}`}</span>
          </div>
        </div>
        <div
          ref={listRef}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") move(1);
            else if (e.key === "ArrowUp") move(-1);
            else return;
            e.preventDefault();
          }}
          className="flex-1 min-h-0 overflow-y-auto p-1.5 outline-none"
          aria-label="Turns, newest first"
        >
          {shown.map(({ t, i }) => {
            const day = dayLabel(t.startedAt);
            const head = day !== lastDay;
            lastDay = day;
            // The conversation is named where it changes, not on every row.
            const newSession = head || t.sessionId !== lastSession;
            lastSession = t.sessionId;
            return (
              <div key={`${t.sessionId}:${t.index}`}>
                {head && <div className="px-2.5 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">{day}</div>}
                <button
                  data-turn={i}
                  onClick={() => setSel(i)}
                  aria-current={sel === i}
                  className={`w-full text-left px-2.5 py-2 rounded-lg mb-0.5 ${sel === i ? "bg-panel-2" : "hover:bg-panel-2/60"}`}
                >
                  <div className={`text-[13px] leading-snug ${t.summary ? "" : "text-muted"}`}>{t.summary || firstLine(t.request) || "(no message)"}</div>
                  <div className="text-[11px] text-muted mt-0.5 flex items-center gap-1.5 min-w-0">
                    <span className="shrink-0">{clock(t.startedAt)}</span>
                    {t.files.length > 0 && <span className="shrink-0 text-accent">· {t.files.length} file{t.files.length === 1 ? "" : "s"}</span>}
                    {newSession && <span className="truncate">· {t.sessionTitle}</span>}
                  </div>
                </button>
              </div>
            );
          })}
          {!shown.length && <div className="text-[12.5px] text-muted px-2.5 py-3">No turns match.</div>}
        </div>
      </div>
      <ResizeHandle side="left" label="List of turns" width={listW.width} onChange={listW.set} onReset={listW.reset} min={260} />
      <div className="flex-1 min-w-0 min-h-0 overflow-y-auto">
        {current && (
          <TurnDetail
            key={`${current.sessionId}:${current.index}`}
            projectId={projectId}
            turn={current}
            cwd={cwd}
            assessment={assessment}
            onNewer={sel > 0 ? () => setSel(sel - 1) : undefined}
            onOlder={sel < turns.length - 1 ? () => setSel(sel + 1) : undefined}
          />
        )}
      </div>
    </div>
  );
}

function TurnDetail({
  projectId,
  turn,
  cwd,
  assessment,
  onNewer,
  onOlder,
}: {
  projectId: string;
  turn: HistoryTurn;
  cwd: string;
  assessment: Assessment | null;
  onNewer?: () => void;
  onOlder?: () => void;
}) {
  const [items, setItems] = useState<ChatItem[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    apiFetch(`/api/projects/${projectId}/turns?session=${turn.sessionId}&turn=${turn.index}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => !cancelled && setItems(j.items || []))
      .catch(() => !cancelled && setItems([]));
    return () => {
      cancelled = true;
    };
  }, [projectId, turn.sessionId, turn.index]);

  const files = useMemo(() => {
    if (!items) return [];
    type Res = Extract<ChatItem, { kind: "tool_result" }>;
    const results = new Map<string, Res>();
    for (const i of items) if (i.kind === "tool_result") results.set(i.toolUseId, i);
    return storyFiles(collectChanges(items, results, cwd).filter((f) => inFolder(f.rel)));
  }, [items, cwd]);
  const components = assessment?.components || [];

  // What changed, step by step: the grouping at once, then the written-up steps.
  const [story, setStory] = useState<ChangeStory | null>(null);
  const [writing, setWriting] = useState(false);
  const [step, setStep] = useState<number | null>(null);
  useEffect(() => {
    if (!files.length) return;
    let cancelled = false;
    setStory({ jobId: "", steps: groupFiles(files, components), written: "files", createdAt: Date.now() });
    setWriting(true);
    apiFetch("/api/chat/story", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, files, request: turn.request, report: turn.report }),
    })
      .then((r) => r.json())
      .then((j) => !cancelled && j.story && setStory(j.story))
      .catch(() => {})
      .finally(() => !cancelled && setWriting(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files.length, projectId]);

  // A plan it put forward in Plan mode.
  const planText = items ? turnPlan(items) : null;
  const [plan, setPlan] = useState<Plan | null>(null);
  useEffect(() => {
    if (!planText) return;
    let cancelled = false;
    setPlan({ steps: planLines(planText), parts: [] });
    apiFetch("/api/chat/plan-parts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId, plan: planText }) })
      .then((r) => r.json())
      .then((j) => !cancelled && j.plan && setPlan(j.plan))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [planText, projectId]);

  // The map's markings: the steps of what changed; or, for a turn that only planned, the plan.
  const { marks, ghosts } = useMemo(() => {
    const marks = new Map<string, PartMark>();
    const ghosts: { name: string; what: string }[] = [];
    if (story?.steps.length) {
      story.steps.forEach((s, i) => {
        if (!s.part || (step != null && step !== i)) return;
        if (!marks.has(s.part)) marks.set(s.part, { tone: "step", label: `Step ${i + 1}: ${s.title}`, n: i + 1 });
      });
    } else if (plan) {
      const names = components.map((c) => c.name);
      for (const p of plan.parts) {
        const hit = matchPart(p.name, names);
        if (hit) marks.set(hit, { tone: "plan", label: p.change === "new" ? "Will be extended" : "Will change" });
        else ghosts.push({ name: p.name, what: p.what || "A new part the plan would add." });
      }
    }
    return { marks, ghosts };
  }, [story, step, plan, components]);

  const run = useMemo(() => {
    if (!items?.length) return null;
    const t = turnTimes(items);
    return t.startedAt ? { events: chatEvents(items), ...t } : null;
  }, [items]);
  // The time it spent working, without long idle gaps (a session picked up again later).
  const took = run ? workingTime(replaySegments(run.events, run.endedAt || run.events[run.events.length - 1]?.ts || run.startedAt)) : 0;
  // Only this turn's items are loaded, so an update to an item made in an earlier turn is left out.
  const todos = useMemo(() => (items ? todosFrom(chatTodoSteps(items as any, items)) : []), [items]);

  return (
    <div className="p-6 max-w-[1500px]">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0 max-w-3xl">
          <h2 className="text-lg font-semibold leading-snug">{turn.summary || firstLine(turn.request) || "A turn"}</h2>
          <div className="text-[12px] text-muted mt-1">
            {dayLabel(turn.startedAt)}, {clock(turn.startedAt)}
            {took > 0 ? ` · took ${plainDuration(took)}` : ""} · turn {turn.index + 1} of {turn.of} in “{turn.sessionTitle}”
            {turn.files.length ? ` · ${turn.files.length} file${turn.files.length === 1 ? "" : "s"} changed` : ""}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 text-[12px]">
          <button onClick={onNewer} disabled={!onNewer} className="px-2.5 py-1.5 rounded-lg border border-border text-muted hover:text-text disabled:opacity-30">
            ‹ Newer
          </button>
          <button onClick={onOlder} disabled={!onOlder} className="px-2.5 py-1.5 rounded-lg border border-border text-muted hover:text-text disabled:opacity-30">
            Older ›
          </button>
        </div>
      </div>

      {turn.request && (
        <div className="mt-4 rounded-2xl rounded-br-md bg-accent/10 border border-accent/25 px-4 py-3 text-sm whitespace-pre-wrap max-w-3xl max-h-48 overflow-y-auto">
          {turn.request}
        </div>
      )}

      {!items ? (
        <p className="mt-6 text-sm text-muted">Reading the turn…</p>
      ) : (
        <div className="mt-6 grid grid-cols-1 2xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] gap-6 items-start">
          <div className="min-w-0 space-y-5">
            {components.length ? (
              <section>
                <h3 className="text-sm font-semibold text-muted mb-2">
                  {story?.steps.length ? "Where the change happened" : plan ? "What the plan would change" : "The project's parts"}
                </h3>
                <div className="rounded-xl border border-border bg-panel p-4">
                  <PartsMap assessment={assessment!} marks={marks} ghosts={ghosts} compact />
                </div>
              </section>
            ) : null}
            {run && (
              <section>
                <h3 className="text-sm font-semibold text-muted mb-2">How the run went</h3>
                <div className="rounded-xl border border-border bg-panel p-4">
                  <ReplayStrip events={run.events} startedAt={run.startedAt} endedAt={run.endedAt} live={false} stage={`${turn.steps} steps`} />
                </div>
              </section>
            )}
          </div>
          <div className="min-w-0 space-y-5">
            {todos.length > 0 && (
              <section className="rounded-xl border border-border bg-panel p-4">
                <TodoList todos={todos} request={turn.request} live={false} />
              </section>
            )}
            {files.length > 0 && story && (
              <section>
                <h3 className="text-sm font-semibold text-muted mb-2">What changed</h3>
                <StorySteps story={story} writing={writing} step={step} onStep={setStep} />
              </section>
            )}
            {plan && (
              <section>
                <h3 className="text-sm font-semibold text-muted mb-2">The plan it put forward</h3>
                <PlanSteps plan={plan} past />
              </section>
            )}
            {!files.length && !plan && <p className="text-[12.5px] text-muted">This turn didn&apos;t change any of the project&apos;s files.</p>}
            {turn.report && (
              <section>
                <h3 className="text-sm font-semibold text-muted mb-2">What Claude said at the end</h3>
                <div className="rounded-xl border border-border bg-panel px-4 py-3 tx-md chat-md max-h-[480px] overflow-y-auto">
                  <MarkdownView content={turn.report} />
                </div>
              </section>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
