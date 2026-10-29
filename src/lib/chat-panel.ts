// Client-safe (no Node imports). What the context panel needs from a Code (Chat page)
// conversation: its turns, the run of a turn as replay-strip events, the edits Claude made as
// files with patches (a chat has no safe copy, so its edits are the record of what changed),
// and a plan waiting for approval in Plan mode.
import type { ChatItem } from "./chat-format";
import type { JobEvent } from "./types";
import type { FileChange } from "./chat-changes";
import type { StoryFile } from "./story-steps";

/**
 * Where each turn starts: at a message the person sent once Claude had finished the turn before.
 * A message sent while Claude is still working joins the turn in progress (Claude reads it as it
 * goes), so the work, and the parts it is changing, carry on from before the message.
 */
export function turnStarts(items: ChatItem[]): number[] {
  const out: number[] = [];
  let ended = true;
  let prev: ChatItem | null = null;
  items.forEach((i, k) => {
    if (i.kind === "user" || i.kind === "command") {
      // A message sent while Claude was working (marked when it was sent here) joins that turn.
      // Saved transcripts don't keep the "turn finished" marker, so there a message that follows
      // Claude's reply (rather than one of its steps) starts a new turn.
      const midTurn = i.kind === "user" && !!i.midTurn;
      if (!midTurn && (ended || prev?.kind === "text")) {
        out.push(k);
        ended = false;
      }
    } else if (i.kind === "result") ended = true;
    if (i.kind !== "permission_done") prev = i;
  });
  return out.length ? out : items.length ? [0] : [];
}

/** The items of the last turn (from the person's last message on). */
export function lastTurn(items: ChatItem[]): ChatItem[] {
  const s = turnStarts(items);
  return s.length ? items.slice(s[s.length - 1]) : [];
}

/** The turns, each as its slice of items, oldest first. */
export function turns(items: ChatItem[]): ChatItem[][] {
  const s = turnStarts(items);
  return s.map((a, k) => items.slice(a, k + 1 < s.length ? s[k + 1] : items.length));
}

/**
 * A turn's work as replay-strip events. Items without a time (from before times were kept)
 * take the time of the item before them.
 */
export function chatEvents(items: ChatItem[]): JobEvent[] {
  const out: JobEvent[] = [];
  let ts = items.find((i) => i.ts)?.ts || 0;
  items.forEach((i, seq) => {
    if (i.ts) ts = i.ts;
    const push = (type: string, payload: any) => out.push({ seq, ts, type, payload });
    switch (i.kind) {
      case "tool": {
        const x = i.input || {};
        push("tool", {
          name: i.name,
          detail: {
            file: x.file_path || x.notebook_path || x.path,
            command: x.command,
            description: x.description,
            pattern: x.pattern,
            query: x.query,
          },
        });
        break;
      }
      case "thinking":
        push("thinking", {});
        break;
      case "tool_result":
        if (i.isError) push("tool_result", { isError: true });
        break;
      case "error":
        push("error", { message: i.text });
        break;
      case "result":
        if (i.isError && !i.stopped) push("result", { isError: true });
        else push("status", {});
        break;
    }
  });
  return out;
}

/** When a turn started and (if it has) finished. */
export function turnTimes(items: ChatItem[]): { startedAt: number; endedAt?: number } {
  const first = items.find((i) => i.ts)?.ts || 0;
  const done = [...items].reverse().find((i) => i.kind === "result");
  return { startedAt: first, endedAt: done?.ts };
}

/** Claude's edits as files with patches, in the form the story of what changed reads. */
export function storyFiles(changes: FileChange[]): StoryFile[] {
  return changes.map((f) => {
    const body: string[] = [];
    for (const h of f.hunks) {
      body.push("@@");
      for (const l of h.lines) body.push(l.op + l.text);
    }
    return {
      path: f.rel,
      status: f.created ? "A" : "M",
      additions: f.added,
      deletions: f.removed,
      patch: [`--- a/${f.rel}`, `+++ b/${f.rel}`, ...body].join("\n"),
    };
  });
}

/** A plan waiting for the person's approval in Plan mode: its text, and the request to answer. */
export function pendingPlan(items: ChatItem[]): { requestId: string; plan: string } | null {
  const decided = new Set(items.filter((i) => i.kind === "permission_done").map((i) => (i as { requestId: string }).requestId));
  for (let k = items.length - 1; k >= 0; k--) {
    const i = items[k];
    if (i.kind === "permission" && i.toolName === "ExitPlanMode" && !decided.has(i.requestId)) {
      return { requestId: i.requestId, plan: String(i.input?.plan || "") };
    }
  }
  return null;
}

/** The last plan Claude put forward in Plan mode during some items (approved or not), if any. */
export function turnPlan(items: ChatItem[]): string | null {
  for (let k = items.length - 1; k >= 0; k--) {
    const i = items[k];
    if (i.kind === "permission" && i.toolName === "ExitPlanMode") return String(i.input?.plan || "") || null;
  }
  return null;
}

/** A turn's label in the turn picker: what the person asked, in a line. */
export function turnLabel(items: ChatItem[]): string {
  const u = items.find((i) => i.kind === "user" || i.kind === "command");
  const t = u && (u.kind === "user" || u.kind === "command") ? u.text : "";
  const line = t.replace(/\s+/g, " ").trim();
  return line.length > 60 ? line.slice(0, 60) + "…" : line || "(no message)";
}

/** The plan's own numbered or bulleted lines, shown at once while the parts are worked out. */
export function planLines(plan: string): string[] {
  return String(plan || "")
    .split("\n")
    .map((l) => l.match(/^\s{0,3}(?:\d+[.)]|[-*•])\s+(.+)$/)?.[1]?.replace(/\*\*/g, "").trim() || "")
    .filter((l) => l.length > 2)
    .slice(0, 12);
}
