"use client";

// Simple home: every task Protégé is working on right now, with its stage.

import { apiFetch } from "@/lib/api-client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { Job } from "@/lib/types";
import { STAGES, ownWords } from "@/lib/live-build";

const CHANGE = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);

function roughStage(j: Job): number {
  if (j.status === "idle") return 4;
  const t = j.currentTool || "";
  if (CHANGE.has(t)) return 2;
  if (t) return 1;
  return 0;
}

export default function LiveStrip() {
  const [live, setLive] = useState<Job[] | null>(null);
  useEffect(() => {
    let stop = false;
    const load = () =>
      apiFetch("/api/jobs", { cache: "no-store" })
        .then((r) => r.json())
        .then((j) => !stop && setLive((j.live || [])))
        .catch(() => {});
    load();
    const t = setInterval(load, 3000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, []);

  // Shown only while something is running: an empty "nothing is running" card is clutter.
  if (!live?.length) return null;
  return (
    <div className="rounded-2xl border border-border bg-panel p-5">
      <div className="text-[15px] font-semibold">Being built right now</div>
      {(
        <div className="mt-3 flex flex-col divide-y divide-border">
          {live.map((j) => {
            const s = roughStage(j);
            return (
              <Link key={j.id} href={`/simple/project/${j.projectId}`} className="py-3 first:pt-0 last:pb-0 block hover:opacity-90">
                <div className="flex items-baseline justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="text-[12px] text-muted">{j.projectName}</div>
                    <div className="text-sm font-semibold truncate">
                      {j.kind === "assess" ? "Drawing a map of the project" : j.kind === "plan" ? `Planning: ${ownWords(j.prompt)}` : ownWords(j.prompt)}
                    </div>
                  </div>
                  <div className={`text-[12px] ${j.status === "idle" ? "text-accent" : "text-running"}`}>{j.status === "idle" ? "Waiting for you" : STAGES[s]}</div>
                </div>
                <div className="grid grid-cols-5 gap-1.5 mt-2">
                  {STAGES.map((_, i) => (
                    <span key={i} className={`h-1.5 rounded-full ${i < s ? "bg-running/45" : i === s ? "bg-running live-dot" : "bg-panel-2"}`} />
                  ))}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
