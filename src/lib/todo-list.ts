// Client-safe (no Node imports). Claude Code's own to-do list for a turn, worked out from its steps,
// for the "What's happening" panel to show live: what's done, what it's doing now, what's left.
// Claude Code keeps the list with one of two tools:
//   TaskCreate {subject, activeForm}, answered "Task #6 created successfully: …", then
//   TaskUpdate {taskId, status: in_progress | completed | deleted, subject?}  (ids last a whole session)
//   TodoWrite {todos: [{content, activeForm, status}]}                       (the whole list each time)

export type TodoStatus = "pending" | "in_progress" | "completed";

export interface TodoItem {
  id: string;
  text: string;
  status: TodoStatus;
}

/** One step Claude took: its tool, the tool's input, and the answer it got (if known). */
export interface TodoStep {
  name: string;
  input: any;
  result?: string;
  /** The step is in the turn being shown (earlier steps only set up ids and state). */
  inTurn: boolean;
}

const TOOLS = new Set(["TodoWrite", "TaskCreate", "TaskUpdate"]);
export const isTodoTool = (name: string) => TOOLS.has(name);

const status = (s: unknown): TodoStatus => (s === "completed" ? "completed" : s === "in_progress" ? "in_progress" : "pending");

/**
 * The to-do list as it stands after these steps, keeping only the items the turn being shown
 * created or updated (a list from an earlier turn that this turn didn't touch isn't its list).
 */
export function todosFrom(steps: TodoStep[]): TodoItem[] {
  const items = new Map<string, TodoItem>();
  const touched = new Set<string>();
  let next = 1;
  for (const s of steps) {
    const i = s.input || {};
    if (s.name === "TodoWrite" && Array.isArray(i.todos)) {
      items.clear();
      touched.clear();
      i.todos.forEach((t: any, k: number) => {
        const id = `w${k}`;
        items.set(id, { id, text: String(t?.content || "").trim(), status: status(t?.status) });
        if (s.inTurn) touched.add(id);
      });
    } else if (s.name === "TaskCreate") {
      const m = String(s.result || "").match(/#(\d+)/);
      const id = m ? m[1] : String(next);
      next = Math.max(next, Number(id) + 1);
      items.set(id, { id, text: String(i.subject || i.description || "").trim(), status: "pending" });
      if (s.inTurn) touched.add(id);
    } else if (s.name === "TaskUpdate") {
      const id = String(i.taskId ?? "");
      const it = items.get(id);
      if (!it) continue;
      if (i.status === "deleted") {
        items.delete(id);
        touched.delete(id);
        continue;
      }
      if (i.status) it.status = status(i.status);
      if (typeof i.subject === "string" && i.subject.trim()) it.text = i.subject.trim();
      if (s.inTurn) touched.add(id);
    }
  }
  return [...items.values()].filter((t) => touched.has(t.id) && t.text);
}

/**
 * A Code-page conversation's to-do steps, as far as the end of the turn shown. `turn` holds that
 * turn's items; earlier items only set up the list's ids and state.
 */
export function chatTodoSteps(
  items: { kind: string; id: string; name?: string; input?: any; toolUseId?: string; text?: string }[],
  turn: { id: string }[]
): TodoStep[] {
  const inTurn = new Set(turn.map((i) => i.id));
  const lastId = turn[turn.length - 1]?.id;
  const end = lastId ? items.findIndex((i) => i.id === lastId) : items.length - 1;
  const results = new Map<string, string>();
  for (const i of items) if (i.kind === "tool_result" && i.toolUseId) results.set(i.toolUseId, i.text || "");
  const out: TodoStep[] = [];
  items.slice(0, end + 1).forEach((i) => {
    if (i.kind === "tool" && i.name && isTodoTool(i.name))
      out.push({ name: i.name, input: i.input, result: i.toolUseId ? results.get(i.toolUseId) : undefined, inTurn: inTurn.has(i.id) });
  });
  return out;
}

/**
 * A Simple-mode task's to-do steps, from its runs' events (oldest run first; the last one is the
 * turn shown). A step's answer is the next tool answer after it.
 */
export function jobTodoSteps(runs: { type: string; payload: any }[][]): TodoStep[] {
  const out: TodoStep[] = [];
  runs.forEach((events, r) => {
    // Steps waiting for their answers, in order (several can be asked at once, answered after).
    const waiting: (TodoStep | null)[] = [];
    for (const e of events) {
      if (e.type === "tool") {
        const n = String(e.payload?.name || "");
        if (!isTodoTool(n)) {
          waiting.push(null);
          continue;
        }
        const d = e.payload?.detail || {};
        const input = n === "TodoWrite" ? { todos: (d.todos || []).map((t: any) => ({ content: t.content, status: t.status })) } : { ...d };
        const step: TodoStep = { name: n, input, inTurn: r === runs.length - 1 };
        out.push(step);
        waiting.push(step);
      } else if (e.type === "tool_result") {
        const step = waiting.shift();
        if (step) step.result = String(e.payload?.text || "");
      }
    }
  });
  return out;
}

/** How far along the list is. */
export function todoProgress(todos: TodoItem[]): { done: number; total: number; current: TodoItem | null } {
  return {
    done: todos.filter((t) => t.status === "completed").length,
    total: todos.length,
    current: todos.find((t) => t.status === "in_progress") || null,
  };
}
