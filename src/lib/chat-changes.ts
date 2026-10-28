// Client-safe. The files a conversation changed, worked out from Claude's own edits (Write,
// Edit, MultiEdit, NotebookEdit) that succeeded, for the "files changed" card after each turn
// and the changes panel beside the chat, as in Claude desktop.

import type { ChatItem } from "./chat-format";
import { shortPath } from "./chat-format";

export type DiffLine = { op: " " | "+" | "-"; text: string };

/** Line-by-line diff (longest common subsequence), so unchanged lines show as context. */
export function lineDiff(oldText: string, newText: string): DiffLine[] {
  const a = oldText === "" ? [] : String(oldText).split("\n");
  const b = newText === "" ? [] : String(newText).split("\n");
  // Too big to compare cheaply: show it as replaced.
  if (a.length * b.length > 2_000_000) return [...a.map((t) => ({ op: "-" as const, text: t })), ...b.map((t) => ({ op: "+" as const, text: t }))];
  const n = a.length;
  const m = b.length;
  const L: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ op: " ", text: a[i] });
      i++;
      j++;
    } else if (L[i + 1][j] >= L[i][j + 1]) out.push({ op: "-", text: a[i++] });
    else out.push({ op: "+", text: b[j++] });
  }
  while (i < n) out.push({ op: "-", text: a[i++] });
  while (j < m) out.push({ op: "+", text: b[j++] });
  return out;
}

export function diffCounts(d: DiffLine[]): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const l of d) {
    if (l.op === "+") added++;
    else if (l.op === "-") removed++;
  }
  return { added, removed };
}

export interface Hunk {
  toolUseId: string;
  lines: DiffLine[];
}

export interface FileChange {
  path: string;
  rel: string;
  added: number;
  removed: number;
  /** Claude created the file (rather than changing one that was there). */
  created: boolean;
  hunks: Hunk[];
}

type ToolItem = Extract<ChatItem, { kind: "tool" }>;
type ResultItem = Extract<ChatItem, { kind: "tool_result" }>;

const EDIT_TOOLS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);

/** One edit's diff lines, or null if the tool call wasn't a file change. */
function hunkLines(t: ToolItem): DiffLine[] | null {
  const i = t.input || {};
  switch (t.name) {
    case "Write":
      return lineDiff("", String(i.content ?? ""));
    case "Edit":
      return lineDiff(String(i.old_string ?? ""), String(i.new_string ?? ""));
    case "MultiEdit":
      return (i.edits || []).flatMap((e: any, k: number) => [
        ...(k ? [{ op: " " as const, text: "⋯" }] : []),
        ...lineDiff(String(e.old_string ?? ""), String(e.new_string ?? "")),
      ]);
    case "NotebookEdit":
      return lineDiff("", String(i.new_source ?? ""));
    default:
      return null;
  }
}

/** The files changed by the tool calls in `items` that succeeded, in the order first changed. */
export function collectChanges(items: ChatItem[], results: Map<string, ResultItem>, root?: string): FileChange[] {
  const files = new Map<string, FileChange>();
  for (const it of items) {
    if (it.kind !== "tool" || !EDIT_TOOLS.has(it.name)) continue;
    const r = results.get(it.toolUseId);
    if (!r || r.isError) continue;
    const p = String(it.input?.file_path || it.input?.notebook_path || "");
    if (!p) continue;
    const lines = hunkLines(it);
    if (!lines) continue;
    const key = p.replace(/\\/g, "/").toLowerCase();
    let f = files.get(key);
    if (!f) {
      f = { path: p, rel: shortPath(p, root), added: 0, removed: 0, created: it.name === "Write" && /creat/i.test(r.text), hunks: [] };
      files.set(key, f);
    }
    const c = diffCounts(lines);
    f.added += c.added;
    f.removed += c.removed;
    f.hunks.push({ toolUseId: it.toolUseId, lines });
  }
  return [...files.values()];
}

export function totals(files: FileChange[]): { added: number; removed: number } {
  return files.reduce((t, f) => ({ added: t.added + f.added, removed: t.removed + f.removed }), { added: 0, removed: 0 });
}
