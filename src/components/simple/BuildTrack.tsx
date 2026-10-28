"use client";

// The five-stage track and "what is changing" summary for a running (or just finished) task.

import { STAGES, type Touched } from "@/lib/live-build";

export default function BuildTrack({
  stage,
  live,
  decision,
  touched,
  parts,
}: {
  stage: number;
  live: boolean;
  decision: boolean;
  touched: Touched[];
  parts: string[];
}) {
  const labels = STAGES.map((s, i) => (i === 4 && !decision ? "Finished" : s));
  return (
    <div>
      <div className="grid grid-cols-5 gap-1.5" role="img" aria-label={`Stage ${stage + 1} of 5: ${labels[stage]}`}>
        {labels.map((s, i) => (
          <div key={s} className={`flex flex-col gap-1.5 text-[11px] leading-tight ${i === stage ? "text-accent font-semibold" : "text-muted"}`}>
            <span
              className={`h-1.5 rounded-full ${
                i < stage ? "bg-accent/55" : i === stage ? `bg-accent ${live ? "live-dot" : ""}` : "bg-panel-2"
              }`}
            />
            {s}
          </div>
        ))}
      </div>

      {(parts.length > 0 || touched.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          {parts.length > 0 && (
            <div className="min-w-0">
              <div className="text-xs font-semibold text-muted mb-1.5">Parts being changed</div>
              <div className="flex flex-col gap-1.5">
                {parts.map((p) => (
                  <div key={p} className="flex items-center gap-2 text-sm px-2.5 py-1.5 rounded-lg border border-border bg-panel-2">
                    <span className="w-2 h-2 rounded-full bg-accent shrink-0" />
                    <span className="truncate">{p}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {touched.length > 0 && (
            <div className="min-w-0">
              <div className="text-xs font-semibold text-muted mb-1.5">Files changed so far</div>
              <div className="rounded-lg border border-border divide-y divide-border">
                {touched.slice(0, 12).map((t) => (
                  <div key={t.rel} className="flex items-center justify-between gap-3 px-2.5 py-1.5 text-[12px]">
                    <span className="font-mono truncate min-w-0">{t.rel}</span>
                    <span className="shrink-0 tabular-nums text-muted">
                      {t.created ? <span className="text-good">new file</span> : null}
                      {!t.created && (
                        <>
                          <span className="text-good">+{t.added}</span> <span className="text-bad">−{t.removed}</span>
                        </>
                      )}
                    </span>
                  </div>
                ))}
              </div>
              <div className="text-[11px] text-muted mt-1">Line counts are approximate until the run finishes.</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
