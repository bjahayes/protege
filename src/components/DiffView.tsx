"use client";

import { apiFetch } from "@/lib/api-client";
import UnsavedNotice from "./UnsavedNotice";
import { useEffect, useState } from "react";
import type { JobDiff, DiffFile } from "@/lib/types";
import MarkdownView from "./MarkdownView";

export default function DiffView({
  jobId,
  worktreeState,
  onChanged,
}: {
  jobId: string;
  worktreeState: string;
  onChanged?: () => void;
}) {
  const [diff, setDiff] = useState<JobDiff | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"" | "apply" | "discard">("");
  const [msg, setMsg] = useState<string | null>(null);
  const [unsaved, setUnsaved] = useState<{ message: string; files?: string[] } | null>(null);
  const [state, setState] = useState(worktreeState);
  const [oracle, setOracle] = useState<{ loading: boolean; text: string } | null>(null);
  const [checks, setChecks] = useState<{ loading: boolean; result?: any } | null>(null);

  const load = () => {
    setLoading(true);
    apiFetch(`/api/jobs/${jobId}/diff`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setDiff(j.diff))
      .catch(() => setDiff(null))
      .finally(() => setLoading(false));
  };

  useEffect(load, [jobId]);

  const apply = async (saveFirst = false) => {
    setBusy("apply");
    setMsg(null);
    const r = await apiFetch(`/api/jobs/${jobId}/apply`, { method: "POST", body: JSON.stringify({ saveFirst }) });
    const j = await r.json().catch(() => ({ ok: false, message: "Something went wrong applying the change." }));
    if (j.ok) {
      setUnsaved(null);
      setMsg(j.message);
      setState("applied");
      onChanged?.();
    } else if (j.code === "unsaved") setUnsaved({ message: j.message, files: j.files });
    else setMsg(j.message);
    setBusy("");
  };

  const runOracle = async () => {
    setOracle({ loading: true, text: "" });
    try {
      const r = await apiFetch(`/api/jobs/${jobId}/oracle`, { method: "POST" });
      const j = await r.json();
      setOracle({ loading: false, text: j.review || j.error || "No review." });
    } catch (e: any) {
      setOracle({ loading: false, text: String(e?.message || e) });
    }
  };

  const runChecks = async () => {
    setChecks({ loading: true });
    try {
      const r = await apiFetch(`/api/jobs/${jobId}/verify`, { method: "POST" });
      const j = await r.json();
      setChecks({ loading: false, result: j });
    } catch (e: any) {
      setChecks({ loading: false, result: { error: String(e?.message || e) } });
    }
  };

  const discard = async () => {
    if (!confirm("Discard this worktree and its branch? The agent's changes will be deleted.")) return;
    setBusy("discard");
    setMsg(null);
    const r = await apiFetch(`/api/jobs/${jobId}/discard`, { method: "POST" });
    const j = await r.json();
    setMsg(j.message);
    setState("discarded");
    onChanged?.();
    setBusy("");
  };

  if (loading) return <div className="text-muted text-sm py-6">Loading diff…</div>;
  if (!diff) return <div className="text-muted text-sm py-6">No diff available.</div>;

  if (state === "applied") {
    return <div className="text-good text-sm py-6">✓ Changes applied to the project. {msg}</div>;
  }
  if (state === "discarded") {
    return <div className="text-muted text-sm py-6">Worktree discarded.</div>;
  }
  if (!diff.available) {
    return <div className="text-muted text-sm py-6">{diff.reason || "No diff available."}</div>;
  }
  if (diff.files.length === 0) {
    return (
      <div className="py-6">
        <div className="text-muted text-sm mb-3">The agent made no file changes in its worktree.</div>
        <button onClick={discard} className="px-3 py-1.5 rounded-lg border border-border text-sm text-muted hover:text-text">
          Clean up worktree
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {unsaved && <UnsavedNotice message={unsaved.message} files={unsaved.files} busy={busy === "apply"} onSaveAndKeep={() => apply(true)} />}
      <div className="flex items-center justify-between gap-3 pb-2.5 mb-2.5 border-b border-border">
        <div className="text-xs text-muted">
          <span className="font-mono">{diff.branch}</span> · {diff.files.length} file
          {diff.files.length > 1 ? "s" : ""} ·{" "}
          <span className="text-good">+{diff.totalAdditions}</span>{" "}
          <span className="text-bad">−{diff.totalDeletions}</span>
        </div>
        <div className="flex items-center gap-2">
          {msg && <span className="text-[11px] text-warn max-w-xs truncate">{msg}</span>}
          <button
            onClick={runChecks}
            disabled={!!checks?.loading}
            className="px-2.5 py-1 rounded-lg border border-border text-muted hover:text-text hover:border-accent/40 text-xs font-medium disabled:opacity-50"
            title="Run the project's test/build command against these changes"
          >
            {checks?.loading ? "Checking…" : "✓ Run checks"}
          </button>
          <button
            onClick={runOracle}
            disabled={!!oracle?.loading}
            className="px-2.5 py-1 rounded-lg border border-running/40 text-running hover:bg-running/10 text-xs font-medium disabled:opacity-50"
            title="A fresh agent reviews this diff for bugs and risks"
          >
            {oracle?.loading ? "Reviewing…" : "🔎 Oracle review"}
          </button>
          <button
            onClick={discard}
            disabled={!!busy}
            className="px-2.5 py-1 rounded-lg border border-bad/40 text-bad hover:bg-bad/10 text-xs font-medium disabled:opacity-50"
          >
            {busy === "discard" ? "…" : "Discard"}
          </button>
          <button
            onClick={() => apply()}
            disabled={!!busy}
            className="px-3 py-1 rounded-lg bg-good/15 border border-good/40 text-good hover:bg-good/25 text-xs font-semibold disabled:opacity-50"
          >
            {busy === "apply" ? "Applying…" : "✓ Apply to project"}
          </button>
        </div>
      </div>

      {(checks || oracle) && (
        <div className="space-y-2 mb-2.5 shrink-0 max-h-[40%] overflow-y-auto">
          {checks && (
            <div
              className={`rounded-lg border p-2.5 text-xs ${
                checks.loading
                  ? "border-border"
                  : checks.result?.available === false
                  ? "border-border"
                  : checks.result?.passed
                  ? "border-good/30 bg-good/5"
                  : "border-bad/30 bg-bad/5"
              }`}
            >
              {checks.loading ? (
                <span className="text-muted">Running checks…</span>
              ) : checks.result?.available === false ? (
                <span className="text-muted">{checks.result.reason}</span>
              ) : (
                <div>
                  <div className={checks.result?.passed ? "text-good font-medium" : "text-bad font-medium"}>
                    {checks.result?.passed ? "✓ Checks passed" : "✗ Checks failed"} —{" "}
                    <span className="font-mono">{checks.result?.command}</span> (exit {checks.result?.exitCode})
                  </div>
                  {checks.result?.output && (
                    <pre className="mt-1.5 text-[11px] font-mono text-muted whitespace-pre-wrap max-h-40 overflow-y-auto bg-bg rounded p-2">
                      {checks.result.output.slice(-4000)}
                    </pre>
                  )}
                </div>
              )}
            </div>
          )}
          {oracle && (
            <div className="rounded-lg border border-running/30 bg-running/5 p-3">
              <div className="text-[11px] uppercase tracking-wide text-running font-semibold mb-1">🔎 Oracle review</div>
              {oracle.loading ? (
                <span className="text-muted text-xs">A second agent is reading the diff…</span>
              ) : (
                <div className="text-xs">
                  <MarkdownView content={oracle.text} />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-1">
        {diff.files.map((f) => (
          <FilePatch key={f.path} f={f} />
        ))}
      </div>
    </div>
  );
}

const STATUS_LABEL: Record<string, string> = { A: "added", M: "modified", D: "deleted", R: "renamed" };

function FilePatch({ f }: { f: DiffFile }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-panel-2/60 hover:bg-panel-2 text-left"
      >
        <span className="text-muted text-xs">{open ? "▾" : "▸"}</span>
        <span className="font-mono text-xs truncate flex-1">{f.path}</span>
        <span className="text-[10px] text-muted">{STATUS_LABEL[f.status] || f.status}</span>
        <span className="text-[11px] text-good">+{f.additions}</span>
        <span className="text-[11px] text-bad">−{f.deletions}</span>
      </button>
      {open && f.patch && (
        <pre className="text-[11px] font-mono overflow-x-auto bg-[#0d1117] leading-relaxed">
          {f.patch.split("\n").map((line, i) => (
            <DiffLine key={i} line={line} />
          ))}
        </pre>
      )}
    </div>
  );
}

function DiffLine({ line }: { line: string }) {
  let cls = "text-muted/80";
  let bg = "";
  if (line.startsWith("+") && !line.startsWith("+++")) {
    cls = "text-good";
    bg = "bg-good/10";
  } else if (line.startsWith("-") && !line.startsWith("---")) {
    cls = "text-bad";
    bg = "bg-bad/10";
  } else if (line.startsWith("@@")) {
    cls = "text-accent";
  } else if (line.startsWith("diff ") || line.startsWith("index ") || line.startsWith("+++") || line.startsWith("---")) {
    cls = "text-muted/50";
  }
  return <div className={`px-3 ${cls} ${bg} whitespace-pre`}>{line || " "}</div>;
}
