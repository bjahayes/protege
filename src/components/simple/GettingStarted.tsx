"use client";

// The getting-started workflow for a project made in Start something new: the five steps,
// where the project is up to, what to do now, and one button for the next step.

import Link from "next/link";
import type { Job } from "@/lib/types";
import { STEPS, starterProgress, type StarterInfo, type StepKey, type StepState } from "@/lib/starter-steps";

/** The five steps in a row. `states` comes from starterProgress; pass `upTo` to show the start. */
export function StepTrack({ states, upTo }: { states?: Record<StepKey, StepState>; upTo?: StepKey }) {
  const at = upTo ? STEPS.findIndex((s) => s.key === upTo) : -1;
  return (
    <ol className="flex flex-wrap gap-x-1 gap-y-2 text-[12.5px]" aria-label="Steps to get started">
      {STEPS.map((s, i) => {
        const st: StepState = states ? states[s.key] : i < at ? "done" : i === at ? "current" : "todo";
        const tone =
          st === "done"
            ? "border-good/40 text-good bg-good/5"
            : st === "current"
              ? "border-accent text-accent bg-accent/10 font-medium"
              : st === "problem"
                ? "border-warn/50 text-warn bg-warn/5 font-medium"
                : "border-border text-muted";
        return (
          <li key={s.key} className="flex items-center gap-1">
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${tone}`} aria-current={st === "current" ? "step" : undefined}>
              <span className="tabular-nums">{st === "done" ? "✓" : st === "skipped" ? "–" : i + 1}</span>
              {s.title}
              {st === "skipped" && <span className="text-[11px] opacity-80">(skipped)</span>}
            </span>
            {i < STEPS.length - 1 && <span className="text-muted/50">›</span>}
          </li>
        );
      })}
    </ol>
  );
}

export default function GettingStarted({
  projectId,
  name,
  starter,
  jobs,
  gitRepo,
  changeOpen,
  onAskForChange,
  onRetryShape,
  onDismiss,
}: {
  projectId: string;
  name: string;
  starter: StarterInfo;
  jobs: Job[];
  gitRepo: boolean;
  /** The change box is open below, so step 5 points at it instead of repeating its ideas. */
  changeOpen?: boolean;
  /** Open the change box, optionally filled in with an idea. */
  onAskForChange: (idea?: string) => void;
  onRetryShape: () => void;
  onDismiss: () => void;
}) {
  const { states, current, buildJob } = starterProgress(starter, jobs);
  const tryButton = (
    <Link
      href={`/simple/preview/${projectId}`}
      className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-good/15 border border-good/40 text-good hover:bg-good/25 text-sm font-semibold"
    >
      ▶ Try it
    </Link>
  );

  let now: React.ReactNode;
  if (current === "shape" && states.shape !== "problem") {
    now = (
      <p className="text-sm leading-relaxed">
        Protégé is shaping <b>{name}</b> from what you said
        {starter.description ? <> (“{starter.description}”)</> : null}. You can watch it work just below; it usually takes a
        minute or two. When it&apos;s finished, the next step is to try it.
      </p>
    );
  } else if (current === "shape") {
    now = (
      <>
        <p className="text-sm leading-relaxed">
          Shaping it from your description didn&apos;t finish ({buildJob?.status === "stopped" ? "it was stopped" : "it ran into a problem"}). You can
          ask again, or try the starter as it is and change it from there.
        </p>
        <div className="flex flex-wrap gap-2 mt-3">
          <button
            onClick={onRetryShape}
            className="px-4 py-2.5 rounded-xl bg-accent/20 border border-accent/40 text-accent hover:bg-accent/30 text-sm font-semibold"
          >
            Ask again
          </button>
          {tryButton}
        </div>
      </>
    );
  } else if (current === "try") {
    now = (
      <>
        <p className="text-sm leading-relaxed">
          <b>{name}</b> is ready. Open it and use it the way you would for real; notice what you&apos;d want to be different.
          That&apos;s what you&apos;ll ask for next.
        </p>
        <div className="mt-3">{tryButton}</div>
      </>
    );
  } else if (current === "change" && changeOpen) {
    now = (
      <p className="text-sm leading-relaxed">
        Write the change you&apos;d like in the box below, or pick one of the ideas under it, then press Start.{" "}
        {gitRepo
          ? "Protégé makes the change on a safe copy and shows you before anything is kept."
          : "Protégé changes the files directly, and you can undo it from History."}
      </p>
    );
  } else if (current === "change") {
    now = (
      <>
        <p className="text-sm leading-relaxed">
          What would you change? Ask for one thing at a time, in plain words.{" "}
          {gitRepo
            ? "Protégé makes the change on a safe copy and shows you before anything is kept."
            : "Protégé changes the files directly, and you can undo it from History."}
        </p>
        {!!starter.ideas?.length && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            <span className="text-[12px] text-muted self-center mr-1">Some ideas:</span>
            {starter.ideas.map((idea) => (
              <button
                key={idea}
                onClick={() => onAskForChange(idea)}
                className="text-[12px] px-2.5 py-1 rounded-lg border border-border text-text/90 hover:border-accent/50"
              >
                {idea}
              </button>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-2 mt-3">
          <button
            onClick={() => onAskForChange()}
            className="px-4 py-2.5 rounded-xl bg-accent/20 border border-accent/40 text-accent hover:bg-accent/30 text-sm font-semibold"
          >
            ✍️ Ask for a change
          </button>
          {states.try === "done" && tryButton}
        </div>
      </>
    );
  } else {
    now = (
      <p className="text-sm leading-relaxed">
        You&apos;re set up. That&apos;s the whole cycle: try it, ask for a change, keep what you like. Keep going whenever you want;
        everything Protégé does is listed under History, and you can undo a change you kept.
      </p>
    );
  }

  return (
    <section className="mt-5 rounded-2xl border border-accent/30 bg-accent/5 p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <h2 className="text-sm font-semibold">Getting started with {name}</h2>
        <button onClick={onDismiss} className="text-[12px] text-muted hover:text-text shrink-0">
          Hide these steps
        </button>
      </div>
      <StepTrack states={states} />
      <div className="mt-4">
        <div className="text-[11px] uppercase tracking-[0.08em] text-muted font-semibold mb-1.5">{current ? "Now" : "Done"}</div>
        {now}
      </div>
    </section>
  );
}
