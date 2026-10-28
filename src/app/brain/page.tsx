"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import MarkdownView from "@/components/MarkdownView";
import BrainChat from "@/components/BrainChat";
import type { BrainNote, BrainProjectSummary } from "@/lib/brain";

interface BrainIndex {
  available: boolean;
  notes: BrainNote[];
  projects: BrainProjectSummary[];
  categories: string[];
}
type Sel = { type: "note" | "project"; slug: string } | null;

export default function BrainPage() {
  const [index, setIndex] = useState<BrainIndex | null>(null);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Sel>(null);
  const [mode, setMode] = useState<"browse" | "ask">("browse");

  useEffect(() => {
    fetch("/api/brain", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setIndex(j))
      .catch(() => setIndex({ available: false, notes: [], projects: [], categories: [] }));
  }, []);

  // Deep-link from a chat citation: /brain?item=<slug>
  useEffect(() => {
    if (!index) return;
    const item = new URLSearchParams(window.location.search).get("item");
    if (item) {
      const isProject = index.projects.some((p) => p.slug === item);
      setSel({ type: isProject ? "project" : "note", slug: item });
      setMode("browse");
    }
  }, [index]);

  const filtered = useMemo(() => {
    if (!index) return { projects: [], groups: [] as { cat: string; notes: BrainNote[] }[] };
    const needle = q.trim().toLowerCase();
    const match = (s: string) => !needle || s.toLowerCase().includes(needle);
    const projects = index.projects.filter(
      (p) => match(p.title) || match(p.summary || "") || (p.tags || []).some(match)
    );
    const notes = index.notes.filter(
      (n) => match(n.title) || match(n.summary || "") || (n.tags || []).some(match) || match(n.category || "")
    );
    const byCat = new Map<string, BrainNote[]>();
    for (const n of notes) {
      const c = n.category || "Notes";
      if (!byCat.has(c)) byCat.set(c, []);
      byCat.get(c)!.push(n);
    }
    const groups = [...byCat.entries()]
      .map(([cat, notes]) => ({ cat, notes: notes.sort((a, b) => a.title.localeCompare(b.title)) }))
      .sort((a, b) => a.cat.localeCompare(b.cat));
    return { projects, groups };
  }, [index, q]);

  if (!index) return <div className="p-6 text-muted text-sm">Loading brain…</div>;
  if (!index.available) {
    return (
      <div className="p-6 max-w-xl mx-auto text-center py-24">
        <div className="text-4xl mb-3">🧠</div>
        <h1 className="text-xl font-bold mb-2">Brain</h1>
        <p className="text-muted text-sm">
          Brainchild isn&apos;t set up here. Point Protégé at it with <code className="text-xs">PROTEGE_BRAIN_DIR</code>{" "}
          (defaults to <code className="text-xs">~/brainchild/data/brain</code>).
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-border px-5 py-3 flex items-center justify-between">
        <h1 className="text-lg font-bold flex items-center gap-2">
          🧠 Brain
          <span className="text-[11px] text-muted font-normal">
            {index.notes.length} notes · {index.projects.length} projects
          </span>
        </h1>
        <div className="flex rounded-lg border border-border overflow-hidden text-xs">
          <button
            onClick={() => setMode("browse")}
            className={`px-3 py-1.5 ${mode === "browse" ? "bg-panel-2 text-text" : "text-muted hover:text-text"}`}
          >
            Browse
          </button>
          <button
            onClick={() => setMode("ask")}
            className={`px-3 py-1.5 border-l border-border ${mode === "ask" ? "bg-accent/15 text-accent" : "text-muted hover:text-text"}`}
          >
            ✧ Ask the brain
          </button>
        </div>
      </div>

      {mode === "ask" ? (
        <div className="flex-1 min-h-0">
          <BrainChat />
        </div>
      ) : (
    <div className="flex flex-1 min-h-0">
      <div className="w-[350px] shrink-0 border-r border-border flex flex-col">
        <div className="p-4 border-b border-border">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search techniques, decisions, projects…"
            className="mt-2.5 w-full px-3 py-2 rounded-lg bg-panel border border-border text-sm focus:outline-none focus:border-accent/60"
          />
        </div>
        <div className="flex-1 overflow-y-auto">
          {filtered.projects.length > 0 && (
            <Group title="Projects" count={filtered.projects.length}>
              {filtered.projects.map((p) => (
                <Item
                  key={p.slug}
                  title={p.title}
                  sub={p.summary}
                  active={sel?.type === "project" && sel.slug === p.slug}
                  onClick={() => setSel({ type: "project", slug: p.slug })}
                />
              ))}
            </Group>
          )}
          {filtered.groups.map((g) => (
            <Group key={g.cat} title={g.cat} count={g.notes.length}>
              {g.notes.map((n) => (
                <Item
                  key={n.slug}
                  title={n.title}
                  sub={n.summary}
                  badge={n.hubOf ? "hub" : undefined}
                  active={sel?.type === "note" && sel.slug === n.slug}
                  onClick={() => setSel({ type: "note", slug: n.slug })}
                />
              ))}
            </Group>
          ))}
        </div>
      </div>

      <div className="flex-1 min-w-0 overflow-y-auto">
        {sel ? (
          <Detail sel={sel} onSelect={setSel} />
        ) : (
          <div className="h-full flex items-center justify-center text-muted text-sm">
            Pick a technique or project to read it.
          </div>
        )}
      </div>
    </div>
      )}
    </div>
  );
}

function Group({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div className="py-1.5">
      <div className="px-4 py-1 text-[10px] uppercase tracking-wide text-muted/70 font-semibold flex justify-between">
        <span>{title}</span>
        <span>{count}</span>
      </div>
      {children}
    </div>
  );
}

function Item({
  title,
  sub,
  badge,
  active,
  onClick,
}: {
  title: string;
  sub?: string;
  badge?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-2 border-l-2 ${
        active ? "border-accent bg-panel-2" : "border-transparent hover:bg-panel/60"
      }`}
    >
      <div className="text-sm flex items-center gap-1.5">
        <span className="truncate">{title}</span>
        {badge && <span className="text-[9px] text-running shrink-0">{badge}</span>}
      </div>
      {sub && <div className="text-[11px] text-muted truncate mt-0.5">{sub}</div>}
    </button>
  );
}

function Detail({ sel, onSelect }: { sel: NonNullable<Sel>; onSelect: (s: Sel) => void }) {
  const [data, setData] = useState<{ meta: any; body: string } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    setData(null);
    const url = sel.type === "note" ? `/api/brain/note/${sel.slug}` : `/api/brain/project/${sel.slug}`;
    fetch(url, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setData(j.note || j.page || null))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [sel.type, sel.slug]);

  useEffect(load, [load]);

  if (loading) return <div className="p-8 text-muted text-sm">Loading…</div>;
  if (!data) return <div className="p-8 text-muted text-sm">Not found.</div>;
  const m = data.meta || {};

  return (
    <div className="max-w-3xl mx-auto p-8">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[11px] uppercase tracking-wide px-2 py-0.5 rounded-full border border-running/30 bg-running/10 text-running font-semibold">
          {sel.type === "project" ? "project" : m.category || "note"}
        </span>
        {m.status && <span className="text-[11px] text-muted">{m.status}</span>}
        {m.hubOf && <span className="text-[11px] text-running">hub</span>}
      </div>
      <h1 className="text-xl font-bold">{m.title}</h1>
      {m.summary && <p className="text-sm text-muted mt-1.5 leading-relaxed">{m.summary}</p>}

      {(m.stack?.length || m.tags?.length) > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {(m.stack || m.tags || []).map((s: string, i: number) => (
            <span key={i} className="text-[11px] px-2 py-0.5 rounded border border-border text-muted">
              {s}
            </span>
          ))}
        </div>
      )}

      {/* cross-links */}
      {sel.type === "note" && m.projects?.length > 0 && (
        <div className="mt-3 text-xs text-muted">
          appears in:{" "}
          {m.projects.filter(Boolean).map((p: string, i: number) => (
            <span key={p}>
              {i > 0 && ", "}
              <button onClick={() => onSelect({ type: "project", slug: p })} className="text-accent hover:underline">
                {p}
              </button>
            </span>
          ))}
        </div>
      )}
      {sel.type === "project" && m.notes?.length > 0 && (
        <div className="mt-3 text-xs text-muted">
          {m.notes.length} linked notes — see the project&apos;s Brain tab, or search left.
        </div>
      )}

      {data.body?.trim() && (
        <div className="mt-5 rounded-xl border border-border bg-panel p-5">
          <MarkdownView content={data.body} />
        </div>
      )}
    </div>
  );
}
