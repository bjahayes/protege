"use client";

import { useEffect, useState, useCallback } from "react";
import { timeAgo } from "@/lib/format";
import type { CheckpointMeta } from "@/lib/checkpoints";

export default function CheckpointsPanel({ projectId, onRestore }: { projectId: string; onRestore: () => void }) {
  const [list, setList] = useState<CheckpointMeta[]>([]);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/projects/${projectId}/checkpoints`, { cache: "no-store" });
      const j = await r.json();
      setList(j.checkpoints || []);
    } catch {
      /* ignore */
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const post = async (body: any) => {
    setBusy(true);
    const r = await fetch(`/api/projects/${projectId}/checkpoints`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await r.json();
    if (j.checkpoints) setList(j.checkpoints);
    setBusy(false);
    return j;
  };

  const save = async () => {
    await post({ id: String(Date.now()), name: name.trim() || undefined });
    setName("");
    setSaving(false);
  };

  const restore = async (id: string) => {
    if (!confirm("Restore this checkpoint? It overwrites your current DESIGN/PLAN/CLAUDE/tasks/status/assessment.")) return;
    await post({ action: "restore", checkpointId: id });
    onRestore();
  };

  const del = async (id: string) => {
    if (!confirm("Delete this checkpoint?")) return;
    await post({ action: "delete", checkpointId: id });
  };

  const exportCp = async (id: string, cpName: string) => {
    const r = await fetch(`/api/projects/${projectId}/checkpoints?export=${id}`, { cache: "no-store" });
    const data = await r.json();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${cpName.replace(/[^a-z0-9]+/gi, "-")}-${id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold text-muted">Checkpoints</h2>
        {saving ? (
          <div className="flex items-center gap-1.5">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && save()}
              placeholder="name (optional)"
              autoFocus
              className="px-2 py-1 rounded bg-bg border border-border text-xs w-40 focus:outline-none focus:border-accent/60"
            />
            <button onClick={save} disabled={busy} className="text-xs text-accent hover:underline">
              Save
            </button>
            <button onClick={() => setSaving(false)} className="text-xs text-muted hover:text-text">
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setSaving(true)}
            className="text-xs px-2.5 py-1 rounded-lg border border-border text-muted hover:text-text hover:border-accent/40"
          >
            + Save checkpoint
          </button>
        )}
      </div>
      <p className="text-[11px] text-muted mb-2">
        Snapshot this project&apos;s docs, plan, tasks and assessment — restore or export them later.
      </p>
      {list.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-6 text-center text-xs text-muted">
          No checkpoints yet.
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-panel divide-y divide-border">
          {list.map((c) => (
            <div key={c.id} className="flex items-center gap-3 px-4 py-2.5">
              <div className="min-w-0">
                <div className="text-sm truncate">{c.name}</div>
                <div className="text-[11px] text-muted">
                  {timeAgo(c.createdAt)} · {c.files.length} files
                </div>
              </div>
              <div className="ml-auto flex items-center gap-2 text-[11px] shrink-0">
                <button onClick={() => restore(c.id)} className="text-accent hover:underline">
                  restore
                </button>
                <button onClick={() => exportCp(c.id, c.name)} className="text-muted hover:text-text">
                  export
                </button>
                <button onClick={() => del(c.id)} className="text-muted hover:text-bad">
                  delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
