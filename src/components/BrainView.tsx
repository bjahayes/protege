"use client";

import { apiFetch } from "@/lib/api-client";
import { useEffect, useState } from "react";
import MarkdownView from "./MarkdownView";
import type { BrainNote } from "@/lib/brain";

interface ProjectBrain {
  available: boolean;
  matched: boolean;
  page?: { meta: any; body: string };
  notes: BrainNote[];
}

export default function BrainView({ projectId }: { projectId: string }) {
  const [brain, setBrain] = useState<ProjectBrain | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiFetch(`/api/projects/${projectId}/brain`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setBrain(j.brain))
      .catch(() => setBrain(null))
      .finally(() => setLoading(false));
  }, [projectId]);

  if (loading) return <div className="text-muted text-sm py-8">Reading your brain…</div>;
  if (!brain || !brain.available) {
    return (
      <div className="max-w-xl py-12 text-center">
        <div className="text-3xl mb-3 opacity-60">🧠</div>
        <p className="text-muted text-sm">
          Brainchild isn&apos;t set up here. Point Protégé at your brain with the{" "}
          <code className="text-xs">PROTEGE_BRAIN_DIR</code> env var (defaults to{" "}
          <code className="text-xs">~/brainchild/data/brain</code>).
        </p>
      </div>
    );
  }
  if (!brain.matched) {
    return (
      <div className="max-w-xl py-12 text-center">
        <div className="text-3xl mb-3 opacity-60">🧠</div>
        <p className="text-muted text-sm">
          Your second brain has no page for this project yet. Brainchild ingests your top projects — run its{" "}
          <code className="text-xs">npm run ingest</code> to include this one.
        </p>
      </div>
    );
  }

  const meta = brain.page!.meta;
  const byCategory = new Map<string, BrainNote[]>();
  for (const n of brain.notes) {
    const c = n.category || "Notes";
    if (!byCategory.has(c)) byCategory.set(c, []);
    byCategory.get(c)!.push(n);
  }

  return (
    <div className="max-w-4xl space-y-5">
      <div className="rounded-xl border border-border bg-panel p-5">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[11px] uppercase tracking-wide px-2 py-0.5 rounded-full border border-running/30 bg-running/10 text-running font-semibold">
            🧠 from brainchild
          </span>
          {meta.status && <span className="text-[11px] text-muted">{meta.status}</span>}
        </div>
        <h2 className="text-lg font-semibold">{meta.title}</h2>
        {meta.summary && <p className="text-sm text-muted mt-1.5 leading-relaxed">{meta.summary}</p>}
        {meta.stack?.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {meta.stack.map((s: string, i: number) => (
              <span key={i} className="text-[11px] px-2 py-0.5 rounded border border-border text-muted">
                {s}
              </span>
            ))}
          </div>
        )}
      </div>

      {brain.page!.body.trim() && (
        <div className="rounded-xl border border-border bg-panel p-5">
          <MarkdownView content={brain.page!.body} />
        </div>
      )}

      {brain.notes.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-muted mb-2">
            Techniques & notes <span className="text-muted/60">({brain.notes.length})</span>
          </h3>
          <p className="text-[11px] text-muted mb-3">
            Reusable ideas your brain extracted from this project — each also links the other projects it appears in.
          </p>
          <div className="space-y-4">
            {[...byCategory.entries()].map(([cat, notes]) => (
              <div key={cat}>
                <div className="text-[11px] uppercase tracking-wide text-muted/70 font-semibold mb-1.5">{cat}</div>
                <div className="rounded-xl border border-border bg-panel divide-y divide-border">
                  {notes.map((n) => (
                    <NoteRow key={n.slug} note={n} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function NoteRow({ note }: { note: BrainNote }) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState<string | null>(null);

  const toggle = () => {
    setOpen((v) => !v);
    if (!body) {
      apiFetch(`/api/brain/note/${encodeURIComponent(note.slug)}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((j) => setBody(j.note?.body || ""))
        .catch(() => setBody(""));
    }
  };

  return (
    <div className="px-4 py-2.5">
      <button onClick={toggle} className="w-full text-left flex items-start gap-2">
        <span className="text-muted text-xs mt-0.5 shrink-0">{open ? "▾" : "▸"}</span>
        <div className="min-w-0">
          <div className="text-sm">
            {note.title}
            {note.hubOf && <span className="text-[10px] text-running ml-2">hub</span>}
          </div>
          {note.summary && <div className="text-[11px] text-muted mt-0.5 leading-snug">{note.summary}</div>}
          {note.projects && note.projects.length > 1 && (
            <div className="text-[10px] text-muted/70 mt-1">also in: {note.projects.filter((p) => p).join(", ")}</div>
          )}
        </div>
      </button>
      {open && (
        <div className="mt-2 pl-6">
          {body === null ? (
            <div className="text-xs text-muted">Loading…</div>
          ) : (
            <MarkdownView content={body} />
          )}
        </div>
      )}
    </div>
  );
}
