// Live conversations for the Chat page: one long-lived Claude Code process per conversation,
// fed the person's messages as they type them, with tool calls held for approval when the
// permission mode asks for it. Singleton on globalThis so it survives Next.js hot reloads.
//
// The saved session transcript (~/.claude/projects/…) is the record of a conversation; this
// manager only holds what has happened since its process started, for live viewers.

import { randomUUID } from "crypto";
import path from "path";
import type { ModelInfo, PermissionMode, PermissionResult, PermissionUpdate, Query, SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import { liveQuery, initProblem, SIGNED_OUT_RE, NOT_SIGNED_IN } from "./engine";
import { projectIdFromPath } from "./config";
import { capInput, itemsFromMessage, type ChatItem } from "./chat-format";

export type ChatStatus = "starting" | "working" | "waiting" | "idle" | "ended";

export type ChatEvent =
  | { seq: number; type: "items"; items: ChatItem[] }
  | { seq: number; type: "delta"; text: string }
  | { seq: number; type: "state"; state: ChatState };

export interface ChatState {
  sessionId: string;
  projectId: string;
  projectPath: string;
  projectName: string;
  status: ChatStatus;
  /** The model the person picked (an alias like "sonnet"; unset = Claude Code's default). */
  model?: string;
  /** The model Claude Code says it is running, e.g. "claude-opus-5[1m]". */
  activeModel?: string;
  permissionMode: PermissionMode;
  effort?: string;
  costUsd?: number;
  error?: string;
  startedAt: number;
  lastActivity: number;
}

/** Async queue the SDK reads the person's messages from; stays open until the chat closes. */
class Inbox implements AsyncIterable<SDKUserMessage> {
  private q: SDKUserMessage[] = [];
  private waiter: ((m: SDKUserMessage | null) => void) | null = null;
  private closed = false;
  push(m: SDKUserMessage) {
    if (this.closed) return;
    if (this.waiter) {
      const w = this.waiter;
      this.waiter = null;
      w(m);
    } else this.q.push(m);
  }
  close() {
    this.closed = true;
    this.waiter?.(null);
    this.waiter = null;
  }
  async *[Symbol.asyncIterator]() {
    while (true) {
      if (this.q.length) {
        yield this.q.shift()!;
        continue;
      }
      if (this.closed) return;
      const m = await new Promise<SDKUserMessage | null>((r) => (this.waiter = r));
      if (!m) return;
      yield m;
    }
  }
}

interface Pending {
  toolName: string;
  input: Record<string, unknown>;
  suggestions?: PermissionUpdate[];
  resolve: (r: PermissionResult) => void;
}

interface LiveChat extends ChatState {
  q: Query;
  inbox: Inbox;
  abort: AbortController;
  events: ChatEvent[];
  seq: number;
  partial: string;
  /** Set by Stop; the turn's result is then shown as stopped, not as an error. */
  stopping?: boolean;
  pending: Map<string, Pending>;
  subscribers: Set<(e: ChatEvent) => void>;
}

const MAX_EVENTS = 4000;
const IDLE_CLOSE_MS = 30 * 60_000;

export interface StartOptions {
  projectPath: string;
  projectName?: string;
  /** Continue this saved session. Omit for a brand-new conversation. */
  resume?: string;
  model?: string;
  permissionMode?: PermissionMode;
  effort?: string;
}

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

class ChatManager {
  private chats = new Map<string, LiveChat>();
  /** When Protégé last did something in each conversation, kept after its process ends. */
  private here = new Map<string, number>();

  /** When Protégé last worked in this conversation (0 if never since the server started). */
  lastHere(sessionId: string): number {
    const c = this.chats?.get(sessionId);
    return Math.max(c?.lastActivity || 0, this.here?.get(sessionId) || 0);
  }

  constructor() {
    const t = setInterval(() => this.reap(), 60_000);
    (t as any).unref?.();
  }

  get(sessionId: string): LiveChat | undefined {
    return this.chats.get(sessionId);
  }

  state(c: LiveChat): ChatState {
    const { q, inbox, abort, events, seq, partial, pending, subscribers, ...s } = c;
    return s;
  }

  list(): ChatState[] {
    return [...this.chats.values()].filter((c) => c.status !== "ended").map((c) => this.state(c));
  }

  events(sessionId: string): { events: ChatEvent[]; partial: string } {
    const c = this.chats.get(sessionId);
    return c ? { events: c.events, partial: c.partial } : { events: [], partial: "" };
  }

  subscribe(sessionId: string, cb: (e: ChatEvent) => void): () => void {
    const c = this.chats.get(sessionId);
    if (!c) return () => {};
    c.subscribers.add(cb);
    return () => c.subscribers.delete(cb);
  }

  /** Start (or resume) a conversation's process. Returns the session id it runs under. */
  start(o: StartOptions): string {
    if (o.resume) {
      const live = this.chats.get(o.resume);
      if (live && live.status !== "ended") return o.resume;
    }
    const sessionId = o.resume || randomUUID();
    const inbox = new Inbox();
    const abort = new AbortController();
    const permissionMode: PermissionMode = o.permissionMode || "default";
    const chat = {
      sessionId,
      projectId: projectIdFromPath(o.projectPath),
      projectPath: o.projectPath,
      projectName: o.projectName || path.basename(o.projectPath),
      status: "starting",
      model: o.model,
      permissionMode,
      effort: o.effort,
      startedAt: Date.now(),
      lastActivity: Date.now(),
      inbox,
      abort,
      events: [],
      seq: 0,
      partial: "",
      pending: new Map(),
      subscribers: new Set(),
    } as unknown as LiveChat;

    chat.q = liveQuery(inbox, {
      cwd: o.projectPath,
      ...(o.resume ? { resume: o.resume } : { sessionId }),
      model: o.model,
      permissionMode,
      ...(o.effort ? { effort: o.effort as Effort } : {}),
      includePartialMessages: true,
      settingSources: ["user", "project", "local"],
      systemPrompt: { type: "preset", preset: "claude_code" },
      abortController: abort,
      // Lets the person switch to "Bypass permissions" mid-chat; it is never the default.
      allowDangerouslySkipPermissions: true,
      // Claude asks its questions in plain text here; the multiple-choice question tool
      // needs a desktop-only dialog.
      disallowedTools: ["AskUserQuestion"],
      canUseTool: (toolName, input, opts) => this.ask(chat, toolName, input, opts),
    });
    this.chats.set(sessionId, chat);
    this.pump(chat);
    return sessionId;
  }

  /** Send a message; `blocks` are attachments (images, PDFs) that go before the text. */
  send(sessionId: string, text: string, blocks: any[] = []): boolean {
    const c = this.chats.get(sessionId);
    if (!c || c.status === "ended") return false;
    const uuid = randomUUID();
    const content = blocks.length ? [...blocks, ...(text ? [{ type: "text", text }] : [])] : text;
    const msg = { type: "user", uuid, session_id: sessionId, parent_tool_use_id: null, message: { role: "user", content } };
    c.inbox.push(msg as SDKUserMessage);
    // Shown the same way the saved transcript will show it.
    this.emitItems(c, itemsFromMessage(msg));
    this.setStatus(c, "working");
    return true;
  }

  async setEffort(sessionId: string, effort: string | undefined): Promise<boolean> {
    const c = this.chats.get(sessionId);
    if (!c || c.status === "ended") return false;
    await c.q.applyFlagSettings({ effortLevel: (effort as Effort) || null } as any).catch(() => {});
    c.effort = effort;
    this.emitState(c);
    return true;
  }

  /** Any running conversation, to ask Claude Code things like its model list. */
  anyLive(): Query | null {
    for (const c of this.chats.values()) if (c.status !== "ended") return c.q;
    return null;
  }

  respond(sessionId: string, requestId: string, decision: "allow" | "always" | "deny"): boolean {
    const c = this.chats.get(sessionId);
    const p = c?.pending.get(requestId);
    if (!c || !p) return false;
    c.pending.delete(requestId);
    if (decision === "deny") {
      p.resolve({ behavior: "deny", message: "The person declined this in Protégé." });
    } else {
      p.resolve({
        behavior: "allow",
        updatedInput: p.input,
        ...(decision === "always" && p.suggestions?.length ? { updatedPermissions: p.suggestions } : {}),
      });
      // Approving a plan leaves plan mode, as in Claude desktop.
      if (p.toolName === "ExitPlanMode" && c.permissionMode === "plan") {
        c.permissionMode = "acceptEdits";
        c.q.setPermissionMode("acceptEdits").catch(() => {});
      }
    }
    this.emitItems(c, [{ id: `perm-done:${requestId}`, kind: "permission_done", requestId, decision }]);
    this.setStatus(c, c.pending.size ? "waiting" : "working");
    return true;
  }

  async interrupt(sessionId: string): Promise<boolean> {
    const c = this.chats.get(sessionId);
    if (!c || c.status === "ended") return false;
    for (const [id] of c.pending) this.respond(sessionId, id, "deny");
    c.stopping = true;
    try {
      await c.q.interrupt();
    } catch {
      /* ignore */
    }
    this.setStatus(c, "idle");
    return true;
  }

  async setMode(sessionId: string, mode: PermissionMode): Promise<boolean> {
    const c = this.chats.get(sessionId);
    if (!c || c.status === "ended") return false;
    await c.q.setPermissionMode(mode).catch(() => {});
    c.permissionMode = mode;
    this.emitState(c);
    return true;
  }

  async setModel(sessionId: string, model: string | undefined): Promise<boolean> {
    const c = this.chats.get(sessionId);
    if (!c || c.status === "ended") return false;
    await c.q.setModel(model).catch(() => {});
    c.model = model;
    c.activeModel = undefined;
    this.emitState(c);
    return true;
  }

  close(sessionId: string) {
    const c = this.chats.get(sessionId);
    if (!c) return;
    for (const [id] of c.pending) this.respond(sessionId, id, "deny");
    c.inbox.close();
    try {
      c.q.close();
    } catch {
      /* ignore */
    }
    this.setStatus(c, "ended");
    this.chats.delete(sessionId);
  }

  // ---------------------------------------------------------------------

  private ask(c: LiveChat, toolName: string, input: Record<string, unknown>, opts: any): Promise<PermissionResult> {
    const requestId = randomUUID();
    this.emitItems(c, [
      {
        id: `perm:${requestId}`,
        kind: "permission",
        requestId,
        toolName,
        input: capInput(input),
        title: opts?.title,
        description: opts?.description,
        decisionReason: opts?.decisionReason,
        canAlways: !!opts?.suggestions?.length,
      },
    ]);
    this.setStatus(c, "waiting");
    return new Promise<PermissionResult>((resolve) => {
      c.pending.set(requestId, { toolName, input, suggestions: opts?.suggestions, resolve });
      opts?.signal?.addEventListener?.("abort", () => {
        if (c.pending.delete(requestId)) {
          resolve({ behavior: "deny", message: "Cancelled." });
          this.emitItems(c, [{ id: `perm-done:${requestId}`, kind: "permission_done", requestId, decision: "deny" }]);
        }
      });
    });
  }

  private async pump(c: LiveChat) {
    try {
      for await (const m of c.q as AsyncIterable<any>) {
        c.lastActivity = Date.now();
        const problem = initProblem(m);
        if (problem) {
          this.emitItems(c, [{ id: `err:${randomUUID()}`, kind: "error", text: problem }]);
          this.close(c.sessionId);
          return;
        }
        this.handle(c, m);
      }
    } catch (e: any) {
      if (!c.abort.signal.aborted) {
        const msg = String(e?.message || e);
        c.error = SIGNED_OUT_RE.test(msg) ? NOT_SIGNED_IN : msg;
        this.emitItems(c, [{ id: `err:${randomUUID()}`, kind: "error", text: c.error }]);
      }
    }
    if (c.status !== "ended") {
      c.inbox.close();
      this.setStatus(c, "ended");
      this.chats.delete(c.sessionId);
    }
  }

  private handle(c: LiveChat, m: any) {
    switch (m.type) {
      case "system":
        if (m.subtype === "init") {
          c.activeModel = m.model || c.activeModel;
          if (m.permissionMode) c.permissionMode = m.permissionMode;
          this.emitState(c);
        }
        return;
      case "stream_event": {
        if (m.parent_tool_use_id) return;
        const e = m.event;
        if (e?.type === "message_start") c.partial = "";
        else if (e?.type === "content_block_delta" && e.delta?.type === "text_delta") {
          c.partial += e.delta.text || "";
          this.emit(c, { type: "delta", text: e.delta.text || "" }, false);
        }
        return;
      }
      case "assistant":
        c.partial = "";
        this.emitItems(c, itemsFromMessage(m));
        return;
      case "user": {
        // Our own messages were already shown when sent; Claude Code may echo them back.
        const items = itemsFromMessage(m).filter((i) => i.kind !== "user");
        if (items.length) this.emitItems(c, items);
        return;
      }
      case "result": {
        c.partial = "";
        if (typeof m.total_cost_usd === "number") c.costUsd = m.total_cost_usd;
        const stopped = !!c.stopping;
        c.stopping = false;
        const items = itemsFromMessage(m).map((i) =>
          i.kind !== "result"
            ? i
            : stopped
              ? { ...i, isError: false, stopped: true, text: undefined }
              : i.isError && SIGNED_OUT_RE.test(String(m.result || ""))
                ? { ...i, text: NOT_SIGNED_IN }
                : i
        );
        this.emitItems(c, items);
        this.setStatus(c, c.pending.size ? "waiting" : "idle");
        // Too old a Claude Code for this model: end this process so the next message starts on
        // the newest copy (after an update, or Claude desktop's own).
        if (m.is_error && /does not support this model|newer is required/i.test(String(m.result || ""))) {
          setTimeout(() => this.close(c.sessionId), 0);
        }
        return;
      }
    }
  }

  private emit(c: LiveChat, e: ChatEvent extends infer T ? (T extends ChatEvent ? Omit<T, "seq"> : never) : never, keep = true) {
    const ev = { ...e, seq: c.seq++ } as ChatEvent;
    if (keep) {
      c.events.push(ev);
      if (c.events.length > MAX_EVENTS) c.events.splice(0, c.events.length - MAX_EVENTS);
    }
    for (const cb of c.subscribers) {
      try {
        cb(ev);
      } catch {
        /* ignore */
      }
    }
  }

  private emitItems(c: LiveChat, items: ChatItem[]) {
    if (items.length) this.emit(c, { type: "items", items });
  }

  private emitState(c: LiveChat) {
    // Not buffered: a viewer joining late gets the current state in its snapshot.
    this.emit(c, { type: "state", state: this.state(c) }, false);
  }

  private setStatus(c: LiveChat, s: ChatStatus) {
    c.status = s;
    c.lastActivity = Date.now();
    if (!this.here) this.here = new Map();
    this.here.set(c.sessionId, c.lastActivity);
    this.emitState(c);
  }

  private reap() {
    const now = Date.now();
    for (const c of this.chats.values()) {
      if (c.status === "idle" && !c.pending.size && !c.subscribers.size && now - c.lastActivity > IDLE_CLOSE_MS) {
        this.close(c.sessionId);
      }
    }
  }
}

const g = globalThis as unknown as { __protegeChats?: ChatManager };
export function getChatManager(): ChatManager {
  if (!g.__protegeChats) g.__protegeChats = new ChatManager();
  // After a hot reload in development the kept instance belongs to the old class; give it the
  // new methods without dropping the conversations it is running.
  else if (!(g.__protegeChats instanceof ChatManager)) Object.setPrototypeOf(g.__protegeChats, ChatManager.prototype);
  return g.__protegeChats;
}

// ---------------------------------------------------------------------------
// Model list for the picker: whatever this computer's Claude Code offers (the same list
// Claude desktop shows). Asked of a running chat if there is one, otherwise of a short-lived
// Claude Code process that never receives a message, so no model is called.
// ---------------------------------------------------------------------------

let modelCache: { at: number; models: ModelInfo[] } | null = null;

export async function chatModels(): Promise<ModelInfo[]> {
  if (modelCache && Date.now() - modelCache.at < 10 * 60_000) return modelCache.models;
  const timeout = <T,>(p: Promise<T>) =>
    Promise.race([p, new Promise<T>((_, r) => setTimeout(() => r(new Error("Claude Code didn't answer")), 20_000))]);
  const live = getChatManager().anyLive();
  let models: ModelInfo[];
  if (live) models = await timeout(live.supportedModels());
  else {
    const silent: AsyncIterable<SDKUserMessage> = { async *[Symbol.asyncIterator]() { await new Promise(() => {}); } };
    const q = liveQuery(silent, { cwd: process.cwd(), persistSession: false });
    try {
      models = await timeout(q.supportedModels());
    } finally {
      try {
        q.close();
      } catch {
        /* ignore */
      }
    }
  }
  modelCache = { at: Date.now(), models };
  return models;
}
