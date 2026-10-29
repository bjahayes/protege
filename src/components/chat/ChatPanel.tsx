"use client";

// The context panel beside a Code (Chat page) conversation: the same panel as a Simple-mode task
// (components/simple/ContextPanel.tsx), fed from the conversation itself. A plan waiting in Plan
// mode is drawn on the parts map; while Claude works, the parts it is changing glow and the turn
// plays out on the replay strip; afterwards, what changed is told as numbered steps, from the
// edits Claude made (a chat works straight in the folder, so its edits are the record). The
// steps cover the last change, or the whole session. A turn picker at the top steps back through
// earlier turns: each shows its own picture (what changed, its plan, how the run went), and
// "Back to the latest" returns to the live one.

import { memo, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import type { ChatItem } from "@/lib/chat-format";
import type { Assessment, ComponentInfo } from "@/lib/assessment";
import type { ChangeStory } from "@/lib/change-story";
import { collectChanges, type FileChange } from "@/lib/chat-changes";
import { chatEvents, pendingPlan, planLines, storyFiles, turnLabel, turnPlan, turnTimes, turns } from "@/lib/chat-panel";
import { groupFiles } from "@/lib/story-steps";
import { digestTurn } from "@/lib/turn-digest";
import { chatTodoSteps, todosFrom } from "@/lib/todo-list";
import { useRequestTodos } from "../simple/TodoList";
import { shortPath } from "@/lib/chat-format";
import { partsForFiles } from "@/lib/live-build";
import type { Plan } from "@/lib/plan";
import ContextPanel, { type Moment } from "../simple/ContextPanel";
import { ResizeHandle, usePanelWidth } from "../Resizer";

type ResultItem = Extract<ChatItem, { kind: "tool_result" }>;

/** A file inside the conversation's folder (its path was shortened to one relative to it). Claude's
 *  own files elsewhere, such as the plan it writes in Plan mode, aren't part of what changed. */
const inProject = (f: FileChange) => !/^([a-zA-Z]:)?\//.test(f.rel);

/** What the person asked in some turns, and what Claude said at the end of them. */
function words(ts: ChatItem[][]): { request: string; report: string } {
  const request = ts
    .map((t) => t.find((i) => i.kind === "user"))
    .map((i) => (i && i.kind === "user" ? i.text : ""))
    .filter(Boolean)
    .join("\nThen: ");
  const report = ts
    .map((t) => [...t].reverse().find((i) => i.kind === "text"))
    .map((i) => (i && i.kind === "text" ? i.text : ""))
    .filter(Boolean)
    .join("\n");
  return { request, report };
}

function ChatPanel({
  items,
  projectId,
  cwd,
  status,
  planMode,
  onClose,
  onPick,
}: {
  items: ChatItem[];
  projectId: string;
  cwd?: string;
  /** The live process's status: starting | working | waiting | idle | ended, or null when not running here. */
  status: string | null;
  /** The conversation is in Plan mode. */
  planMode: boolean;
  onClose: () => void;
  onPick: (part: ComponentInfo) => void;
}) {
  const size = usePanelWidth("protege.panel.chat", 440, 340, (vw) => vw - 560);
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [previewEntry, setPreviewEntry] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    apiFetch(`/api/projects/${projectId}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled || !j) return;
        setAssessment(j.assessment || null);
        setPreviewEntry(j.previewEntry || null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [projectId]);
  const components = useMemo(() => assessment?.components || [], [assessment]);

  const busy = status === "starting" || status === "working" || status === "waiting";
  const { all, perTurn, sessionChanges, last, plan } = useMemo(() => {
    const results = new Map<string, ResultItem>();
    for (const i of items) if (i.kind === "tool_result") results.set(i.toolUseId, i);
    const all = turns(items);
    return {
      all,
      perTurn: all.map((t) => collectChanges(t, results, cwd).filter(inProject)),
      sessionChanges: collectChanges(items, results, cwd).filter(inProject),
      last: all[all.length - 1] || [],
      plan: pendingPlan(items),
    };
  }, [items, cwd]);

  // A short summary of what each finished turn did, for the picker (written once, then kept).
  const digests = useMemo(() => all.map((t) => digestTurn(t, cwd)), [all, cwd]);
  const [summaries, setSummaries] = useState<Record<string, string>>({});
  const doneKeys = digests
    .slice(0, busy ? -1 : undefined)
    .map((d) => d.key)
    .join(",");
  useEffect(() => {
    const todo = digests.slice(0, busy ? -1 : undefined).filter((d) => !summaries[d.key] && (d.request || d.report));
    if (!todo.length) return;
    let cancelled = false;
    apiFetch("/api/turn-summaries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ turns: todo.slice(-80).map(({ key, request, report, files }) => ({ key, request, report, files })) }),
    })
      .then((r) => r.json())
      .then((j) => !cancelled && j.summaries && setSummaries((m) => ({ ...m, ...j.summaries })))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doneKeys]);

  // The turn being looked at: null follows the latest.
  const [viewTurn, setViewTurn] = useState<number | null>(null);
  const past = viewTurn != null && viewTurn < all.length - 1;
  const v = past ? viewTurn! : all.length - 1;
  const pastPlan = past ? turnPlan(all[v]) : null;

  const lastResult = [...last].reverse().find((i) => i.kind === "result");
  const failed = !busy && !!lastResult && lastResult.kind === "result" && lastResult.isError && !lastResult.stopped;
  const changingTurns = perTurn.map((c, k) => (c.length ? k : -1)).filter((k) => k >= 0);
  const lastChange = changingTurns[changingTurns.length - 1] ?? -1;

  const moment: Moment = past
    ? perTurn[v]?.length
      ? "changed"
      : pastPlan
        ? "plan"
        : "quiet"
    : plan
    ? "plan"
    : busy
      ? planMode
        ? "planning"
        : "working"
      : failed
        ? "problem"
        : sessionChanges.length
          ? "changed"
          : "quiet";
  const stage = past
    ? "Finished"
    : moment === "planning"
      ? "Making a plan"
      : moment === "plan"
        ? "The plan is ready"
        : status === "waiting"
          ? "Needs your OK"
          : busy
            ? "Working"
            : moment === "problem"
              ? "Stopped with a problem"
              : "Finished";

  // What changed: the last turn that changed files, or the whole session.
  const [scope, setScope] = useState<"last" | "session">("last");
  const storyTurns = past ? [all[v]] : scope === "session" || lastChange < 0 ? all : [all[lastChange]];
  const files = useMemo(
    () => storyFiles(past ? perTurn[v] || [] : scope === "session" || lastChange < 0 ? sessionChanges : perTurn[lastChange]),
    [past, v, scope, lastChange, sessionChanges, perTurn]
  );
  const filesKey = useMemo(() => JSON.stringify(files), [files]);
  const [story, setStory] = useState<ChangeStory | null>(null);
  const [storyWriting, setStoryWriting] = useState(false);
  const [step, setStep] = useState<number | null>(null);
  useEffect(() => {
    setStep(null);
    if (!files.length) {
      setStory(null);
      return;
    }
    // The grouping at once, from what's on the page; the written-up steps once Claude has finished.
    setStory({ jobId: "", steps: groupFiles(files, components), written: "files", createdAt: Date.now() });
    if (busy && !past) return;
    let cancelled = false;
    setStoryWriting(true);
    apiFetch("/api/chat/story", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, files, ...words(storyTurns) }),
    })
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled && j.story) setStory(j.story);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setStoryWriting(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filesKey, busy, past, projectId, components]);

  // A plan waiting for approval: its own lines at once, then the parts it touches.
  const planText = past ? (moment === "plan" ? pastPlan : null) : plan?.plan || null;
  const [planRead, setPlanRead] = useState<{ text: string; plan: Plan | null } | null>(null);
  useEffect(() => {
    if (!planText || planRead?.text === planText) return;
    let cancelled = false;
    const text = planText;
    setPlanRead({ text, plan: null });
    apiFetch("/api/chat/plan-parts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, plan: text }),
    })
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled) setPlanRead({ text, plan: j.plan || { steps: planLines(text), parts: [] } });
      })
      .catch(() => {
        if (!cancelled) setPlanRead({ text, plan: { steps: planLines(text), parts: [] } });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planText, projectId]);
  const shownPlan: Plan | null = planText
    ? planRead?.text === planText && planRead.plan
      ? planRead.plan
      : { steps: planLines(planText), parts: [] }
    : null;
  const planReading = !!planText && !(planRead?.text === planText && planRead.plan);

  // The turn the replay strip shows: the one the steps describe, or else the latest.
  const runTurn = past ? all[v] : moment === "changed" && scope === "last" && lastChange >= 0 ? all[lastChange] : last;
  // Claude Code's to-do list for that turn, live while it works.
  const claudeTodos = useMemo(() => todosFrom(chatTodoSteps(items as any, runTurn)), [items, runTurn]);
  // When Claude keeps no list: the request split into steps, ticked off from what it changes and says.
  // Only for the turn running now (and its final reading), not when looking back.
  const work = useMemo(() => {
    const changes: string[] = [];
    const said: string[] = [];
    for (const i of runTurn) {
      if (i.kind === "text") said.push(i.text);
      else if (i.kind === "tool" && ["Edit", "Write", "MultiEdit", "NotebookEdit"].includes(i.name)) {
        const x = i.input || {};
        // The lines the edit really adds, not the unchanged ones around them.
        const pairs: [string, string][] = Array.isArray(x.edits)
          ? x.edits.map((e: any) => [String(e?.old_string ?? ""), String(e?.new_string ?? "")])
          : [[String(x.old_string ?? ""), String(x.new_string ?? x.content ?? "")]];
        const fresh: string[] = [];
        for (const [o, n] of pairs) {
          const had = new Set(o.split("\n").map((l) => l.trim()));
          for (const l of n.split("\n")) if (l.trim() && !had.has(l.trim()) && fresh.length < 3) fresh.push(l.trim().slice(0, 120));
        }
        changes.push(`${shortPath(x.file_path || x.notebook_path || "", cwd)}: ${fresh.join(" ⏎ ")}`);
      }
    }
    return { changes, said };
  }, [runTurn, cwd]);
  const requestTodos = useRequestTodos({
    enabled: !claudeTodos.length && !past && runTurn === last && (busy || moment === "changed" || moment === "problem"),
    request: turnLabel(runTurn) === "(no message)" ? "" : digests[digests.length - 1]?.request || "",
    changes: work.changes,
    said: work.said,
    finished: !busy,
  });
  const todos = claudeTodos.length ? claudeTodos : requestTodos;
  const run = useMemo(() => {
    if (!runTurn.length) return null;
    const t = turnTimes(runTurn);
    return t.startedAt ? { events: chatEvents(runTurn), ...t } : null;
  }, [runTurn]);

  const changing = useMemo(
    () => (busy && !past ? partsForFiles(components, (perTurn[perTurn.length - 1] || []).map((f) => f.rel)) : new Set<string>()),
    [busy, past, components, perTurn]
  );

  const scopeSwitch =
    !past && changingTurns.length > 1 ? (
      <div className="inline-flex rounded-lg border border-border p-0.5 text-[12px] w-fit" role="tablist" aria-label="Which changes">
        {(["last", "session"] as const).map((s) => (
          <button
            key={s}
            role="tab"
            aria-selected={scope === s}
            onClick={() => setScope(s)}
            className={`px-2.5 py-1 rounded-md ${scope === s ? "bg-panel-2 text-text font-medium" : "text-muted hover:text-text"}`}
          >
            {s === "last" ? "The last change" : `The whole session (${changingTurns.length} changes)`}
          </button>
        ))}
      </div>
    ) : null;

  return (
    <>
    <ResizeHandle side="right" label="What's happening panel" width={size.width} onChange={size.set} onReset={size.reset} min={340} />
    <aside style={{ width: size.width }} className="shrink-0 border-l border-border min-h-0 overflow-y-auto bg-bg px-2 py-3 max-md:fixed max-md:inset-0 max-md:top-12 max-md:z-30 max-md:!w-full max-md:border-l-0">
      {all.length > 1 && (
        <div className="mb-3 rounded-lg border border-border bg-panel/50 p-2" role="group" aria-label="Turn history">
          <div className="flex items-center justify-between gap-2 px-0.5 mb-1.5 text-[11px]">
            <span className="font-semibold text-text/90">
              Turn history{" "}
              <a href={`/projects/${projectId}?tab=history`} className="font-normal text-accent hover:underline ml-1">
                Full page
              </a>
            </span>
            <span className="text-muted">
              {past ? `Looking at turn ${v + 1} of ${all.length}` : `Showing the latest of ${all.length} turns`}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[12px]">
            <button
              onClick={() => setViewTurn(Math.max(0, v - 1))}
              disabled={v === 0}
              aria-label="The turn before"
              title="The turn before"
              className="w-7 h-7 shrink-0 rounded-md border border-border text-muted hover:text-text disabled:opacity-30"
            >
              ‹
            </button>
            <select
              value={v}
              aria-label="Pick a turn to look at"
              onChange={(e) => {
                const n = Number(e.target.value);
                setViewTurn(n === all.length - 1 ? null : n);
              }}
              className="flex-1 min-w-0 bg-bg border border-border rounded-md px-2 py-1 text-[12px] focus:outline-none"
            >
              {all.map((t, k) => (
                <option key={k} value={k}>
                  {k === all.length - 1 ? "Now" : `${k + 1}.`} {summaries[digests[k]?.key] || turnLabel(t)}
                  {perTurn[k]?.length ? ` · ${perTurn[k].length} file${perTurn[k].length === 1 ? "" : "s"}` : ""}
                </option>
              ))}
            </select>
            <button
              onClick={() => setViewTurn(v + 1 >= all.length - 1 ? null : v + 1)}
              disabled={!past}
              aria-label="The turn after"
              title="The turn after"
              className="w-7 h-7 shrink-0 rounded-md border border-border text-muted hover:text-text disabled:opacity-30"
            >
              ›
            </button>
          </div>
          {past && (
            <div className="flex items-center justify-between gap-2 mt-1.5 px-0.5 text-[12px]">
              <span className="text-muted truncate" title={turnLabel(all[v])}>
                You asked: {turnLabel(all[v])}
              </span>
              <button onClick={() => setViewTurn(null)} className="shrink-0 px-2 py-0.5 rounded-md border border-accent/40 text-accent hover:bg-accent/10">
                Back to now
              </button>
            </div>
          )}
        </div>
      )}
      <ContextPanel
        key={past ? `turn-${v}` : "live"}
        who="Claude"
        flush
        projectId={projectId}
        assessment={assessment}
        previewEntry={previewEntry}
        moment={moment}
        run={run}
        stage={stage}
        plan={shownPlan}
        planReading={planReading}
        changing={changing}
        story={story}
        storyWriting={storyWriting}
        storyControls={scopeSwitch}
        todos={todos}
        todosFromRequest={!claudeTodos.length}
        todoRequest={turnLabel(runTurn)}
        step={step}
        onStep={setStep}
        reviewJobId={null}
        onPick={busy ? undefined : onPick}
        onClose={onClose}
      />
    </aside>
    </>
  );
}

export default memo(ChatPanel);
