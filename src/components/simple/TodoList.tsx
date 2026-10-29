"use client";

// Claude Code's to-do list for a turn, live: what's done (ticked), what it's doing now (highlighted),
// and what's left. Shown in plain words once they've been written (lib/todo-plain.ts); Claude's own
// words until then, and on hover.

import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { todoProgress, type TodoItem } from "@/lib/todo-list";

/**
 * The to-do list Protégé makes from the request when Claude doesn't keep one (lib/request-steps.ts),
 * brought up to date as Claude changes things and says what it's doing, at most every 10 seconds.
 */
export function useRequestTodos({
  enabled,
  request,
  changes,
  said,
  finished,
}: {
  enabled: boolean;
  request: string;
  changes: string[];
  said: string[];
  finished: boolean;
}): TodoItem[] {
  const [steps, setSteps] = useState<TodoItem[]>([]);
  // The latest inputs, read when a check goes out; a check is never cancelled by new work arriving
  // (busy work would cancel every one), and only an answer older than one already shown is dropped.
  const latest = useRef({ request, changes, said, finished });
  latest.current = { request, changes, said, finished };
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSent = useRef(0);
  const sent = useRef(0);
  const shown = useRef(0);
  const key = JSON.stringify([request, changes.length, changes[changes.length - 1], said.length, finished]);
  useEffect(() => {
    // The run has ended: the final reading goes now rather than waiting out the 10 seconds.
    if (finished && timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (!enabled || !request.trim() || timer.current) return;
    const go = () => {
      timer.current = null;
      lastSent.current = Date.now();
      const n = ++sent.current;
      apiFetch("/api/request-steps", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(latest.current) })
        .then((r) => r.json())
        .then((j) => {
          if (n < shown.current || !Array.isArray(j.steps)) return;
          shown.current = n;
          setSteps(j.steps.map((s: { text: string; status: TodoItem["status"] }, i: number) => ({ id: `r${i}`, text: s.text, status: s.status })));
        })
        .catch(() => {});
    };
    // At most one check every 10 seconds while it works; the final one straight away.
    const wait = finished ? 0 : Math.max(0, 10_000 - (Date.now() - lastSent.current));
    timer.current = setTimeout(go, wait);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, key]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );
  return enabled ? steps : [];
}

export default function TodoList({
  todos,
  request,
  live,
  fromRequest,
}: {
  todos: TodoItem[];
  request?: string;
  live: boolean;
  /** Protégé made this list from the request (Claude didn't keep one): its items are already plain. */
  fromRequest?: boolean;
}) {
  const [plain, setPlain] = useState<Record<string, string>>({});
  const key = useMemo(() => todos.map((t) => t.text).join("\n"), [todos]);
  useEffect(() => {
    const todo = todos.map((t) => t.text).filter((t) => !plain[t]);
    if (!todo.length || fromRequest) return;
    let cancelled = false;
    apiFetch("/api/todo-plain", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: todo, request }) })
      .then((r) => r.json())
      .then((j) => !cancelled && j.plain && setPlain((m) => ({ ...m, ...j.plain })))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const { done, total } = todoProgress(todos);
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-[12px] mb-1.5">
        <span className="font-medium text-text/90">
          {fromRequest ? "Your request, step by step" : live ? "Its to-do list" : "The to-do list it worked through"}
        </span>
        <span className="text-muted tabular-nums">
          {done} of {total} done
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-panel-2 overflow-hidden mb-2.5" aria-hidden="true">
        <div className="h-full rounded-full bg-good/80 transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
      <ol className="flex flex-col gap-1" aria-label={`To-do list: ${done} of ${total} done`}>
        {todos.map((t) => {
          const words = plain[t.text] || t.text;
          const now = t.status === "in_progress";
          const fin = t.status === "completed";
          return (
            <li
              key={t.id}
              title={plain[t.text] && plain[t.text] !== t.text ? `In Claude's words: ${t.text}` : undefined}
              className={`flex items-start gap-2.5 rounded-lg px-2 py-1.5 text-[13px] leading-snug ${now ? "bg-accent/10 border border-accent/30" : "border border-transparent"}`}
            >
              <span
                aria-label={fin ? "Done" : now ? "Doing now" : "To do"}
                className={`shrink-0 mt-px w-4 h-4 rounded-full flex items-center justify-center text-[11px] ${
                  fin ? "bg-good/20 text-good" : now ? `border-2 border-accent ${live ? "live-dot" : ""}` : "border border-border"
                }`}
              >
                {fin ? "✓" : ""}
              </span>
              <span className={fin ? "text-muted" : now ? "text-text font-medium" : "text-text/85"}>
                {words}
                {now && live && <span className="block text-[11px] text-accent font-normal mt-0.5">Doing this now</span>}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
