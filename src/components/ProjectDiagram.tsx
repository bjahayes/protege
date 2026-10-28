"use client";

// "How it fits together": one diagram of the project, shown two ways. Parts are the boxes with
// how far along each one is (the same diagram as the simple view); Flowchart is the assessment's
// flowchart of how the pieces call each other. The person's choice is remembered.

import { useEffect, useState } from "react";
import type { Assessment } from "@/lib/assessment";
import PartsMap from "./simple/PartsMap";
import Mermaid from "./Mermaid";

type View = "parts" | "flow";
const KEY = "protege.diagram.view";

export default function ProjectDiagram({ assessment, heading = "h2" }: { assessment: Assessment; heading?: "h2" | "h3" }) {
  const hasParts = !!assessment.components?.length;
  const hasFlow = !!assessment.architecture?.mermaid;
  const [view, setView] = useState<View>("parts");
  useEffect(() => {
    try {
      if (localStorage.getItem(KEY) === "flow") setView("flow");
    } catch {}
  }, []);
  if (!hasParts && !hasFlow) return null;
  const shown: View = view === "flow" && hasFlow ? "flow" : hasParts ? "parts" : "flow";
  const pick = (v: View) => {
    setView(v);
    try {
      localStorage.setItem(KEY, v);
    } catch {}
  };
  const H = heading;

  return (
    <section>
      <div className="flex items-end justify-between gap-3 flex-wrap mb-2">
        <H className="text-sm font-semibold text-muted">How it fits together</H>
        {hasParts && hasFlow && (
          <div className="flex rounded-lg border border-border overflow-hidden text-[12px]" role="tablist">
            {(
              [
                ["parts", "Parts"],
                ["flow", "Flowchart"],
              ] as [View, string][]
            ).map(([k, label]) => (
              <button
                key={k}
                role="tab"
                aria-selected={shown === k}
                onClick={() => pick(k)}
                className={`px-3 py-1 ${shown === k ? "bg-panel-2 text-text" : "text-muted hover:text-text"}`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
      {assessment.architecture?.description && (
        <p className="text-[12.5px] text-muted mb-3 leading-relaxed max-w-prose">{assessment.architecture.description}</p>
      )}
      {shown === "parts" ? (
        <div className="rounded-xl border border-border bg-panel p-5">
          <PartsMap assessment={assessment} />
        </div>
      ) : (
        <Mermaid chart={assessment.architecture!.mermaid!} />
      )}
    </section>
  );
}
