"use client";

import { useEffect, useState } from "react";
import type { RepoMap, RepoFile } from "@/lib/repomap";

const KIND_COLOR: Record<string, string> = {
  function: "#5b9dff",
  func: "#5b9dff",
  fn: "#5b9dff",
  class: "#a371f7",
  type: "#d29922",
  const: "#3fb950",
};

export default function RepoMapView({ projectId }: { projectId: string }) {
  const [map, setMap] = useState<RepoMap | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/projects/${projectId}/repomap`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => (j.error ? setErr(j.error) : setMap(j.map)))
      .catch((e) => setErr(String(e)))
      .finally(() => setLoading(false));
  }, [projectId]);

  if (loading) return <div className="text-muted text-sm py-6">Building code map…</div>;
  if (err) return <div className="text-muted text-sm py-6">Couldn&apos;t build a code map ({err}).</div>;
  if (!map || map.files.length === 0)
    return <div className="text-muted text-sm py-6">No source files found to map.</div>;

  const maxRank = map.files[0]?.rank || 1;

  return (
    <section>
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-semibold text-muted">Code map</h3>
        <div className="flex items-center gap-1.5">
          {map.languages.slice(0, 5).map((l) => (
            <span key={l.language} className="text-[10px] px-1.5 py-0.5 rounded border border-border text-muted">
              {l.language} {l.files}
            </span>
          ))}
        </div>
      </div>
      <p className="text-[11px] text-muted mb-3">
        The most central files, ranked by how much the rest of the code depends on them (import-graph PageRank).
        {map.truncated && " Large repo — a subset was scanned."} Computed instantly, no agent.
      </p>
      <div className="rounded-xl border border-border bg-panel divide-y divide-border">
        {map.files.slice(0, 40).map((f) => (
          <FileRow key={f.path} f={f} maxRank={maxRank} />
        ))}
      </div>
    </section>
  );
}

function FileRow({ f, maxRank }: { f: RepoFile; maxRank: number }) {
  const [open, setOpen] = useState(false);
  const pct = Math.max(3, (f.rank / maxRank) * 100);
  return (
    <div className="px-3 py-2">
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center gap-3 text-left">
        <div className="w-16 shrink-0">
          <div className="h-1.5 rounded-full bg-panel-2 overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-accent to-good" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <span className="font-mono text-xs truncate flex-1">{f.path}</span>
        <span className="text-[10px] text-muted shrink-0" title="imported by / imports">
          ↓{f.importedBy} ↑{f.imports} · {f.loc} loc
        </span>
        {f.symbols.length > 0 && <span className="text-muted text-xs shrink-0">{open ? "▾" : "▸"}</span>}
      </button>
      {f.symbols.length > 0 && (
        <div className={`flex flex-wrap gap-1 mt-1.5 ${open ? "" : "max-h-[22px] overflow-hidden"}`}>
          {f.symbols.map((s, i) => (
            <span
              key={i}
              className="text-[10px] px-1.5 py-0.5 rounded font-mono border"
              style={{ borderColor: (KIND_COLOR[s.kind] || "#8b95a5") + "55", color: KIND_COLOR[s.kind] || "#8b95a5" }}
              title={`${s.kind} · line ${s.line}`}
            >
              {s.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
