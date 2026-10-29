"use client";

import { apiFetch } from "@/lib/api-client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import type { ProjectSummary } from "@/lib/types";
import { timeAgo } from "@/lib/format";

export default function Dashboard() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [, setNow] = useState(0);

  const load = useCallback(async () => {
    try {
      const r = await apiFetch("/api/projects", { cache: "no-store" });
      const j = await r.json();
      setProjects(j.projects || []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 4000);
    const tick = setInterval(() => setNow((n) => n + 1), 1000);
    return () => {
      clearInterval(t);
      clearInterval(tick);
    };
  }, [load]);

  const liveCount = projects.reduce((n, p) => n + p.liveAgents, 0);
  const activeCount = projects.filter((p) => p.lastActivity && Date.now() - p.lastActivity < 3 * 60 * 1000).length;
  const filtered = projects
    .filter((p) => (showAll ? true : p.exists))
    .filter((p) =>
      query
        ? (p.name + " " + p.path + " " + (p.summary || "")).toLowerCase().includes(query.toLowerCase())
        : true
    );

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <header className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold">Projects</h1>
          <p className="text-sm text-muted mt-0.5 flex items-center gap-1.5">
            {projects.length} discovered ·{" "}
            {liveCount > 0 && (
              <span className="live-dot inline-flex items-center gap-1 text-running">
                <span className="w-1.5 h-1.5 rounded-full bg-running" />
                {liveCount} agent{liveCount > 1 ? "s" : ""} live
              </span>
            )}
            {liveCount > 0 && activeCount > 0 && " · "}
            {activeCount > 0 && (
              <span className="live-dot inline-flex items-center gap-1 text-good">
                <span className="w-1.5 h-1.5 rounded-full bg-good" />
                {activeCount} active
              </span>
            )}
            {liveCount === 0 && activeCount === 0 && "quiet"}
            <span className="opacity-50">· live</span>
          </p>
        </div>
        <button
          onClick={() => setAdding(true)}
          className="px-3.5 py-2 rounded-lg bg-accent/15 border border-accent/30 text-accent hover:bg-accent/25 text-sm font-medium"
        >
          + Add project
        </button>
      </header>

      <div className="flex items-center gap-3 mb-4">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter projects…"
          className="flex-1 max-w-md px-3 py-2 rounded-lg bg-panel border border-border text-sm focus:outline-none focus:border-accent/60"
        />
        <label className="flex items-center gap-2 text-xs text-muted cursor-pointer select-none">
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
          Show missing / deleted
        </label>
      </div>

      {loading ? (
        <div className="text-muted text-sm py-20 text-center">Loading projects…</div>
      ) : filtered.length === 0 ? (
        <div className="text-muted text-sm py-20 text-center">No projects match.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map((p) => (
            <ProjectCard key={p.id} p={p} />
          ))}
        </div>
      )}

      {adding && <AddProjectDialog onClose={() => setAdding(false)} onDone={load} />}
    </div>
  );
}

function ProjectCard({ p }: { p: ProjectSummary }) {
  const total = p.tasks.todo + p.tasks.doing + p.tasks.done;
  return (
    <Link
      href={`/projects/${p.id}`}
      className="block rounded-xl border border-border bg-panel hover:border-accent/50 hover:bg-panel-2 transition-colors p-4 group"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold truncate group-hover:text-accent">{p.name}</h3>
            {p.liveAgents > 0 ? (
              <span className="live-dot inline-flex items-center gap-1 text-[11px] text-running font-medium shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-running" />
                {p.liveAgents} live
              </span>
            ) : (
              p.lastActivity != null &&
              Date.now() - p.lastActivity < 3 * 60 * 1000 && (
                <span className="live-dot inline-flex items-center gap-1 text-[11px] text-good font-medium shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-good" />
                  active
                </span>
              )
            )}
            {!p.exists && (
              <span className="text-[11px] text-bad border border-bad/30 rounded px-1.5 py-0.5 shrink-0">missing</span>
            )}
          </div>
          <div className="text-[11px] text-muted font-mono truncate mt-0.5">{p.path}</div>
        </div>
      </div>

      {p.summary && (
        <p className="text-xs text-muted mt-2 line-clamp-2 leading-relaxed">{p.summary}</p>
      )}

      <div className="flex items-center flex-wrap gap-1.5 mt-3">
        <DocPill on={p.hasDesign} label="design" />
        <DocPill on={p.hasPlan} label="plan" />
        <DocPill on={p.hasClaudeMd} label="CLAUDE.md" />
      </div>

      <div className="flex items-center justify-between mt-3 pt-3 border-t border-border text-[11px] text-muted">
        <div className="flex items-center gap-3">
          <span>{p.sessionCount} session{p.sessionCount === 1 ? "" : "s"}</span>
          {total > 0 && (
            <span className="flex items-center gap-1.5">
              <TaskDot n={p.tasks.todo} color="text-muted" title="todo" />
              <TaskDot n={p.tasks.doing} color="text-running" title="doing" />
              <TaskDot n={p.tasks.done} color="text-good" title="done" />
            </span>
          )}
        </div>
        <span>{timeAgo(p.lastActivity)}</span>
      </div>
    </Link>
  );
}

function DocPill({ on, label }: { on: boolean; label: string }) {
  return (
    <span
      className={`text-[11px] px-1.5 py-0.5 rounded border ${
        on ? "border-good/30 text-good bg-good/10" : "border-border text-muted/60"
      }`}
    >
      {on ? "✓ " : ""}
      {label}
    </span>
  );
}

function TaskDot({ n, color, title }: { n: number; color: string; title: string }) {
  return (
    <span className={color} title={title}>
      {title[0].toUpperCase()}
      {n}
    </span>
  );
}

function AddProjectDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [path, setPath] = useState("");
  const [name, setName] = useState("");
  const [scaffold, setScaffold] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await apiFetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, name: name || undefined, scaffold }),
      });
      const j = await r.json();
      if (!r.ok) {
        setErr(j.error || "Failed");
        setBusy(false);
        return;
      }
      onDone();
      onClose();
    } catch (e: any) {
      setErr(e?.message || "Failed");
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-panel border border-border rounded-xl p-5 w-full max-w-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold mb-3">Add project</h2>
        <label className="block text-xs text-muted mb-1">Absolute folder path</label>
        <input
          value={path}
          onChange={(e) => setPath(e.target.value)}
          placeholder="C:\Users\you\my-project or ~/my-project"
          className="w-full px-3 py-2 rounded-lg bg-bg border border-border text-sm font-mono mb-3 focus:outline-none focus:border-accent/60"
          autoFocus
        />
        <label className="block text-xs text-muted mb-1">Display name (optional)</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Defaults to folder name"
          className="w-full px-3 py-2 rounded-lg bg-bg border border-border text-sm mb-3 focus:outline-none focus:border-accent/60"
        />
        <label className="flex items-center gap-2 text-sm text-muted mb-4 cursor-pointer">
          <input type="checkbox" checked={scaffold} onChange={(e) => setScaffold(e.target.checked)} />
          Scaffold best-practice docs (DESIGN.md, PLAN.md, CLAUDE.md, .protege/tasks.json)
        </label>
        {err && <div className="text-bad text-xs mb-3">{err}</div>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-sm text-muted hover:text-text">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy || !path.trim()}
            className="px-3.5 py-1.5 rounded-lg bg-accent/15 border border-accent/30 text-accent hover:bg-accent/25 text-sm font-medium disabled:opacity-40"
          >
            {busy ? "Adding…" : "Add"}
          </button>
        </div>
      </div>
    </div>
  );
}
