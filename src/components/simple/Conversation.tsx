"use client";

// A Claude-desktop-style conversation for Simple mode: the person's message, Claude Code's
// replies as they arrive, and each step as a small labelled line that can be opened.

import { useEffect, useRef, useState } from "react";
import type { Job, JobEvent } from "@/lib/types";
import { ownWords, stepLabel } from "@/lib/live-build";
import { stripPlan } from "@/lib/plan";
import { plainError } from "@/lib/plain";
import MarkdownView from "../MarkdownView";

export interface FeedState {
  job: Job | null;
  events: JobEvent[];
  ended: boolean;
}

type Item =
  | { kind: "you"; text: string; key: string }
  | { kind: "claude"; text: string; key: string }
  | { kind: "steps"; steps: { label: string; detail?: string; tone?: "warn" | "bad" | "good" }[]; key: string }
  | { kind: "error"; text: string; key: string };

function detailOf(e: JobEvent): string | undefined {
  const d = e.payload?.detail || {};
  return d.command || d.file || d.pattern || d.query || d.url || e.payload?.input || undefined;
}

/** The run's result repeats its last reply with the spacing squashed (and cut short when long). */
function sameReply(result: string, lastText: string): boolean {
  const flat = (s: string) => stripPlan(s).replace(/\s+/g, " ").trim();
  const r = flat(result).replace(/…$/, "");
  const t = flat(lastText);
  return !!r && (t === r || t.startsWith(r));
}

function itemsFor(feed: FeedState, fi: number): Item[] {
  const out: Item[] = [];
  if (feed.job) out.push({ kind: "you", text: ownWords(feed.job.prompt), key: `${fi}-you` });
  let steps: { label: string; detail?: string; tone?: "warn" | "bad" | "good" }[] = [];
  let lastText = "";
  const flush = (k: string) => {
    if (steps.length) out.push({ kind: "steps", steps, key: k });
    steps = [];
  };
  for (const e of feed.events) {
    const k = `${fi}-${e.seq}`;
    switch (e.type) {
      case "text":
        if (e.payload?.subagent) {
          steps.push({ label: "A helper reported back", detail: e.payload?.text });
          break;
        }
        flush(k + "s");
        // A plan's parts block is for the map, not the chat.
        lastText = stripPlan(e.payload?.text || "");
        if (lastText) out.push({ kind: "claude", text: lastText, key: k });
        break;
      case "tool":
        steps.push({ label: stepLabel(e), detail: detailOf(e) });
        break;
      case "thinking":
        steps.push({ label: "Thought it through", detail: e.payload?.text });
        break;
      case "checks":
        if (e.payload?.running) steps.push({ label: `Running the project's checks (${e.payload?.command || "checks"})` });
        else steps.push({ label: e.payload?.passed ? "The checks passed" : "The checks found a problem", tone: e.payload?.passed ? "good" : "warn" });
        break;
      case "auto_fix":
        steps.push({ label: `Fixing the problem the checks found (try ${e.payload?.attempt} of ${e.payload?.of})`, tone: "warn" });
        break;
      case "stuck":
        steps.push({ label: "Protégé seems to be repeating the same step", tone: "warn" });
        break;
      case "auto_continue":
        steps.push({ label: "The task was long, so Protégé is carrying on where it stopped" });
        break;
      case "result":
        flush(k + "s");
        if (e.payload?.isError) {
          const msg = String(e.payload?.result || e.payload?.subtype || "");
          out.push({ kind: "error", text: msg || "Something went wrong.", key: k });
        } else if (e.payload?.result && !sameReply(e.payload.result, lastText) && e.payload?.subtype === "success") {
          out.push({ kind: "claude", text: stripPlan(e.payload.result), key: k });
        }
        break;
      case "error":
        flush(k + "s");
        out.push({ kind: "error", text: e.payload?.message || "Something went wrong.", key: k });
        break;
    }
  }
  flush(`${fi}-tail`);
  return out;
}

function Steps({ steps }: { steps: { label: string; detail?: string; tone?: "warn" | "bad" | "good" }[] }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="flex flex-col gap-0.5 pl-1 border-l-2 border-border ml-2">
      {steps.map((s, i) => (
        <div key={i} className="pl-3">
          <button
            onClick={() => setOpen(open === i ? null : i)}
            disabled={!s.detail}
            className={`text-left text-[12.5px] leading-snug py-0.5 flex items-start gap-1.5 ${
              s.tone === "warn" ? "text-warn" : s.tone === "bad" ? "text-bad" : s.tone === "good" ? "text-good" : "text-muted"
            } ${s.detail ? "hover:text-text" : "cursor-default"}`}
          >
            <span className="shrink-0 opacity-70">{s.detail ? (open === i ? "▾" : "▸") : "·"}</span>
            <span>{s.label}</span>
          </button>
          {open === i && s.detail && (
            <pre className="mt-1 mb-1.5 text-[11.5px] font-mono whitespace-pre-wrap break-all bg-bg border border-border rounded-lg px-2.5 py-2 text-muted max-h-48 overflow-y-auto">
              {s.detail}
            </pre>
          )}
        </div>
      ))}
    </div>
  );
}

export default function Conversation({ feeds }: { feeds: FeedState[] }) {
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const items = feeds.flatMap((f, i) => itemsFor(f, i));
  const last = feeds[feeds.length - 1];
  const live = last && !last.ended;
  const lastStep = live ? [...last.events].reverse().find((e) => e.type === "tool") : undefined;

  useEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [items.length, live]);

  return (
    <div
      ref={scroller}
      onScroll={(e) => {
        const el = e.currentTarget;
        stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
      }}
      className="max-h-[560px] overflow-y-auto pr-1 flex flex-col gap-3"
      aria-live="polite"
    >
      {items.map((it) =>
        it.kind === "you" ? (
          <div key={it.key} className="self-end max-w-[88%] rounded-2xl rounded-br-md bg-accent/15 border border-accent/30 px-4 py-2.5 text-sm whitespace-pre-wrap">
            {it.text}
          </div>
        ) : it.kind === "claude" ? (
          <div key={it.key} className="self-start max-w-[92%] min-w-0 rounded-2xl rounded-bl-md bg-panel-2 border border-border px-4 py-2.5">
            <div className="tx-md">
              <MarkdownView content={it.text} />
            </div>
          </div>
        ) : it.kind === "steps" ? (
          <Steps key={it.key} steps={it.steps} />
        ) : (
          <div key={it.key} className="self-start max-w-[92%] rounded-2xl border border-bad/30 bg-bad/5 px-4 py-2.5 text-sm">
            <div className="font-medium text-bad">{plainError(it.text).message}</div>
            <div className="text-muted mt-0.5">{plainError(it.text).hint}</div>
          </div>
        )
      )}
      {live && (
        <div className="flex items-center gap-2 text-[12.5px] text-running pl-2">
          <span className="w-1.5 h-1.5 rounded-full bg-running live-dot" />
          {lastStep ? `Working: ${stepLabel(lastStep)}` : "Getting started"}
        </div>
      )}
    </div>
  );
}
