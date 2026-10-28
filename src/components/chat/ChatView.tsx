"use client";

// One conversation with Claude Code, laid out like Claude desktop: your messages, Claude's
// replies as they are written, each tool call as a compact row you can open, approval cards
// when Claude needs permission, and a message box that works while Claude is busy.

import { apiFetch } from "@/lib/api-client";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChatItem } from "@/lib/chat-format";
import { permissionSentence, toolSummary } from "@/lib/chat-format";
import { plainError } from "@/lib/plain";
import MarkdownView from "../MarkdownView";
import { Picture, ToolInput, ToolOutput } from "./ToolDetail";
import { collectChanges, diffCounts, lineDiff, type FileChange } from "@/lib/chat-changes";
import { ChangesCard, ChangesPanel } from "./Changes";

type Status = "starting" | "working" | "waiting" | "idle" | "ended";
interface LiveState {
  sessionId: string;
  status: Status;
  model?: string;
  activeModel?: string;
  permissionMode: string;
  effort?: string;
  costUsd?: number;
  /** A copy of this conversation, carried on here because it was open in another app. */
  continuedFrom?: string;
  continuedBecause?: string;
}

/** A model as this computer's Claude Code offers it (the same list as Claude desktop's picker). */
interface ModelOption {
  value: string;
  displayName: string;
  description: string;
  supportedEffortLevels?: string[];
}

/** A file waiting in the message box, read into the browser ready to send. */
interface Pending {
  id: string;
  name: string;
  type: string;
  data: string; // base64
  preview?: string; // data URL for images
  size: number;
}

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
const MAX_EDGE = 2000; // longer side, in pixels, that big images are scaled down to

function readAsDataUrl(f: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(f);
  });
}

/** Big images are scaled down (as Claude desktop does) so they fit Claude's 5 MB image limit. */
async function prepare(f: File): Promise<Pending> {
  const id = Math.random().toString(36).slice(2);
  let url = await readAsDataUrl(f);
  let type = f.type || "application/octet-stream";
  if (IMAGE_TYPES.includes(type) && type !== "image/gif") {
    const img = new Image();
    await new Promise((r) => {
      img.onload = r;
      img.onerror = r;
      img.src = url;
    });
    const edge = Math.max(img.naturalWidth, img.naturalHeight);
    if (edge > MAX_EDGE || f.size > 3.5 * 1024 * 1024) {
      const k = Math.min(1, MAX_EDGE / edge);
      const c = document.createElement("canvas");
      c.width = Math.round(img.naturalWidth * k);
      c.height = Math.round(img.naturalHeight * k);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      type = "image/jpeg";
      url = c.toDataURL(type, 0.9);
    }
  }
  const data = url.slice(url.indexOf(",") + 1);
  return { id, name: f.name || "pasted image.png", type, data, preview: IMAGE_TYPES.includes(type) ? url : undefined, size: Math.floor((data.length * 3) / 4) };
}

function fileName(p: string): string {
  return p.split(/[\\/]/).pop() || p;
}

export const MODES: { value: string; label: string; hint: string }[] = [
  { value: "default", label: "Ask permissions", hint: "Claude asks before editing files or running commands" },
  { value: "acceptEdits", label: "Accept edits", hint: "Claude edits files without asking; still asks before running commands" },
  { value: "plan", label: "Plan mode", hint: "Claude reads and plans, and changes nothing until you approve the plan" },
  { value: "auto", label: "Auto", hint: "Claude Code decides what is safe to run without asking" },
  { value: "bypassPermissions", label: "Bypass permissions", hint: "Claude runs everything without asking" },
];


