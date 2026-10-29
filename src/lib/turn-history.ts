// Server-only. Every turn of every saved Claude Code conversation in a project's folder (from the
// Code page, Claude desktop, a terminal or an IDE), newest first, for the project's History tab.
// Each session's turns are worked out once per version of its saved file (kept in memory).
import { sessionsForCwd, sessionTranscript } from "./discovery";
import { itemsFromMessage, type ChatItem } from "./chat-format";
import { turns } from "./chat-panel";
import { digestTurn, type TurnDigest } from "./turn-digest";
import { isProtegePrompt } from "./agents";
import { knownSummaries } from "./turn-summaries";

export interface HistoryTurn extends TurnDigest {
  sessionId: string;
  sessionTitle: string;
  /** Which turn of its session (from 0), and how many the session has. */
  index: number;
  of: number;
}

const g = globalThis as unknown as { __protegeTurnCache?: Map<string, { stamp: string; items: ChatItem[][] }> };
const cache = (g.__protegeTurnCache ||= new Map());

/** A session's turns, as chat items. */
export async function sessionTurns(sessionId: string, cwd: string, stamp = ""): Promise<ChatItem[][]> {
  const hit = cache.get(sessionId);
  if (hit && stamp && hit.stamp === stamp) return hit.items;
  const raw = (await sessionTranscript(sessionId, cwd)) as any[];
  const items = raw.flatMap((m) => itemsFromMessage(m));
  const t = turns(items).filter((x) => x.some((i) => i.kind !== "user" && i.kind !== "command"));
  cache.set(sessionId, { stamp, items: t });
  return t;
}

export async function projectTurns(dir: string): Promise<HistoryTurn[]> {
  const sessions = await sessionsForCwd(dir);
  const out: HistoryTurn[] = [];
  // Several sessions at a time; a long session's file takes a moment to read.
  const work = sessions.map((s) => async () => {
    // A session Protégé started for its own work (mapping the project, a summary) isn't the person's.
    if (isProtegePrompt(s.firstPrompt)) return;
    const ts = await sessionTurns(s.sessionId, dir, `${s.lastModified}:${s.fileSize}`);
    ts.forEach((items, index) => {
      const d = digestTurn(items, dir);
      out.push({ ...d, sessionId: s.sessionId, sessionTitle: s.summary, index, of: ts.length, endedAt: d.endedAt || s.lastModified, startedAt: d.startedAt || s.lastModified });
    });
  });
  for (let i = 0; i < work.length; i += 4) await Promise.all(work.slice(i, i + 4).map((f) => f()));
  // A conversation carried on as a copy (in Protégé, or forked) repeats the turns before the copy:
  // each turn shows once, from the copy that was used last.
  const used = new Map(sessions.map((s) => [s.sessionId, s.lastModified || 0]));
  const best = new Map<string, HistoryTurn>();
  for (const t of out) {
    const k = `${t.key}:${t.startedAt}`;
    const had = best.get(k);
    if (!had || (used.get(t.sessionId) || 0) > (used.get(had.sessionId) || 0)) best.set(k, t);
  }
  out.length = 0;
  out.push(...best.values());
  out.sort((a, b) => b.startedAt - a.startedAt);
  const sums = knownSummaries(out.map((t) => t.key));
  return out.map((t) => (sums[t.key] ? { ...t, summary: sums[t.key] } : t));
}
