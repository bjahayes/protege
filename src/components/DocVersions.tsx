"use client";

// A project document with its versions: which version this is and who made it, every earlier
// version to read or put back, and a button for the agent that keeps the document up to date.

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import MarkdownView from "./MarkdownView";
import type { DocVersion } from "@/lib/doc-versions";

export default function DocVersions({
  projectId,
  file,
  content,
  agent,
  onChanged,
  empty,
}: {
  projectId: string;
  file: string;
  content: string | null;
  /** The agent that keeps this document. */
  agent?: { id: string; name: string };
  onChanged: () => void;
  /** Shown instead of the document when it doesn't exist yet. */
  empty?: React.ReactNode;
}) {
  const [versions, setVersions] = useState<DocVersion[]>([]);
  const [open, setOpen] = useState(false);
  const [viewing, setViewing] = useState<{ n: number; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const q = `/api/projects/${projectId}/versions?file=${encodeURIComponent(file)}`;

  const load = useCallback(() => {
    apiFetch(q, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setVersions(j.versions || []))
      .catch(() => {});
  }, [q]);
  useEffect(() => load(), [load, content]);

  const latest = versions[versions.length - 1];
  const view = async (n: number) => {
    const r = await apiFetch(`${q}&n=${n}`, { cache: "no-store" });
    const j = await r.json();
    setViewing({ n, text: j.text ?? "" });
  };
  const restore = async (n: number) => {
    if (!confirm(`Put version ${n} of ${file} back? The current version is kept, so you can return to it.`)) return;
    await apiFetch(`/api/projects/${projectId}/versions`, { method: "POST", body: JSON.stringify({ file, n }) });
    setViewing(null);
    load();
    onChanged();
  };
  const runAgent = async () => {
    if (!agent) return;
    setBusy(true);
    setError(null);
    const r = await apiFetch(`/api/agents/${agent.id}/run`, { method: "POST", body: JSON.stringify({ projectId }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (j.job?.id) window.location.href = `/agents?job=${j.job.id}`;
    else setError(j.error || "Couldn't start the agent.");
  };

  return (
    <div className="max-w-4xl">
      <div className="flex items-center gap-3 flex-wrap mb-3 text-[12.5px]">
        <span className="font-mono text-[12px]">{file}</span>
        {latest ? (
          <span className="text-muted">
            Version {latest.n} of {versions.length}: {latest.agentId ? `made by ${latest.by}` : latest.by},{" "}
            {new Date(latest.at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
          </span>
        ) : null}
        {versions.length > 0 && (
          <button onClick={() => setOpen(!open)} className="text-accent hover:underline">
            {open ? "Hide versions" : `All ${versions.length} ${versions.length === 1 ? "version" : "versions"}`}
          </button>
        )}
        {agent && (
          <button
            onClick={runAgent}
            disabled={busy}
            className="ml-auto px-3 py-1.5 rounded-lg bg-accent/15 border border-accent/40 text-accent hover:bg-accent/25 font-medium disabled:opacity-50"
          >
            {busy ? "Starting…" : `▶ ${agent.name}`}
          </button>
        )}
      </div>
      {error && <div className="text-[12.5px] text-bad mb-2">{error}</div>}

      {open && (
        <div className="rounded-xl border border-border bg-panel divide-y divide-border mb-4">
          {[...versions].reverse().map((v) => (
            <div key={v.n} className={`flex items-center gap-3 px-4 py-2 text-[12.5px] ${viewing?.n === v.n ? "bg-panel-2" : ""}`}>
              <span className="font-medium w-20 shrink-0">Version {v.n}</span>
              <span className="flex-1 min-w-0 truncate text-muted" title={v.by}>
                {v.by}
                {v.agentVersion ? ` (agent version ${v.agentVersion})` : ""}
              </span>
              <span className="text-muted shrink-0">{new Date(v.at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</span>
              <button onClick={() => view(v.n)} className="text-accent hover:underline shrink-0">
                Read
              </button>
              {v.n !== latest?.n && (
                <button onClick={() => restore(v.n)} className="text-accent hover:underline shrink-0">
                  Put back
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {viewing ? (
        <div className="rounded-xl border border-accent/40 bg-panel p-6">
          <div className="flex items-center gap-3 mb-4 text-[12.5px]">
            <span className="font-semibold">Reading version {viewing.n}</span>
            {viewing.n !== latest?.n && (
              <button onClick={() => restore(viewing.n)} className="text-accent hover:underline">
                Put this version back
              </button>
            )}
            <button onClick={() => setViewing(null)} className="ml-auto text-muted hover:text-text">
              Back to the current version
            </button>
          </div>
          <MarkdownView content={viewing.text} />
        </div>
      ) : content ? (
        <div className="rounded-xl border border-border bg-panel p-6">
          <MarkdownView content={content} />
        </div>
      ) : (
        empty
      )}
    </div>
  );
}