function pref(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}
function savePref(key: string, v: string) {
  try {
    localStorage.setItem(key, v);
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------

function ToolRow({
  item,
  result,
  root,
  running,
}: {
  item: Extract<ChatItem, { kind: "tool" }>;
  result?: Extract<ChatItem, { kind: "tool_result" }>;
  root?: string;
  running: boolean;
}) {
  const [open, setOpen] = useState(false);
  const s = toolSummary(item.name, item.input, root);
  if (item.name === "Edit") {
    const c = diffCounts(lineDiff(String(item.input?.old_string ?? ""), String(item.input?.new_string ?? "")));
    s.stat = `+${c.added} −${c.removed}`;
  }
  const state = result ? (result.isError ? "error" : "done") : running ? "running" : "done";
  // Screenshots and other pictures a tool returns show straight away, as in Claude desktop.
  const pics = !open && result?.images?.length ? result.images : null;
  return (
    <div>
      <button onClick={() => setOpen(!open)} className="w-full text-left flex items-baseline gap-2 py-0.5 text-[13px] group min-w-0">
        <span className={`shrink-0 w-3 text-center ${state === "error" ? "text-bad" : state === "running" ? "text-accent" : "text-muted/60"}`}>
          {state === "error" ? "✗" : state === "running" ? <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent live-dot align-middle" /> : "✓"}
        </span>
        <span className={`shrink-0 ${state === "error" ? "text-muted line-through decoration-bad/60" : "text-text/90"}`}>{s.verb}</span>
        {s.target && <span className="font-mono text-[12px] text-muted truncate min-w-0">{s.target}</span>}
        {state === "error" ? (
          <span className="text-[11.5px] text-bad/90 shrink-0">{/declined/i.test(result?.text || "") ? "you declined this" : "didn't work"}</span>
        ) : (
          s.stat && <span className="text-[11.5px] text-muted/80 shrink-0">{s.stat}</span>
        )}
        <span className="ml-auto text-muted/50 text-[11px] opacity-0 group-hover:opacity-100 shrink-0">{open ? "hide" : "show"}</span>
      </button>
      {open && (
        <div className="ml-5 mt-1 mb-2 flex flex-col gap-1.5">
          <ToolInput name={item.name} input={item.input} root={root} />
          {result && <ToolOutput name={item.name} text={result.text} isError={result.isError} images={result.images} />}
        </div>
      )}
      {pics && (
        <div className="ml-5 mt-1 mb-2 flex flex-wrap gap-2">
          {pics.map((src, k) => (
            <Picture key={k} src={src} />
          ))}
        </div>
      )}
    </div>
  );
}

function Thinking({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button onClick={() => setOpen(!open)} className="flex items-baseline gap-2 py-0.5 text-[13px] text-muted hover:text-text">
        <span className="w-3 text-center opacity-60">✻</span>
        <span className="italic">Thinking</span>
      </button>
      {open && <div className="ml-5 mt-1 mb-2 text-[12.5px] text-muted whitespace-pre-wrap leading-relaxed">{text}</div>}
    </div>
  );
}

function PermissionCard({
  item,
  root,
  onDecide,
}: {
  item: Extract<ChatItem, { kind: "permission" }>;
  root?: string;
  onDecide: (d: "allow" | "always" | "deny") => void;
}) {
  const [busy, setBusy] = useState(false);
  const plan = item.toolName === "ExitPlanMode";
  const decide = (d: "allow" | "always" | "deny") => {
    setBusy(true);
    onDecide(d);
  };
  return (
    <div className="rounded-xl border border-warn/40 bg-warn/5 px-4 py-3 my-1">
      <div className="text-sm font-medium">{plan ? "Claude has a plan and wants to start" : item.title || permissionSentence(item.toolName, item.input, root)}</div>
      {item.description && <div className="text-[12.5px] text-muted mt-0.5">{item.description}</div>}
      {item.toolName !== "Read" && (
        <div className="mt-2">
          <ToolInput name={item.toolName} input={item.input} root={root} />
        </div>
      )}
      <div className="flex flex-wrap gap-2 mt-3">
        <button
          disabled={busy}
          onClick={() => decide("allow")}
          className="px-3 py-1.5 rounded-lg bg-accent/20 border border-accent/50 text-accent hover:bg-accent/30 text-[13px] font-medium disabled:opacity-40"
        >
          {plan ? "Approve plan" : "Allow once"}
        </button>
        {item.canAlways && !plan && (
          <button
            disabled={busy}
            onClick={() => decide("always")}
            className="px-3 py-1.5 rounded-lg border border-border text-text hover:border-accent/50 text-[13px] disabled:opacity-40"
          >
            Always allow
          </button>
        )}
        <button
          disabled={busy}
          onClick={() => decide("deny")}
          className="px-3 py-1.5 rounded-lg border border-border text-muted hover:text-bad hover:border-bad/40 text-[13px] disabled:opacity-40"
        >
          {plan ? "Keep planning" : "Deny"}
        </button>
      </div>
    </div>
  );
}

function ErrorBox({ text }: { text: string }) {
  const p = plainError(text);
  const generic = p.message.startsWith("Something");
  const outdated = /does not support this model|newer is required/i.test(text);
  const [upd, setUpd] = useState<{ busy: boolean; result?: string }>({ busy: false });
  const update = async () => {
    setUpd({ busy: true });
    try {
      const r = await (await apiFetch("/api/claude/update", { method: "POST" })).json();
      setUpd({
        busy: false,
        result: r.version ? `Claude Code is now version ${r.version}. Send your message again.` : r.message || "The update didn't finish.",
      });
    } catch {
      setUpd({ busy: false, result: "The update didn't finish." });
    }
  };
  return (
    <div className="rounded-xl border border-bad/30 bg-bad/5 px-4 py-2.5 text-sm">
      <div className="font-medium text-bad">{generic ? text : p.message}</div>
      {!generic && p.hint && <div className="text-muted mt-0.5 text-[12.5px]">{p.hint}</div>}
      {outdated && (
        <div className="mt-2 flex items-center gap-3">
          <button
            onClick={update}
            disabled={upd.busy}
            className="px-3 py-1 rounded-lg bg-accent/20 border border-accent/50 text-accent hover:bg-accent/30 text-[12.5px] font-medium disabled:opacity-50"
          >
            {upd.busy ? "Updating…" : "Update Claude Code"}
          </button>
          {upd.result && <span className="text-[12.5px] text-muted">{upd.result}</span>}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

type Row =
  | { kind: "user"; item: Extract<ChatItem, { kind: "user" }> }
  | { kind: "command"; text: string; id: string }
  | { kind: "text"; text: string; id: string }
  | { kind: "work"; id: string; items: ChatItem[] }
  | { kind: "permission"; item: Extract<ChatItem, { kind: "permission" }>; decision?: string }
  | { kind: "error"; text: string; id: string }
  | { kind: "footer"; id: string; durationMs?: number; costUsd?: number; stopped?: boolean }
  | { kind: "changes"; id: string; files: FileChange[] };

function buildRows(
  items: ChatItem[],
  root?: string
): {
  rows: Row[];
  results: Map<string, Extract<ChatItem, { kind: "tool_result" }>>;
  decisions: Map<string, string>;
  changes: FileChange[];
} {
  const results = new Map<string, Extract<ChatItem, { kind: "tool_result" }>>();
  const decisions = new Map<string, string>();
  for (const i of items) {
    if (i.kind === "tool_result") results.set(i.toolUseId, i);
    if (i.kind === "permission_done") decisions.set(i.requestId, i.decision);
  }
  const rows: Row[] = [];
  let work: ChatItem[] = [];
  const flush = () => {
    if (work.length) rows.push({ kind: "work", id: work[0].id, items: work });
    work = [];
  };
  let lastError = "";
  // Each turn (from your message to Claude's last word) that changed files ends with a card
  // listing them, as in Claude desktop.
  let turnStart = 0;
  const endTurn = (k: number, id: string) => {
    const files = collectChanges(items.slice(turnStart, k + 1), results, root);
    if (files.length) rows.push({ kind: "changes", id: `chg:${id}`, files });
    turnStart = k + 1;
  };
  // A stopped turn can also be reported as "error_during_execution"; the stop line says it.
  const stoppedAfter = (k: number) => items.slice(k + 1, k + 3).some((x) => x.kind === "result" && x.stopped);
  for (const [k, i] of items.entries()) {
    if (i.kind === "result" && i.isError && i.subtype === "error_during_execution" && !i.text && stoppedAfter(k)) continue;
    switch (i.kind) {
      case "tool":
      case "thinking":
        work.push(i);
        break;
      case "tool_result":
      case "permission_done":
        break;
      case "user":
        flush();
        lastError = "";
        turnStart = k;
        rows.push({ kind: "user", item: i });
        break;
      case "command":
        flush();
        rows.push({ kind: "command", text: i.text, id: i.id });
        break;
      case "text":
        flush();
        rows.push({ kind: "text", text: i.text, id: i.id });
        break;
      case "permission": {
        const d = decisions.get(i.requestId);
        if (d) {
          // Settled requests fold into the work list as a single line.
          work.push(i);
        } else {
          flush();
          rows.push({ kind: "permission", item: i });
        }
        break;
      }
      case "error":
      case "result": {
        if (i.kind === "result") {
          flush();
          endTurn(k, i.id);
        }
        if (i.kind === "result" && !i.isError) {
          const prev = rows[rows.length - 1];
          if (i.stopped && prev?.kind === "footer" && prev.stopped) break;
          rows.push({ kind: "footer", id: i.id, durationMs: i.durationMs, costUsd: i.costUsd, stopped: i.stopped });
          break;
        }
        const text = i.kind === "error" ? i.text : i.text || i.subtype || "Claude Code stopped with an error.";
        const plain = plainError(text).message;
        const key = plain.startsWith("Something") ? text.trim() : plain;
        flush();
        // Claude Code often reports one failure twice (the reply, then the run's result).
        if (key !== lastError) rows.push({ kind: "error", text, id: i.id });
        lastError = key;
        break;
      }
    }
  }
  flush();
  return { rows, results, decisions, changes: collectChanges(items, results, root) };
}

// ---------------------------------------------------------------------------

// The conversation itself. Memoised: it redraws only when its messages change, never while
// the person types or while a reply streams in (that text is drawn separately below it).
const Transcript = memo(function Transcript({
  rows,
  results,
  decisions,
  cwd,
  running,
  onAct,
  onOpenFile,
}: {
  onOpenFile: (rel: string) => void;
  rows: Row[];
  results: Map<string, Extract<ChatItem, { kind: "tool_result" }>>;
  decisions: Map<string, string>;
  cwd?: string;
  running: boolean;
  onAct: (body: any) => void;
}) {
  return (
    <>
      {rows.map((r) => {
        switch (r.kind) {
          case "user":
            return (
              <div key={r.item.id} className="self-end max-w-[85%] rounded-2xl bg-panel-2 border border-border px-4 py-2.5 text-sm whitespace-pre-wrap break-words">
                {!!r.item.images?.length && (
                  <div className={`flex flex-wrap gap-2 justify-end ${r.item.text || r.item.files ? "mb-2" : ""}`}>
                    {r.item.images.map((src, k) => (
                      <Picture key={k} src={src} className="max-h-64" />
                    ))}
                  </div>
                )}
                {!!r.item.files?.length && (
                  <div className={`flex flex-wrap gap-1.5 justify-end ${r.item.text ? "mb-2" : ""}`}>
                    {r.item.files.map((f, k) => (
                      <span key={k} title={f} className="inline-flex items-center gap-1.5 text-[12px] px-2 py-1 rounded-lg bg-bg border border-border">
                        📄 {fileName(f)}
                      </span>
                    ))}
                  </div>
                )}
                {r.item.text}
              </div>
            );
          case "command": {
            const model = r.text.match(/^\/model\s+(.+)$/);
            return (
              <div key={r.id} className="self-center text-[12px] text-muted">
                {model ? (
                  <>Switched model to {model[1]}</>
                ) : (
                  <>
                    Ran <span className="font-mono">{r.text}</span>
                  </>
                )}
              </div>
            );
          }
          case "text":
            return (
              <div key={r.id} className="tx-md chat-md min-w-0">
                <MarkdownView content={r.text} />
              </div>
            );
          case "work":
            return (
              <div key={r.id} className="flex flex-col">
                {r.items.map((i) =>
                  i.kind === "tool" ? (
                    <ToolRow key={i.id} item={i} result={results.get(i.toolUseId)} root={cwd} running={running} />
                  ) : i.kind === "thinking" ? (
                    <Thinking key={i.id} text={i.text} />
                  ) : i.kind === "permission" ? (
                    <div key={i.id} className="flex items-baseline gap-2 py-0.5 text-[12.5px] text-muted">
                      <span className="w-3 text-center">{decisions.get(i.requestId) === "deny" ? "⊘" : "✔"}</span>
                      {decisions.get(i.requestId) === "deny" ? "You declined" : decisions.get(i.requestId) === "always" ? "You allowed (always)" : "You allowed"}:{" "}
                      {permissionSentence(i.toolName, i.input, cwd).replace(/^Claude wants to /, "")}
                    </div>
                  ) : null
                )}
              </div>
            );
          case "permission":
            return (
              <PermissionCard
                key={r.item.id}
                item={r.item}
                root={cwd}
                onDecide={(d) => onAct({ action: "permission", requestId: r.item.requestId, decision: d })}
              />
            );
          case "error":
            return <ErrorBox key={r.id} text={r.text} />;
          case "changes":
            return <ChangesCard key={r.id} files={r.files} onOpen={onOpenFile} />;
          case "footer":
            return r.stopped ? (
              <div key={r.id} className="text-[12px] text-muted -mt-1">■ You stopped Claude here.</div>
            ) : r.durationMs != null ? (
              <div key={r.id} className="text-[11px] text-muted/60 -mt-1">
                {r.durationMs >= 1000 ? `${Math.round(r.durationMs / 1000)}s` : `${r.durationMs}ms`}
              </div>
            ) : null;
        }
      })}
    </>
  );
});

// The message box. It keeps what is being typed (and attached) to itself, so typing redraws
// only the box, not the conversation above it.
function Composer({
  busy,
  hasSession,
  notice,
  onSend,
  onStop,
  mode,
  onMode,
  model,
  onModel,
  effort,
  onEffort,
  models,
}: {
  busy: boolean;
  hasSession: boolean;
  notice?: React.ReactNode;
  /** Resolves to an error message, or null once the message is on its way. */
  onSend: (text: string, files: Pending[]) => Promise<string | null>;
  onStop: () => void;
  mode: string;
  onMode: (v: string) => void;
  model: string;
  onModel: (v: string) => void;
  effort: string;
  onEffort: (v: string) => void;
  models: ModelOption[];
}) {
  const [draft, setDraft] = useState("");
  const [files, setFiles] = useState<Pending[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    box.current?.focus();
  }, []);

  const addFiles = async (list: FileList | File[]) => {
    const arr = [...list];
    if (!arr.length) return;
    try {
      const ready = await Promise.all(arr.map(prepare));
      setFiles((f) => [...f, ...ready].slice(0, 20));
    } catch {
      setError("Couldn't read that file.");
    }
  };

  const send = async () => {
    const text = draft.trim();
    if ((!text && !files.length) || sending) return;
    setSending(true);
    setError("");
    const err = await onSend(text, files);
    if (err) setError(err);
    else {
      setDraft("");
      setFiles([]);
      if (box.current) box.current.style.height = "auto";
    }
    setSending(false);
    box.current?.focus();
  };

  const current = models.find((m) => m.value === (model || "default"));
  const effortLevels = current?.supportedEffortLevels || [];
  const modeInfo = MODES.find((m) => m.value === mode) || MODES[0];

  return (
    <div className="border-t border-border px-6 py-3">
      <div className="max-w-3xl mx-auto">
        {error && <div className="text-[12.5px] text-bad mb-2">{error}</div>}
        {notice}
        <div
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes("Files")) {
              e.preventDefault();
              setDragging(true);
            }
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            if (!e.dataTransfer.files.length) return;
            e.preventDefault();
            setDragging(false);
            addFiles(e.dataTransfer.files);
          }}
          className={`rounded-2xl border bg-panel focus-within:border-accent/50 ${dragging ? "border-accent border-dashed" : "border-border"}`}
        >
          {files.length > 0 && (
            <div className="flex flex-wrap gap-2 px-3 pt-3">
              {files.map((f) => (
                <div key={f.id} className="relative group">
                  {f.preview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={f.preview} alt={f.name} title={f.name} className="h-16 w-auto max-w-[160px] object-cover rounded-lg border border-border" />
                  ) : (
                    <div title={f.name} className="h-16 max-w-[200px] px-3 rounded-lg border border-border bg-bg flex items-center gap-2 text-[12px]">
                      <span>📄</span>
                      <span className="truncate">{f.name}</span>
                    </div>
                  )}
                  <button
                    onClick={() => setFiles((x) => x.filter((y) => y.id !== f.id))}
                    title="Remove"
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-panel-2 border border-border text-[11px] text-muted hover:text-bad leading-none"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          <textarea
            onPaste={(e) => {
              const pasted = [...e.clipboardData.files];
              if (pasted.length) {
                e.preventDefault();
                addFiles(pasted);
              }
            }}
            ref={box}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              const el = e.target;
              el.style.height = "auto";
              el.style.height = Math.min(el.scrollHeight, 260) + "px";
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              }
              if (e.key === "Escape" && busy) onStop();
            }}
            rows={2}
            placeholder={busy ? "Add to the session — Claude reads it next" : hasSession ? "Reply to Claude…" : "What should Claude do?"}
            className="w-full bg-transparent px-4 pt-3 pb-1 text-sm resize-none focus:outline-none"
          />
          <div className="flex items-center gap-2 px-3 pb-2">
            <input
              ref={picker}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) addFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <button
              onClick={() => picker.current?.click()}
              title="Attach files or images (or drag them here, or paste)"
              className="text-[15px] w-8 h-7 rounded-lg border border-border text-muted hover:text-text hover:border-accent/50 flex items-center justify-center"
            >
              📎
            </button>
            <select
              value={mode}
              onChange={(e) => onMode(e.target.value)}
              title={modeInfo.hint}
              className={`text-[12px] bg-transparent border rounded-lg px-2 py-1 focus:outline-none ${
                mode === "bypassPermissions" ? "border-bad/50 text-bad" : mode === "plan" ? "border-accent/40 text-accent" : "border-border text-muted"
              }`}
            >
              {MODES.map((m) => (
                <option key={m.value} value={m.value} className="bg-panel text-text">
                  {m.label}
                </option>
              ))}
            </select>
            <select
              value={model || "default"}
              onChange={(e) => onModel(e.target.value)}
              title={current?.description}
              className="text-[12px] bg-transparent border border-border rounded-lg px-2 py-1 text-muted focus:outline-none max-w-[200px]"
            >
              {(models.length ? models : [{ value: "default", displayName: "Default model", description: "" }]).map((m) => (
                <option key={m.value} value={m.value} title={m.description} className="bg-panel text-text">
                  {m.displayName}
                </option>
              ))}
            </select>
            {effortLevels.length > 0 && (
              <select
                value={effort}
                onChange={(e) => onEffort(e.target.value)}
                title="How hard Claude thinks before answering"
                className="text-[12px] bg-transparent border border-border rounded-lg px-2 py-1 text-muted focus:outline-none"
              >
                <option value="" className="bg-panel text-text">
                  Default effort
                </option>
                {effortLevels.map((l) => (
                  <option key={l} value={l} className="bg-panel text-text">
                    {l === "xhigh" ? "Extra high" : l[0].toUpperCase() + l.slice(1)} effort
                  </option>
                ))}
              </select>
            )}
            <div className="ml-auto flex items-center gap-2">
              {busy && (
                <button
                  onClick={onStop}
                  title="Stop (Esc)"
                  className="text-[12px] px-3 py-1.5 rounded-lg border border-border text-muted hover:text-bad hover:border-bad/40"
                >
                  ■ Stop
                </button>
              )}
              <button
                onClick={send}
                disabled={sending || (!draft.trim() && !files.length)}
                className="text-[12px] px-3 py-1.5 rounded-lg bg-accent/20 border border-accent/50 text-accent hover:bg-accent/30 font-medium disabled:opacity-40"
              >
                {sending ? "Sending…" : "Send ↵"}
              </button>
            </div>
          </div>
        </div>
        <div className="text-[11px] text-muted/70 mt-1.5">
          {modeInfo.hint}. Shift+Enter for a new line. Drop or paste files and images to attach them.
        </div>
      </div>
    </div>
  );
}

export default function ChatView({
  sessionId,
  projectId,
  projectName,
  cwd,
  title,
  onStarted,
}: {
  sessionId: string | null;
  projectId: string;
  projectName?: string;
  cwd?: string;
  title?: string;
  onStarted: (sessionId: string) => void;
}) {
  const [items, setItems] = useState<ChatItem[]>([]);
  const [partial, setPartial] = useState("");
  const [live, setLive] = useState<LiveState | null>(null);
  const [loading, setLoading] = useState(false);
  // The other app this conversation is open in right now, if any (Claude desktop, a terminal).
  const [openIn, setOpenIn] = useState<string | null>(null);
  const [mode, setMode] = useState("default");
  const [model, setModel] = useState("");
  const [effort, setEffort] = useState("");
  const [models, setModels] = useState<ModelOption[]>([]);
  const seen = useRef<Set<string>>(new Set());
  const historyUserTexts = useRef<Set<string>>(new Set());
  const es = useRef<EventSource | null>(null);
  const created = useRef<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  useEffect(() => {
    setMode(pref("protege.chat.mode", "default"));
    setModel(pref("protege.chat.model", ""));
    setEffort(pref("protege.chat.effort", ""));
    apiFetch("/api/chat/models", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setModels(d.models || []))
      .catch(() => {});
  }, []);

  const itemsRef = useRef<ChatItem[]>([]);
  // Where the live stream has got to in the list; kept between events (null = the end).
  const cursorRef = useRef<number | null>(null);
  const merge = useCallback((incoming: ChatItem[], fromHistory = false) => {
    const list = [...itemsRef.current];
    let changed = false;
    // Live items not in the saved transcript (run times, approvals, stops) are placed straight
    // after the item they followed, so a reopened live chat reads in the right order.
    let cursor = fromHistory || cursorRef.current === null ? list.length - 1 : cursorRef.current;
    for (const i of incoming) {
      if (seen.current.has(i.id)) {
        if (!fromHistory) {
          const at = list.findIndex((x) => x.id === i.id);
          if (at >= 0) cursor = at;
        }
        continue;
      }
      seen.current.add(i.id);
      // A message sent in this process may be saved under a different id; don't show it twice.
      if (!fromHistory && i.kind === "user" && historyUserTexts.current.has(i.text.trim())) {
        historyUserTexts.current.delete(i.text.trim());
        const at = list.findIndex((x) => x.kind === "user" && x.text.trim() === i.text.trim());
        if (at >= 0) cursor = at;
        continue;
      }
      if (fromHistory) list.push(i);
      else list.splice(cursor + 1, 0, i);
      cursor++;
      changed = true;
    }
    if (!fromHistory) cursorRef.current = cursor;
    if (changed) {
      itemsRef.current = list;
      setItems(list);
    }
  }, []);

  const connect = useCallback(
    (sid: string) => {
      es.current?.close();
      const src = new EventSource(`/api/chat/${sid}/stream`);
      es.current = src;
      src.addEventListener("snapshot", (e) => {
        const d = JSON.parse((e as MessageEvent).data);
        setLive(d.state);
        setPartial(d.partial || "");
      });
      src.addEventListener("event", (e) => {
        const ev = JSON.parse((e as MessageEvent).data);
        if (ev.type === "items") {
          merge(ev.items);
          if (ev.items.some((i: ChatItem) => i.kind === "text" || i.kind === "result")) setPartial("");
        } else if (ev.type === "delta") setPartial((p) => p + ev.text);
        else if (ev.type === "state") setLive(ev.state);
      });
      src.addEventListener("end", () => {
        src.close();
        if (es.current === src) es.current = null;
        setLive((l) => (l ? { ...l, status: "ended" } : l));
        setPartial("");
      });
      src.onerror = () => {
        /* EventSource retries by itself */
      };
    },
    [merge]
  );

  // Load the saved conversation, then follow it live if its process is running.
  useEffect(() => {
    if (sessionId && created.current === sessionId) return; // we just started it here
    es.current?.close();
    es.current = null;
    seen.current = new Set();
    historyUserTexts.current = new Set();
    itemsRef.current = [];
    cursorRef.current = null;
    setItems([]);
    setPartial("");
    setLive(null);
    stick.current = true;
    if (!sessionId) return;
    let cancelled = false;
    setLoading(true);
    apiFetch(`/api/chat/${sessionId}${cwd ? `?cwd=${encodeURIComponent(cwd)}` : ""}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setOpenIn(d.openIn || null);
        for (const i of d.items || []) if (i.kind === "user") historyUserTexts.current.add(String(i.text).trim());
        merge(d.items || [], true);
        if (d.live) {
          setLive(d.live);
          setMode(d.live.permissionMode || "default");
          setModel(d.live.model || "");
          setEffort(d.live.effort || "");
          connect(sessionId);
        }
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [sessionId, cwd, connect, merge]);

  useEffect(() => () => es.current?.close(), []);

  // A conversation running in another app (terminal, IDE, Claude desktop) keeps changing on
  // disk; pick up its new messages while it is open here.
  const hereLive = !!live && live.status !== "ended";
  useEffect(() => {
    if (!sessionId || hereLive) return;
    const t = setInterval(() => {
      apiFetch(`/api/chat/${sessionId}${cwd ? `?cwd=${encodeURIComponent(cwd)}` : ""}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => {
          setOpenIn(d.openIn || null);
          for (const i of d.items || []) if (i.kind === "user") historyUserTexts.current.add(String(i.text).trim());
          merge(d.items || [], true);
          if (d.live) {
            setLive(d.live);
            connect(sessionId);
          }
        })
        .catch(() => {});
    }, 5000);
    return () => clearInterval(t);
  }, [sessionId, cwd, hereLive, merge, connect]);
  const elsewhere = !!sessionId && !loading && !hereLive ? openIn : null;

  useEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [items, partial]);

  const busy = live?.status === "working" || live?.status === "waiting" || live?.status === "starting";

  // Kept in refs so the callbacks below never change identity (the memoised conversation and
  // the message box then don't redraw because of them).
  const sidRef = useRef<string | null>(sessionId);
  sidRef.current = sessionId || created.current;
  const liveRef = useRef(live);
  liveRef.current = live;
  const prefsRef = useRef({ mode, model, effort, models });
  prefsRef.current = { mode, model, effort, models };

  const act = useCallback((body: any) => {
    const sid = sidRef.current;
    if (!sid) return;
    apiFetch(`/api/chat/${sid}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => {});
  }, []);
  const isLive = () => !!liveRef.current && liveRef.current.status !== "ended";

  const send = useCallback(
    async (text: string, files: Pending[]): Promise<string | null> => {
      stick.current = true;
      const { mode, model, effort } = prefsRef.current;
      try {
        const r = await apiFetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId,
            sessionId: sidRef.current || undefined,
            text,
            permissionMode: mode,
            model: model && model !== "default" ? model : undefined,
            effort: effort || undefined,
            attachments: files.map(({ name, type, data }) => ({ name, type, data })),
          }),
        });
        const d = await r.json();
        if (!r.ok || !d.sessionId) return d.error || "Couldn't send the message.";
        if (!es.current) connect(d.sessionId);
        if (!sidRef.current) {
          created.current = d.sessionId;
          sidRef.current = d.sessionId;
          onStarted(d.sessionId);
        }
        return null;
      } catch (e: any) {
        return String(e?.message || e);
      }
    },
    [projectId, connect, onStarted]
  );

  const changeEffort = useCallback(
    (v: string) => {
      setEffort(v);
      savePref("protege.chat.effort", v);
      if (isLive()) act({ action: "effort", value: v });
    },
    [act]
  );
  const changeMode = useCallback(
    (v: string) => {
      setMode(v);
      savePref("protege.chat.mode", v);
      if (isLive()) act({ action: "mode", value: v });
    },
    [act]
  );
  const changeModel = useCallback(
    (v: string) => {
      setModel(v);
      savePref("protege.chat.model", v);
      if (isLive()) act({ action: "model", value: v === "default" ? "" : v });
      // Keep the effort only if the new model offers it.
      const { models, effort } = prefsRef.current;
      const levels = models.find((m) => m.value === (v || "default"))?.supportedEffortLevels || [];
      if (effort && !levels.includes(effort)) changeEffort("");
    },
    [act, changeEffort]
  );
  const stop = useCallback(() => act({ action: "interrupt" }), [act]);

  const { rows, results, decisions, changes } = useMemo(() => buildRows(items, cwd), [items, cwd]);
  const running = !!busy;
  // The changes panel: null = closed, otherwise the file shown ("" = the first one).
  const [openFile, setOpenFile] = useState<string | null>(null);
  const openChanges = useCallback((rel: string) => setOpenFile(rel), []);
  const closeChanges = useCallback(() => setOpenFile(null), []);
  useEffect(() => setOpenFile(null), [sessionId]);

  return (
    <div className="flex h-full min-h-0">
    <div className="flex flex-col flex-1 min-w-0 min-h-0">
      <header className="px-6 py-3 border-b border-border flex items-center gap-3 min-w-0">
        <div className="min-w-0">
          <div className="text-sm font-semibold truncate">{title || (sessionId ? "Session" : "New session")}</div>
          <div className="text-[11.5px] text-muted truncate font-mono">{cwd || projectName}</div>
        </div>
        <div className="ml-auto flex items-center gap-2 shrink-0 text-[11.5px] text-muted">
          {changes.length > 0 && (
            <button
              onClick={() => setOpenFile((f) => (f === null ? "" : null))}
              className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[12px] ${
                openFile !== null ? "border-accent/50 text-accent bg-accent/10" : "border-border hover:text-text"
              }`}
              title="Files Claude changed in this session"
            >
              {changes.length} file{changes.length === 1 ? "" : "s"} changed
              <span className="font-mono text-good">+{changes.reduce((n, f) => n + f.added, 0)}</span>
              <span className="font-mono text-bad">−{changes.reduce((n, f) => n + f.removed, 0)}</span>
            </button>
          )}
          {(live?.activeModel || live?.model) && <span className="font-mono">{live.activeModel || live.model}</span>}
          {busy && (
            <span className="inline-flex items-center gap-1.5 text-accent">
              <span className="w-1.5 h-1.5 rounded-full bg-accent live-dot" />
              {live?.status === "waiting" ? "Needs your OK" : "Working"}
            </span>
          )}
        </div>
      </header>

      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="flex-1 min-h-0 overflow-y-auto"
      >
        <div className="max-w-3xl mx-auto px-6 py-6 flex flex-col gap-3">
          {loading && <div className="text-sm text-muted">Loading the session…</div>}
          {!loading && !rows.length && !partial && (
            <div className="text-center text-muted text-sm mt-24">
              <div className="text-lg text-text mb-1">{sessionId ? "Nothing to show yet" : `New session in ${projectName || "this project"}`}</div>
              Claude Code works in <span className="font-mono">{cwd || projectName}</span>, using your own sign-in, settings and CLAUDE.md.
            </div>
          )}
          <Transcript rows={rows} results={results} decisions={decisions} cwd={cwd} running={running} onAct={act} onOpenFile={openChanges} />
          {partial && (
            <div className="tx-md chat-md min-w-0">
              <MarkdownView content={partial + " ▍"} />
            </div>
          )}
          {busy && !partial && live?.status !== "waiting" && (
            <div className="flex items-center gap-2 text-[12.5px] text-muted">
              <span className="w-1.5 h-1.5 rounded-full bg-accent live-dot" />
              Claude is working…
            </div>
          )}
        </div>
      </div>

      <Composer
        key={sessionId || "new"}
        busy={busy}
        hasSession={!!sessionId}
        notice={
          elsewhere ? (
            <div className="text-[12px] text-warn mb-2">
              This session is open in {elsewhere}. If you reply here, Protégé carries it on as a copy, so the session in{" "}
              {elsewhere} keeps its whole history and so does this one.
            </div>
          ) : live?.continuedFrom ? (
            <div className="text-[12px] text-muted mb-2">
              This is a copy of a session that was open in {live.continuedBecause || "another app"}. Protégé carried it on here so
              neither one loses messages; the original is unchanged.
            </div>          ) : null
        }
        onSend={send}
        onStop={stop}
        mode={mode}
        onMode={changeMode}
        model={model}
        onModel={changeModel}
        effort={effort}
        onEffort={changeEffort}
        models={models}
      />
    </div>
    {openFile !== null && <ChangesPanel files={changes} open={openFile} onOpen={openChanges} onClose={closeChanges} />}
    </div>
  );
}
