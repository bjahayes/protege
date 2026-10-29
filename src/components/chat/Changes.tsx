"use client";

// Claude desktop's view of what a conversation changed: a "files changed" card after each turn
// that edited files, and a panel beside the chat with each file's diff.

import { useEffect, useState } from "react";
import { ResizeHandle, usePanelWidth } from "../Resizer";
import { totals, type DiffLine, type FileChange } from "@/lib/chat-changes";

export function DiffLines({ lines, className = "max-h-80" }: { lines: DiffLine[]; className?: string }) {
  return (
    <div className={`text-[11.5px] font-mono bg-bg border border-border rounded-lg py-1.5 overflow-auto ${className}`}>
      {lines.map((l, i) => (
        <div
          key={i}
          className={`px-2.5 whitespace-pre-wrap break-all ${
            l.op === "+" ? "bg-good/10 text-good" : l.op === "-" ? "bg-bad/10 text-bad" : "text-muted"
          }`}
        >
          <span className="select-none opacity-60 inline-block w-3">{l.op === " " ? "" : l.op === "-" ? "−" : "+"}</span>
          {l.text || " "}
        </div>
      ))}
    </div>
  );
}

function Counts({ added, removed, created }: { added: number; removed: number; created?: boolean }) {
  return (
    <span className="font-mono text-[11.5px] shrink-0">
      {created && <span className="text-muted mr-1.5">new</span>}
      <span className="text-good">+{added}</span> <span className="text-bad">−{removed}</span>
    </span>
  );
}

function fileName(p: string): string {
  return p.split(/[\\/]/).pop() || p;
}
function folder(p: string): string {
  const parts = p.split(/[\\/]/);
  return parts.length > 1 ? parts.slice(0, -1).join("/") + "/" : "";
}

/** After a turn: "3 files changed +40 −12", each file a row that opens its diff in the panel. */
export function ChangesCard({ files, onOpen }: { files: FileChange[]; onOpen: (rel: string) => void }) {
  const t = totals(files);
  return (
    <div className="rounded-xl border border-border bg-panel overflow-hidden">
      <div className="flex items-center gap-2 px-3.5 py-2 border-b border-border text-[12.5px]">
        <span className="font-medium">
          {files.length} file{files.length === 1 ? "" : "s"} changed
        </span>
        <Counts added={t.added} removed={t.removed} />
        <button onClick={() => onOpen(files[0].rel)} className="ml-auto text-[12px] text-accent hover:underline">
          Review changes
        </button>
      </div>
      {files.map((f) => (
        <button
          key={f.rel}
          onClick={() => onOpen(f.rel)}
          className="w-full text-left flex items-center gap-2 px-3.5 py-1.5 text-[12.5px] hover:bg-panel-2 min-w-0"
        >
          <span className="text-muted shrink-0">{f.created ? "＋" : "✎"}</span>
          <span className="font-mono truncate min-w-0">
            <span className="text-muted">{folder(f.rel)}</span>
            {fileName(f.rel)}
          </span>
          <span className="ml-auto pl-2">
            <Counts added={f.added} removed={f.removed} />
          </span>
        </button>
      ))}
    </div>
  );
}

/** Beside the chat: every file the conversation changed, and the diff of the one picked. */
export function ChangesPanel({ files, open, onOpen, onClose }: { files: FileChange[]; open: string; onOpen: (rel: string) => void; onClose: () => void }) {
  const t = totals(files);
  const cur = files.find((f) => f.rel === open) || files[0];
  const [split, setSplit] = useState(false);
  const size = usePanelWidth("protege.panel.changes", 640, 320, (vw) => vw - 560);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <>
    <ResizeHandle side="right" label="Files changed panel" width={size.width} onChange={size.set} onReset={size.reset} min={320} />
    <aside style={{ width: size.width }} className="shrink-0 border-l border-border flex flex-col min-h-0 bg-bg max-md:fixed max-md:inset-0 max-md:top-12 max-md:z-30 max-md:!w-full max-md:border-l-0">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <span className="text-sm font-semibold">
          {files.length} file{files.length === 1 ? "" : "s"} changed
        </span>
        <Counts added={t.added} removed={t.removed} />
        <button onClick={() => setSplit(!split)} title="Show each edit separately" className="ml-auto text-[11.5px] text-muted hover:text-text">
          {split ? "Join edits" : "Edit by edit"}
        </button>
        <button onClick={onClose} title="Close (Esc)" className="w-6 h-6 rounded text-muted hover:text-text hover:bg-panel-2">
          ×
        </button>
      </div>
      {!files.length ? (
        <div className="p-6 text-sm text-muted">Claude hasn&apos;t changed any files in this conversation yet.</div>
      ) : (
        <>
          <div className="max-h-[35%] overflow-y-auto border-b border-border py-1">
            {files.map((f) => (
              <button
                key={f.rel}
                onClick={() => onOpen(f.rel)}
                className={`w-full text-left flex items-center gap-2 px-4 py-1.5 text-[12.5px] min-w-0 ${f === cur ? "bg-panel-2" : "hover:bg-panel-2/60"}`}
              >
                <span className="text-muted shrink-0">{f.created ? "＋" : "✎"}</span>
                <span className="font-mono truncate min-w-0" title={f.path}>
                  <span className="text-muted">{folder(f.rel)}</span>
                  {fileName(f.rel)}
                </span>
                <span className="ml-auto pl-2">
                  <Counts added={f.added} removed={f.removed} created={f.created} />
                </span>
              </button>
            ))}
          </div>
          {cur && (
            <div className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-3">
              <div className="font-mono text-[12px] text-muted break-all">{cur.path}</div>
              {split || cur.hunks.length === 1 ? (
                cur.hunks.map((h, k) => (
                  <div key={h.toolUseId + k}>
                    {cur.hunks.length > 1 && <div className="text-[11px] text-muted mb-1">Edit {k + 1} of {cur.hunks.length}</div>}
                    <DiffLines lines={h.lines} className="" />
                  </div>
                ))
              ) : (
                <DiffLines lines={cur.hunks.flatMap((h, k) => [...(k ? [{ op: " " as const, text: "⋯" }] : []), ...h.lines])} className="" />
              )}
            </div>
          )}
        </>
      )}
    </aside>
    </>
  );
}
