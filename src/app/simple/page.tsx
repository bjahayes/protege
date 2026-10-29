"use client";

import { apiFetch } from "@/lib/api-client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import type { ProjectSummary } from "@/lib/types";
import { timeAgo } from "@/lib/format";
import LiveStrip from "@/components/simple/LiveStrip";
import PartsBar from "@/components/simple/PartsBar";

export default function SimpleHome() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [, setNow] = useState(0);
  const [welcomed, setWelcomed] = useState(true);

  useEffect(() => {
    setWelcomed(localStorage.getItem("protege_simple_welcomed") === "1");
  }, []);
  const dismissWelcome = () => {
    localStorage.setItem("protege_simple_welcomed", "1");
    setWelcomed(true);
  };

  const load = useCallback(async () => {
    try {
      const r = await apiFetch("/api/projects", { cache: "no-store" });
      const j = await r.json();
      setProjects((j.projects || []).filter((p: ProjectSummary) => p.exists));
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    const tick = setInterval(() => setNow((n) => n + 1), 1000);
    return () => {
      clearInterval(t);
      clearInterval(tick);
    };
  }, [load]);

  const filtered = projects.filter((p) =>
    query ? (p.name + " " + (p.summary || "")).toLowerCase().includes(query.toLowerCase()) : true
  );

  return (
    <div className="p-8 max-w-4xl mx-auto">
      {!welcomed && (
        <div className="mb-5 rounded-2xl border border-accent/30 bg-accent/5 p-5">
          <div className="flex items-start gap-3">
            <div className="text-2xl">👋</div>
            <div>
              <div className="text-base font-semibold">Welcome to Protégé</div>
              <p className="text-sm text-muted mt-1 leading-relaxed">
                Protégé is a friendlier way to build and change software — no terminal, no jargon.
                You can <strong>ask it questions</strong> about your projects, or <strong>get it to do tasks</strong>{" "}
                for you. It works on your own computer, and when it makes changes it shows you first — nothing is kept
                until you say so.
              </p>
              <button onClick={dismissWelcome} className="mt-2 text-xs text-accent hover:underline">
                Got it, let&apos;s go
              </button>
            </div>
          </div>
        </div>
      )}

      <h1 className="text-2xl font-bold">What would you like to do?</h1>
      <p className="text-muted mt-1">Start something new, get Protégé to do a task, ask it a question, or open a project.</p>

      <div className="mt-5">
        <LiveStrip />
      </div>

      <Link
        href="/simple/new"
        className="mt-5 flex items-center gap-4 rounded-2xl border border-accent/40 bg-gradient-to-r from-accent/15 to-good/10 hover:from-accent/25 p-5"
      >
        <div className="text-4xl">✨</div>
        <div className="flex-1">
          <div className="text-lg font-semibold text-accent">Start something new</div>
          <div className="text-sm text-muted mt-0.5">
            Begin from a friendly template — a small web tool, a document builder, a checklist — and shape it into your own.
          </div>
        </div>
        <div className="text-accent text-xl">→</div>
      </Link>

      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
        <Link
          href="/simple/do"
          className="flex flex-col rounded-2xl border border-accent/40 bg-accent/10 hover:bg-accent/20 p-5"
        >
          <div className="text-3xl mb-2">✍️</div>
          <div className="text-lg font-semibold text-accent">Get Protégé to do something</div>
          <div className="text-sm text-muted mt-0.5">
            Describe a task in plain words. In projects you start here, it works on a safe copy and shows you before keeping anything.
          </div>
        </Link>
        <Link
          href="/simple/ask"
          className="flex flex-col rounded-2xl border border-border bg-panel hover:border-accent/50 p-5"
        >
          <div className="text-3xl mb-2">💬</div>
          <div className="text-lg font-semibold">Ask a question</div>
          <div className="text-sm text-muted mt-0.5">
            Ask about any project in plain English — it reads your work and answers. Nothing changes.
          </div>
        </Link>
      </div>

      <div className="flex items-center justify-between mt-8 mb-3">
        <h2 className="text-lg font-semibold">Your projects</h2>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search…"
          className="px-3 py-1.5 rounded-lg bg-panel border border-border text-sm w-48 focus:outline-none focus:border-accent/60"
        />
      </div>

      {loading ? (
        <div className="text-muted text-sm py-16 text-center">Loading…</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map((p) => {
            const active = p.liveAgents > 0 || (p.lastActivity != null && Date.now() - p.lastActivity < 3 * 60 * 1000);
            return (
              <Link
                key={p.id}
                href={`/simple/project/${p.id}`}
                className="rounded-2xl border border-border bg-panel hover:border-accent/50 hover:bg-panel-2 p-4"
              >
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-base">{p.name}</h3>
                  {active && (
                    <span className="live-dot inline-flex items-center gap-1 text-[11px] text-good font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-good" /> {p.liveAgents > 0 ? "Protégé working" : "active"}
                    </span>
                  )}
                </div>
                {(p.plainSummaryLine || p.summary) && (
                  <p className="text-sm text-muted mt-1.5 line-clamp-2 leading-relaxed">{p.plainSummaryLine || p.summary}</p>
                )}
                <PartsBar parts={p.parts} />
                <div className="text-[11px] text-muted mt-2">Last worked on {timeAgo(p.lastActivity)}</div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
