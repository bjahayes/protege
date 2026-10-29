"use client";

// A task's run as one bar: blue while it reads, green while it changes files, violet (slate blue in Paper) while it
// runs steps, red for problems, each stretch as long as it took. Tapping a stretch shows what
// happened in it. Stripes of violet and red mean it's going round in circles.

import { useEffect, useState } from "react";
import type { JobEvent } from "@/lib/types";
import { REPLAY_KINDS, replaySegments, replayTotals, plainDuration, goingInCircles, workingTime, type ReplayKind } from "@/lib/replay";

const FILL: Record<ReplayKind, string> = {
  reading: "bg-accent/55",
  changing: "bg-good/80",
  // Violet: apart from reading (blue), changing (green) and problems (red), and not a warning colour.
  // Paper alone draws it in its muted slate blue (replay-running in globals.css).
  running: "replay-running bg-violet-400/75",
  problem: "bg-bad",
};

export default function ReplayStrip({
  events,
  startedAt,
  endedAt,
  live,
  stage,
  onInteract,
}: {
  events: JobEvent[];
  startedAt: number;
  endedAt?: number;
  live: boolean;
  /** Where the task is up to, in words, shown before the time. */
  stage: string;
  /** The person opened a stretch: the panel stops following the task. */
  onInteract?: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [open, setOpen] = useState<number | null>(null);
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [live]);

  const lastTs = events.length ? events[events.length - 1].ts : startedAt;
  const end = live ? now : endedAt || lastTs;
  const segs = replaySegments(events, end);
  const totals = replayTotals(segs);
  const circles = live && goingInCircles(segs);
  const sel = open != null ? segs[open] : null;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-[12px] mb-1.5">
        <span className={live ? "text-running font-semibold" : "text-text/90 font-medium"}>{stage}</span>
        {/* Live: time since it started. Afterwards: the time it spent working, without long idle gaps. */}
        <span className="text-muted tabular-nums shrink-0">{plainDuration(live ? end - startedAt : workingTime(segs))}</span>
      </div>
      {segs.length === 0 ? (
        <div className={`h-3.5 rounded bg-panel-2 ${live ? "live-dot" : ""}`} />
      ) : (
        <div className="flex h-3.5 rounded overflow-hidden gap-px" role="list" aria-label="How the run went, stretch by stretch">
          {segs.map((s, i) => {
            const k = REPLAY_KINDS.find((x) => x.kind === s.kind)!;
            return (
              <button
                key={i}
                role="listitem"
                onClick={() => {
                  setOpen(open === i ? null : i);
                  onInteract?.();
                }}
                title={`${k.label}, ${plainDuration(s.end - s.start)}`}
                aria-label={`${k.label}, ${plainDuration(s.end - s.start)}`}
                aria-pressed={open === i}
                className={`${FILL[s.kind]} min-w-[4px] hover:opacity-80 ${open === i ? "outline outline-2 outline-text -outline-offset-2" : ""} ${
                  live && i === segs.length - 1 ? "live-dot" : ""
                }`}
                style={{ flex: `${Math.max(1, s.end - s.start)} 1 0` }}
              />
            );
          })}
        </div>
      )}
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-[11px] text-muted">
        {REPLAY_KINDS.filter((k) => totals[k.kind] > 0 || segs.some((s) => s.kind === k.kind)).map((k) => (
          <span key={k.kind} className="inline-flex items-center gap-1.5" title={k.means}>
            <span className={`w-2.5 h-2.5 rounded-sm ${FILL[k.kind]}`} />
            {k.label} <span className="tabular-nums">{plainDuration(totals[k.kind])}</span>
          </span>
        ))}
      </div>
      {circles && (
        <p className="mt-2 text-[12px] text-warn leading-snug">
          It may be going round in circles: problems keep coming back. You can stop it and ask a different way.
        </p>
      )}
      {sel && (
        <div className="mt-2.5 rounded-lg border border-border bg-panel-2/60 px-3 py-2">
          <div className="text-[12px] font-medium">
            {REPLAY_KINDS.find((x) => x.kind === sel.kind)!.label} for {plainDuration(sel.end - sel.start)}
          </div>
          <ul className="mt-1 space-y-0.5 text-[12px] text-muted">
            {sel.steps.slice(0, 8).map((s, i) => (
              <li key={i}>· {s}</li>
            ))}
            {sel.steps.length > 8 && <li>· and {sel.steps.length - 8} more steps</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
