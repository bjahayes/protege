"use client";

import { apiFetch } from "@/lib/api-client";
import UnsavedNotice from "./UnsavedNotice";
import { useEffect, useRef, useState } from "react";
import type { Job, JobDiff } from "@/lib/types";
import { plainActivity, plainError } from "@/lib/plain";
import MarkdownView from "./MarkdownView";

export default function SimpleRun({
  jobId,
  onFinished,
  onApplied,
}: {
  jobId: string;
  onFinished?: () => void;
  onApplied?: () => void;
}) {
  const [lines, setLines] = useState<string[]>([]);
  const [job, setJob] = useState<Job | null>(null);
  const [ended, setEnded] = useState(false);
  const [resultText, setResultText] = useState("");
  const [errorText, setErrorText] = useState("");
  const seen = useRef<string>("");

  useEffect(() => {
    const es = new EventSource(`/api/jobs/${jobId}/stream`);
    es.addEventListener("snapshot", (e) => setJob(JSON.parse((e as MessageEvent).data).job));
    es.addEventListener("event", (e) => {
      const ev = JSON.parse((e as MessageEvent).data);
      if (ev.type === "result") setResultText(ev.payload?.result || "");
      if (ev.type === "error") setErrorText(ev.payload?.message || "Something went wrong.");
      const phrase = plainActivity(ev);
      if (phrase && phrase !== seen.current && ["tool", "checks", "auto_fix", "result", "text"].includes(ev.type)) {
        seen.current = phrase;
        setLines((prev) => [...prev.slice(-6), phrase]);
      }
    });
    es.addEventListener("end", () => {
      setEnded(true);
      es.close();
      apiFetch(`/api/jobs/${jobId}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((j) => setJob(j.job))
        .catch(() => {});
      onFinished?.();
    });
    return () => es.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  const hasWorktree = job && job.worktreeState && job.worktreeState !== "none";

  if (!ended) {
    return (
      <div className="rounded-2xl border border-accent/25 bg-accent/5 p-6 text-center">
        <div className="text-3xl mb-3 live-dot">✧</div>
        <div className="text-base font-medium">Protégé is working on it…</div>
        <div className="text-sm text-accent mt-2 min-h-[20px]">{lines[lines.length - 1] || "Getting started"}</div>
        <div className="mt-4 flex flex-col items-center gap-1">
          {lines.slice(0, -1).map((l, i) => (
            <div key={i} className="text-[11px] text-muted">
              ✓ {l}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (errorText || job?.status === "error") {
    const pe = plainError(errorText || job?.error || "");
    return (
      <div className="rounded-2xl border border-bad/30 bg-bad/5 p-6">
        <div className="text-base font-medium text-bad mb-1">{pe.message}</div>
        <p className="text-sm text-muted">{pe.hint}</p>
        <p className="text-[11px] text-good mt-3">Nothing on your computer was changed.</p>
      </div>
    );
  }

  if (hasWorktree) {
    return <SimpleReview jobId={jobId} onFinished={onFinished} onApplied={onApplied} resultText={resultText} />;
  }

  return (
    <div className="rounded-2xl border border-good/30 bg-good/5 p-6">
      <div className="text-base font-medium text-good mb-2">✓ All done</div>
      {resultText ? (
        <div className="text-sm">
          <MarkdownView content={resultText} />
        </div>
      ) : (
        <p className="text-sm text-muted">Protégé finished the task.</p>
      )}
    </div>
  );
}

export function SimpleReview({
  jobId,
  resultText,
  onFinished,
  onApplied,
}: {
  jobId: string;
  resultText: string;
  onFinished?: () => void;
  onApplied?: () => void;
}) {
  const [diff, setDiff] = useState<JobDiff | null>(null);
  const [state, setState] = useState<"review" | "applied" | "discarded" | "busy">("review");
  const [unsaved, setUnsaved] = useState<{ message: string; files?: string[] } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch(`/api/jobs/${jobId}/diff`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setDiff(j.diff))
      .catch(() => setDiff(null));
  }, [jobId]);

  const apply = async (saveFirst = false) => {
    setState("busy");
    setError("");
    const r = await apiFetch(`/api/jobs/${jobId}/apply`, { method: "POST", body: JSON.stringify({ saveFirst }) });
    const j = await r.json().catch(() => ({ ok: false, message: "Something went wrong keeping the change." }));
    setState(j.ok ? "applied" : "review");
    if (j.ok) {
      setUnsaved(null);
      onApplied?.();
      onFinished?.();
    } else if (j.code === "unsaved") setUnsaved({ message: j.message, files: j.files });
    else setError(j.message || "The change couldn't be kept.");
  };
  const discard = async () => {
    if (!confirm("Throw away these changes? This can't be undone.")) return;
    setState("busy");
    await apiFetch(`/api/jobs/${jobId}/discard`, { method: "POST" });
    setState("discarded");
    onFinished?.();
  };

  if (state === "applied")
    return <div className="rounded-2xl border border-good/30 bg-good/5 p-6 text-good text-base font-medium">✓ Kept the changes.</div>;
  if (state === "discarded")
    return <div className="rounded-2xl border border-border bg-panel p-6 text-muted text-sm">The changes were thrown away — nothing was kept.</div>;

  // Hide internal metadata (the checklist file etc.) — show only real content changes.
  const files = (diff?.files || []).filter((f) => !/^\.(protege|buildwork)\//.test(f.path.replace(/\\/g, "/")));
  return (
    <div className="rounded-2xl border border-border bg-panel p-6">
      <div className="text-base font-medium mb-1">Protégé made some changes</div>
      {resultText && <p className="text-sm text-muted mb-3 leading-relaxed">{resultText.split("\n")[0]}</p>}

      {!diff ? (
        <div className="text-sm text-muted">Preparing a summary…</div>
      ) : files.length === 0 ? (
        <p className="text-sm text-muted">It didn&apos;t end up changing anything.</p>
      ) : (
        <>
          <div className="text-sm text-muted mb-2">It changed {files.length} file{files.length > 1 ? "s" : ""}:</div>
          <div className="rounded-xl border border-border divide-y divide-border mb-4">
            {files.slice(0, 20).map((f) => (
              <div key={f.path} className="px-3 py-2 flex items-center justify-between gap-3 text-sm">
                <span className="font-mono text-xs truncate">{f.path}</span>
                <span className="text-[11px] text-muted shrink-0">
                  {f.status === "A" ? "new file" : f.status === "D" ? "removed" : `${f.additions} added, ${f.deletions} removed`}
                </span>
              </div>
            ))}
          </div>
          {unsaved && <UnsavedNotice message={unsaved.message} files={unsaved.files} busy={state === "busy"} onSaveAndKeep={() => apply(true)} />}
          {error && <p className="text-sm text-bad mb-3">{error}</p>}
          <div className="flex items-center gap-3">
            <button
              onClick={() => apply()}
              disabled={state === "busy"}
              className="px-4 py-2.5 rounded-xl bg-good/15 border border-good/40 text-good hover:bg-good/25 text-sm font-semibold disabled:opacity-50"
            >
              ✓ Keep these changes
            </button>
            <button
              onClick={discard}
              disabled={state === "busy"}
              className="px-4 py-2.5 rounded-xl border border-border text-muted hover:text-bad hover:border-bad/40 text-sm disabled:opacity-50"
            >
              Throw them away
            </button>
          </div>
        </>
      )}
    </div>
  );
}
