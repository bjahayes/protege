"use client";

// What a tool call did, shown when its row is opened: the command and its output, the lines
// an edit removed and added, the file written, the to-do list, and so on.

import { useState } from "react";
import MarkdownView from "../MarkdownView";
import { shortPath } from "@/lib/chat-format";
import { lineDiff } from "@/lib/chat-changes";
import { DiffLines } from "./Changes";

function Mono({ text, tone, max = "max-h-72" }: { text: string; tone?: "add" | "del" | "err"; max?: string }) {
  const c = tone === "add" ? "text-good" : tone === "del" ? "text-bad" : tone === "err" ? "text-bad" : "text-muted";
  return (
    <pre className={`text-[11.5px] font-mono whitespace-pre-wrap break-all bg-bg border border-border rounded-lg px-2.5 py-2 ${c} ${max} overflow-y-auto`}>
      {text}
    </pre>
  );
}

function Diff({ oldText, newText }: { oldText: string; newText: string }) {
  return <DiffLines lines={lineDiff(String(oldText || ""), String(newText || ""))} />;
}

export function ToolInput({ name, input, root }: { name: string; input: any; root?: string }) {
  const i = input || {};
  switch (name) {
    case "Bash":
    case "PowerShell":
      return <Mono text={String(i.command || "")} />;
    case "Edit":
      return <Diff oldText={i.old_string ?? ""} newText={i.new_string ?? ""} />;
    case "MultiEdit":
      return (
        <div className="flex flex-col gap-1.5">
          {(i.edits || []).map((e: any, k: number) => (
            <Diff key={k} oldText={e.old_string ?? ""} newText={e.new_string ?? ""} />
          ))}
        </div>
      );
    case "Write":
      return <Diff oldText="" newText={String(i.content || "")} />;
    case "Read":
      return null;
    case "TodoWrite":
      return (
        <div className="flex flex-col gap-0.5 text-[12.5px]">
          {(i.todos || []).map((t: any, k: number) => (
            <div key={k} className={t.status === "completed" ? "text-muted line-through" : t.status === "in_progress" ? "text-text" : "text-muted"}>
              {t.status === "completed" ? "☑" : t.status === "in_progress" ? "◐" : "☐"} {t.content || t.activeForm}
            </div>
          ))}
        </div>
      );
    case "ExitPlanMode":
      return (
        <div className="tx-md rounded-lg border border-border bg-bg px-3 py-2">
          <MarkdownView content={String(i.plan || "")} />
        </div>
      );
    case "Task":
    case "Agent":
      return <Mono text={String(i.prompt || "")} />;
    case "WebFetch":
      return <Mono text={`${i.url || ""}${i.prompt ? `\n\n${i.prompt}` : ""}`} />;
    case "Grep":
    case "Glob":
      return <Mono text={`${i.pattern || ""}${i.path ? `   in ${shortPath(i.path, root)}` : ""}`} />;
    default:
      return Object.keys(i).length ? <Mono text={JSON.stringify(i, null, 2)} /> : null;
  }
}

/** An image at its own proportions, never stretched; click to see it full size. */
export function Picture({ src, className = "max-h-80" }: { src: string; className?: string }) {
  const [big, setBig] = useState(false);
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        onClick={() => setBig(true)}
        className={`block w-auto h-auto max-w-full object-contain rounded-lg border border-border cursor-zoom-in ${className}`}
      />
      {big && (
        <div onClick={() => setBig(false)} className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-6 cursor-zoom-out">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="" className="max-w-full max-h-full w-auto h-auto object-contain rounded-lg" />
        </div>
      )}
    </>
  );
}

export function ToolOutput({
  name,
  text,
  isError,
  images,
  showImages = true,
}: {
  name: string;
  text: string;
  isError?: boolean;
  images?: string[];
  showImages?: boolean;
}) {
  // Edits and to-do updates say only "done"; the input above already shows what changed.
  if (!isError && ["Edit", "MultiEdit", "Write", "TodoWrite", "NotebookEdit"].includes(name)) return null;
  if (!text && !images?.length) return null;
  if ((name === "Task" || name === "Agent") && !isError) {
    return (
      <div className="tx-md rounded-lg border border-border bg-bg px-3 py-2 max-h-96 overflow-y-auto">
        <MarkdownView content={text} />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      {text && <Mono text={text.length > 6000 ? text.slice(0, 6000) + "\n…" : text} tone={isError ? "err" : undefined} />}
      {showImages && images?.map((src, k) => <Picture key={k} src={src} />)}
    </div>
  );
}
