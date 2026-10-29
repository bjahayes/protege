// Client-safe (no Node imports). One turn of a Claude Code conversation in brief: what the person
// asked, what Claude said at the end, which files it changed, and when. The side panel's turn picker
// and the project's History tab both describe turns this way, and the short summary of what each
// turn did (lib/turn-summaries.ts) is written from it and kept by its `key`.
import type { ChatItem } from "./chat-format";
import { collectChanges } from "./chat-changes";

export interface TurnDigest {
  key: string;
  request: string;
  report: string;
  files: { path: string; added: number; removed: number; created: boolean }[];
  /** How many steps (tool calls) Claude took. */
  steps: number;
  startedAt: number;
  endedAt: number;
  /** The short summary of what the turn did, once written. */
  summary?: string;
}

/** A short, stable fingerprint (FNV-1a) of a string. */
export function fingerprint(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** A file inside the conversation's folder (its path was shortened to one relative to it). */
export const inFolder = (rel: string) => !/^([a-zA-Z]:)?\//.test(rel);

export function digestTurn(items: ChatItem[], cwd?: string): TurnDigest {
  type Res = Extract<ChatItem, { kind: "tool_result" }>;
  const results = new Map<string, Res>();
  for (const i of items) if (i.kind === "tool_result") results.set(i.toolUseId, i);
  const files = collectChanges(items, results, cwd)
    .filter((f) => inFolder(f.rel))
    .map((f) => ({ path: f.rel, added: f.added, removed: f.removed, created: f.created }));
  const asks = items.filter((i) => i.kind === "user" || i.kind === "command").map((i) => (i as { text: string }).text.trim());
  const request = asks.filter(Boolean).join("\nThen: ").slice(0, 2000);
  const reply = [...items].reverse().find((i) => i.kind === "text");
  const report = reply && reply.kind === "text" ? reply.text.slice(0, 3000) : "";
  const times = items.map((i) => i.ts || 0).filter(Boolean);
  return {
    key: fingerprint(JSON.stringify([request, report.slice(0, 600), files.map((f) => f.path)])),
    request,
    report,
    files,
    steps: items.filter((i) => i.kind === "tool").length,
    startedAt: times.length ? Math.min(...times) : 0,
    endedAt: times.length ? Math.max(...times) : 0,
  };
}
