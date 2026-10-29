"use client";

import { apiFetch } from "@/lib/api-client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { ProjectSummary } from "@/lib/types";
import type { Suggestion } from "@/lib/suggestions";
import SimpleTask from "@/components/simple/SimpleTask";
import type { Assessment } from "@/lib/assessment";

// Approachable, plain-language building starters (this is a tool-building assistant, not legal work).
const RECIPES = [
  { icon: "➕", label: "Add something new", template: "Add a new [thing] that [does what]." },
  { icon: "🔧", label: "Fix a problem", template: "Fix the problem where [what goes wrong]." },
  { icon: "✨", label: "Improve how it looks", template: "Improve how [which part] looks, so it's cleaner and easier to use." },
  { icon: "📝", label: "Make a small tool", template: "Make a small tool that [does what]." },
  { icon: "✅", label: "Add a safety check", template: "Add a check that makes sure [what] keeps working." },
];

export default function SimpleDo() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<ProjectSummary | null>(null);
  const [gitRepo, setGitRepo] = useState(false);
  const [task, setTask] = useState("");
  const [busy, setBusy] = useState(false);
  const [runningJob, setRunningJob] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [previewEntry, setPreviewEntry] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/api/projects", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        const ps: ProjectSummary[] = (j.projects || []).filter((p: ProjectSummary) => p.exists);
        setProjects(ps);
        const pid = new URLSearchParams(window.location.search).get("project");
        if (pid) {
          const p = ps.find((x) => x.id === pid);
          if (p) choose(p);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const choose = async (p: ProjectSummary) => {
    setPicked(p);
    setSuggestions(null);
    try {
      const r = await apiFetch(`/api/projects/${p.id}`, { cache: "no-store" });
      const j = await r.json();
      setGitRepo(!!j.gitRepo);
      setAssessment(j.assessment || null);
      setPreviewEntry(j.previewEntry || null);
    } catch {
      setGitRepo(false);
      setAssessment(null);
      setPreviewEntry(null);
    }
    apiFetch(`/api/projects/${p.id}/suggestions`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setSuggestions(j.suggestions || []))
      .catch(() => setSuggestions([]));
  };

  const start = async () => {
    if (!picked || !task.trim()) return;
    setBusy(true);
    const r = await apiFetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: picked.id,
        prompt: task.trim(),
        permissionMode: "acceptEdits",
        isolate: gitRepo,
        autoVerify: gitRepo,
        autoFix: gitRepo,
        primeContext: true,
        maintainTasks: true,
      }),
    });
    const j = await r.json();
    setBusy(false);
    if (j.job?.id) setRunningJob(j.job.id);
  };

  const filtered = projects.filter((p) => (query ? p.name.toLowerCase().includes(query.toLowerCase()) : true));

  return (
    <div className={`p-8 mx-auto ${runningJob ? "max-w-3xl xl:max-w-[1440px]" : "max-w-2xl"}`}>
      <h1 className="text-2xl font-bold">Get Protégé to do something</h1>
      <p className="text-muted mt-1">Tell it what you&apos;d like in plain words. It does the work and shows you before keeping anything.</p>

      {/* Step 1: pick a project */}
      <div className="mt-6">
        <div className="flex items-center gap-2 mb-2">
          <span className="w-6 h-6 rounded-full bg-accent/15 text-accent text-xs flex items-center justify-center font-semibold">1</span>
          <h2 className="text-sm font-semibold">Which project?</h2>
        </div>
        {picked ? (
          <div className="flex items-center justify-between rounded-xl border border-accent/30 bg-accent/5 px-4 py-3">
            <div className="font-medium">{picked.name}</div>
            <button onClick={() => setPicked(null)} className="text-xs text-muted hover:text-text">
              change
            </button>
          </div>
        ) : (
          <div>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search your projects…"
              className="w-full px-3 py-2 rounded-lg bg-panel border border-border text-sm mb-2 focus:outline-none focus:border-accent/60"
            />
            <div className="rounded-xl border border-border divide-y divide-border max-h-64 overflow-y-auto">
              {filtered.slice(0, 30).map((p) => (
                <button
                  key={p.id}
                  onClick={() => choose(p)}
                  className="w-full text-left px-4 py-2.5 hover:bg-panel-2 flex items-center justify-between gap-3"
                >
                  <span className="text-sm font-medium">{p.name}</span>
                  {(p.plainSummaryLine || p.summary) && (
                    <span className="text-[11px] text-muted truncate max-w-[55%]">{p.plainSummaryLine || p.summary}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Step 2: describe */}
      {picked && !runningJob && (
        <div className="mt-6">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-6 h-6 rounded-full bg-accent/15 text-accent text-xs flex items-center justify-center font-semibold">2</span>
            <h2 className="text-sm font-semibold">What would you like done?</h2>
          </div>

          {/* Contextual suggestions for this project */}
          <div className="mb-3">
            <div className="text-[11px] text-muted mb-1.5">
              {suggestions === null ? "Thinking of ideas for this project…" : "Ideas for this project — click one, or write your own below:"}
            </div>
            <div className="flex flex-col gap-1.5">
              {suggestions === null
                ? [0, 1, 2].map((i) => <div key={i} className="h-8 rounded-lg bg-panel animate-pulse" />)
                : suggestions.map((s, i) =>
                    s.kind === "ask" ? (
                      <Link
                        key={i}
                        href={`/simple/ask?project=${picked.id}&q=${encodeURIComponent(s.text)}`}
                        className="text-left text-sm px-3 py-2 rounded-lg border border-border bg-panel hover:border-accent/40 flex items-center gap-2"
                      >
                        <span className="text-muted shrink-0">💬</span>
                        <span className="flex-1">{s.text}</span>
                        <span className="text-[11px] text-muted shrink-0">ask →</span>
                      </Link>
                    ) : (
                      <button
                        key={i}
                        onClick={() => setTask(s.text)}
                        className="text-left text-sm px-3 py-2 rounded-lg border border-border bg-panel hover:border-accent/40 flex items-center gap-2"
                      >
                        <span className="text-accent shrink-0">✍️</span>
                        <span className="flex-1">{s.text}</span>
                        <span className="text-[11px] text-muted shrink-0">use this</span>
                      </button>
                    )
                  )}
            </div>
          </div>

          <textarea
            value={task}
            onChange={(e) => setTask(e.target.value)}
            rows={4}
            autoFocus
            placeholder="Describe it in plain words…"
            className="w-full px-3 py-2.5 rounded-xl bg-panel border border-border text-sm focus:outline-none focus:border-accent/60 resize-y"
          />
          <div className="mt-2">
            <div className="text-[11px] text-muted mb-1">Or start from a common building task:</div>
            <div className="flex flex-wrap gap-1.5">
              {RECIPES.map((r) => (
                <button
                  key={r.label}
                  onClick={() => setTask(r.template)}
                  title={r.template}
                  className="text-[11px] px-2 py-1 rounded-lg border border-border text-muted hover:text-text flex items-center gap-1"
                >
                  <span>{r.icon}</span> {r.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between mt-4">
            <p className="text-[11px] text-muted max-w-sm">
              {gitRepo
                ? "It works on a separate copy and shows you the changes to approve — nothing is kept until you say so."
                : "The changes will be made in this project. Ask a question first if you're unsure."}
            </p>
            <button
              onClick={start}
              disabled={busy || !task.trim()}
              className="px-5 py-2.5 rounded-xl bg-accent/20 border border-accent/40 text-accent hover:bg-accent/30 text-sm font-semibold disabled:opacity-40"
            >
              {busy ? "Starting…" : "Start"}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: run + review */}
      {runningJob && (
        <div className="mt-6">
          <SimpleTask
            key={runningJob}
            projectId={picked?.id || ""}
            firstJobId={runningJob}
            gitRepo={gitRepo}
            assessment={assessment}
            previewEntry={previewEntry}
          />
          <button
            onClick={() => {
              setRunningJob(null);
              setTask("");
            }}
            className="text-xs text-muted hover:text-text mt-3"
          >
            Start another task
          </button>
        </div>
      )}
    </div>
  );
}
