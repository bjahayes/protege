"use client";

import { apiFetch } from "@/lib/api-client";
import { useEffect, useState, useCallback, use } from "react";
import Link from "next/link";
import type { ProjectSummary, Job, Task } from "@/lib/types";
import type { Assessment } from "@/lib/assessment";
import { timeAgo } from "@/lib/format";
import { plainStatus, TONE_CLASS } from "@/lib/plain";
import SimpleTask from "@/components/simple/SimpleTask";
import PartsMap from "@/components/simple/PartsMap";
import MarkdownView from "@/components/MarkdownView";
import { isDemoId } from "@/lib/demo-client";

const EXAMPLES = [
  "Fix a small mistake I noticed",
  "Add a new section explaining X",
  "Tidy up the wording in the main document",
];

export default function SimpleProject({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [project, setProject] = useState<ProjectSummary | null>(null);
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [plainSummary, setPlainSummary] = useState<string | null>(null);
  const [gitRepo, setGitRepo] = useState(false);
  const [previewEntry, setPreviewEntry] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [taskOpen, setTaskOpen] = useState(false);
  const [taskText, setTaskText] = useState("");
  const [runningJob, setRunningJob] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [changingParts, setChangingParts] = useState<Set<string>>(new Set());
  const demo = isDemoId(id);

  const load = useCallback(async () => {
    const r = await apiFetch(`/api/projects/${id}`, { cache: "no-store" });
    if (!r.ok) return;
    const j = await r.json();
    setProject(j.project);
    setAssessment(j.assessment || null);
    setPlainSummary(j.plainSummary || null);
    setGitRepo(!!j.gitRepo);
    setPreviewEntry(j.previewEntry || null);
    setTasks((j.docs?.tasks as Task[]) || []);
    setJobs(j.jobs || []);
    // If a task for this project is already running (started here or elsewhere), show it live.
    const liveJob = ((j.jobs || []) as Job[]).find((x) => ["starting", "running", "idle"].includes(x.status));
    if (liveJob) setRunningJob((cur) => cur ?? liveJob.id);
  }, [id]);

  useEffect(() => {
    load();
    const t = setInterval(load, 6000);
    return () => clearInterval(t);
  }, [load]);

  const startTask = async () => {
    if (!taskText.trim()) return;
    setBusy(true);
    const r = await apiFetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: id,
        prompt: taskText.trim(),
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
    if (j.job?.id) {
      setRunningJob(j.job.id);
      setTaskOpen(false);
      setTaskText("");
    }
  };

  const createSummary = async () => {
    setBusy(true);
    const r = await apiFetch(`/api/projects/${id}/plain-summary`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const j = await r.json();
    setBusy(false);
    if (j.job?.id) setRunningJob(j.job.id);
  };

  const mapProject = async () => {
    setBusy(true);
    const r = await apiFetch(`/api/projects/${id}/assess`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (j.job?.id) setRunningJob(j.job.id);
  };

  const remainingTasks = tasks.filter((t) => t.status !== "done");
  const doNext = () => {
    if (!remainingTasks.length) return;
    setTaskText(remainingTasks[0].title);
    setTaskOpen(true);
    (document.getElementById("main-scroll") || window).scrollTo({ top: 0, behavior: "smooth" });
  };

  if (!project) return <div className="p-8 text-muted text-sm">Loading…</div>;

  return (
    <div className="p-8 max-w-3xl xl:max-w-[1440px] mx-auto">
      <Link href="/simple" className="text-accent text-sm hover:underline">
        ← All projects
      </Link>
      <div className="flex items-center gap-3 mt-2 flex-wrap">
        <h1 className="text-2xl font-bold">{project.name}</h1>
        {previewEntry && (
          <Link
            href={`/simple/preview/${id}`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-good/15 border border-good/40 text-good hover:bg-good/25 text-sm font-semibold"
          >
            ▶ See it working
          </Link>
        )}
      </div>

      {/* Two columns on wide screens: what it is and what's happening on the left; the parts
          diagram, actions and history on the right. One column, in the same order, otherwise. */}
      <div className="xl:grid xl:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] xl:gap-8 xl:items-start">
      <div className="min-w-0">
      {/* Where it's up to — in plain English */}
      <section className="mt-5">
        <h2 className="text-sm font-semibold text-muted mb-2">In plain English</h2>
        {plainSummary ? (
          <div className="rounded-2xl border border-border bg-panel p-5">
            <div className="prose-bw simple-summary">
              <MarkdownView content={plainSummary} />
            </div>
            <ProgressBlock tasks={tasks} phase={assessment?.phase} onDoNext={doNext} />
            {!demo && (
              <button
                onClick={createSummary}
                disabled={busy || !!runningJob}
                className="mt-4 text-xs text-muted hover:text-text disabled:opacity-50"
              >
                ↻ Refresh this summary
              </button>
            )}
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-panel p-6 text-center">
            <div className="text-3xl mb-2">📄</div>
            <p className="text-sm text-muted mb-3 max-w-md mx-auto">
              There isn&apos;t a plain-English summary of this project yet. Protégé can read it and write one
              for you — no jargon.
            </p>
            <button
              onClick={createSummary}
              disabled={busy || !!runningJob}
              className="px-4 py-2 rounded-xl bg-accent/20 border border-accent/40 text-accent hover:bg-accent/30 text-sm font-semibold disabled:opacity-50"
            >
              {busy ? "Starting…" : "Write a plain-English summary"}
            </button>
            <p className="text-[11px] text-muted mt-2">Takes a minute or two.</p>
          </div>
        )}
      </section>

      {/* A run in progress, shown as a live conversation with Claude Code */}
      {runningJob && (
        <section className="mt-5">
          <h2 className="text-sm font-semibold text-muted mb-2">Being built right now</h2>
          <SimpleTask
            key={runningJob}
            projectId={id}
            firstJobId={runningJob}
            gitRepo={gitRepo}
            components={assessment?.components || []}
            onTouchedParts={setChangingParts}
            onFinished={() => {
              load();
            }}
          />
          <div className="flex items-center gap-3 mt-2">
            <button onClick={() => setRunningJob(null)} className="text-xs text-muted hover:text-text">
              Done
            </button>
            {previewEntry && (
              <Link href={`/simple/preview/${id}`} className="text-xs text-good hover:underline">
                ▶ See it working
              </Link>
            )}
          </div>
        </section>
      )}

      </div>
      <div className="min-w-0">
      {/* How it fits together: the parts map */}
      <section className="mt-6 xl:mt-5">
        <h2 className="text-sm font-semibold text-muted mb-2">How it fits together</h2>
        {assessment?.components?.length ? (
          <div className="rounded-2xl border border-border bg-panel p-5">
            <PartsMap assessment={assessment} changing={changingParts} />
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-panel p-5 text-sm text-muted">
            Protégé hasn&apos;t drawn a map of this project yet. It reads the code and shows the main parts and how they connect.
            {!demo && (
              <div className="mt-3">
                <button
                  onClick={mapProject}
                  disabled={busy || !!runningJob}
                  className="px-4 py-2 rounded-xl bg-accent/20 border border-accent/40 text-accent hover:bg-accent/30 text-sm font-semibold disabled:opacity-50"
                >
                  Draw a map of this project
                </button>
                <span className="text-[11px] ml-3">Takes a few minutes. It only reads, nothing changes.</span>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Actions */}
      {!runningJob && (
        <section className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-3">
          <Link
            href={`/simple/ask?project=${id}`}
            className="rounded-2xl border border-border bg-panel hover:border-accent/50 p-5"
          >
            <div className="text-2xl mb-1.5">💬</div>
            <div className="font-semibold">Ask a question about this</div>
            <div className="text-sm text-muted mt-0.5">Get a plain-English answer. Nothing changes.</div>
          </Link>
          <button
            onClick={() => setTaskOpen((v) => !v)}
            className="text-left rounded-2xl border border-border bg-panel hover:border-accent/50 p-5"
          >
            <div className="text-2xl mb-1.5">✍️</div>
            <div className="font-semibold">Ask Protégé to make a change</div>
            <div className="text-sm text-muted mt-0.5">
              {gitRepo
                ? "It works on a safe copy and shows you before keeping anything."
                : "It changes this project's files directly, so ask a question first if you're unsure."}
            </div>
          </button>
        </section>
      )}

      {/* Guided task */}
      {taskOpen && !runningJob && (
        <section className="mt-4 rounded-2xl border border-accent/30 bg-accent/5 p-5">
          <div className="text-sm font-medium mb-2">What would you like Protégé to do?</div>
          <textarea
            value={taskText}
            onChange={(e) => setTaskText(e.target.value)}
            rows={3}
            autoFocus
            placeholder="Describe it in plain words, e.g. 'Add a short summary at the top of the main document.'"
            className="w-full px-3 py-2.5 rounded-xl bg-bg border border-border text-sm focus:outline-none focus:border-accent/60 resize-y"
          />
          <div className="flex flex-wrap gap-1.5 mt-2">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                onClick={() => setTaskText(ex)}
                className="text-[11px] px-2 py-1 rounded-lg border border-border text-muted hover:text-text"
              >
                {ex}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between mt-3">
            <p className="text-[11px] text-muted max-w-sm">
              {gitRepo
                ? "It works on a separate copy and shows you the changes to approve or throw away."
                : "The changes will be made directly in this project."}
            </p>
            <button
              onClick={startTask}
              disabled={busy || !taskText.trim()}
              className="px-4 py-2 rounded-xl bg-accent/20 border border-accent/40 text-accent hover:bg-accent/30 text-sm font-semibold disabled:opacity-40"
            >
              {busy ? "Starting…" : "Start"}
            </button>
          </div>
        </section>
      )}

      {/* Recent activity — a plain history you can undo */}
      {jobs.length > 0 && !runningJob && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold text-muted mb-2">History</h2>
          <p className="text-[11px] text-muted mb-2">Everything Protégé has done here. Nothing is ever lost — you can undo a change you kept.</p>
          <div className="rounded-2xl border border-border bg-panel divide-y divide-border">
            {jobs.slice(0, 8).map((j) => (
              <HistoryItem key={j.id} job={j} onChange={load} />
            ))}
          </div>
        </section>
      )}

      {/* Reset a demo project back to its starting point */}
      {demo && !runningJob && (
        <div className="mt-6 text-center">
          <button
            onClick={async () => {
              if (!confirm("Reset this demo project back to how it started? Any changes here will be cleared.")) return;
              setResetting(true);
              await apiFetch(`/api/projects/${id}/reset`, { method: "POST" }).catch(() => {});
              setResetting(false);
              load();
            }}
            disabled={resetting}
            className="text-[11px] text-muted hover:text-text disabled:opacity-50"
          >
            {resetting ? "Resetting…" : "↺ Reset this demo project"}
          </button>
        </div>
      )}
      </div>
      </div>
    </div>
  );
}

function ProgressBlock({
  tasks,
  phase,
  onDoNext,
}: {
  tasks: Task[];
  phase?: string;
  onDoNext: () => void;
}) {
  const done = tasks.filter((t) => t.status === "done");
  const remaining = tasks.filter((t) => t.status !== "done");

  if (tasks.length === 0) {
    return (
      <div className="mt-4 rounded-xl border border-border bg-panel-2/40 p-3 text-[12px] text-muted leading-relaxed">
        {phase ? <>This project looks like an <span className="text-text">{phase}</span>. </> : null}
        There isn&apos;t a step-by-step checklist yet, so there&apos;s no reliable “how far along”. Use{" "}
        <span className="text-text">Ask a question</span> → “what&apos;s left to do?” and Protégé will draw one up.
      </div>
    );
  }
  const total = tasks.length;
  const pct = Math.round((done.length / total) * 100);
  return (
    <div className="mt-4">
      <div className="flex items-center justify-between text-[11px] text-muted mb-1">
        <span>How far along — {done.length} of {total} steps done</span>
        <span>{pct}%</span>
      </div>
      <div className="h-2.5 rounded-full bg-panel-2 overflow-hidden">
        <div className="h-full rounded-full bg-gradient-to-r from-accent to-good transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
      <div className="text-[11px] text-muted mt-1.5">Protégé keeps this list up to date as it works — you don&apos;t need to tick anything off.</div>

      {remaining.length > 0 && (
        <div className="mt-3">
          <div className="text-xs font-semibold mb-1.5">What&apos;s left</div>
          <ul className="space-y-1">
            {remaining.map((t) => (
              <li key={t.id} className="flex items-start gap-2.5 text-sm">
                <span className="mt-0.5 shrink-0 w-4 h-4 rounded-full border border-border flex items-center justify-center text-[9px] text-muted">○</span>
                <span className="flex-1">{t.title}</span>
              </li>
            ))}
          </ul>
          <button onClick={onDoNext} className="mt-2 text-xs text-accent hover:underline">
            → Get Protégé to do the next one
          </button>
        </div>
      )}

      {remaining.length === 0 && (
        <div className="mt-3 text-sm text-good">✓ Everything on the list is done. Add more with “Make a change”.</div>
      )}

      {done.length > 0 && (
        <details className="mt-3">
          <summary className="text-xs text-muted cursor-pointer hover:text-text select-none">
            Already done ({done.length})
          </summary>
          <ul className="space-y-1 mt-1.5">
            {done.map((t) => (
              <li key={t.id} className="flex items-start gap-2.5 text-sm text-muted">
                <span className="mt-0.5 shrink-0 w-4 h-4 rounded-full bg-good/15 border border-good/40 flex items-center justify-center text-[9px] text-good">✓</span>
                <span className="flex-1 line-through">{t.title}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function HistoryItem({ job, onChange }: { job: Job; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [undone] = useState(false);
  const ps = plainStatus(job.status);

  const undo = async () => {
    if (!confirm("Undo this change? It will put things back the way they were before.")) return;
    setBusy(true);
    setMsg(null);
    const r = await apiFetch(`/api/jobs/${job.id}/undo`, { method: "POST" });
    const j = await r.json();
    setBusy(false);
    if (j.ok) onChange();
    else setMsg(j.message || "Couldn't undo.");
  };

  return (
    <div className="px-4 py-3 flex items-center gap-3">
      <span className={`text-xs font-medium shrink-0 w-24 ${TONE_CLASS[ps.tone]}`}>{ps.label}</span>
      <span className="text-sm truncate flex-1">{job.prompt}</span>
      {msg && <span className="text-[11px] text-warn max-w-[30%] truncate">{msg}</span>}
      {undone ? (
        <span className="text-[11px] text-muted shrink-0">undone</span>
      ) : job.worktreeState === "applied" ? (
        <button
          onClick={undo}
          disabled={busy}
          className="text-[11px] px-2 py-1 rounded border border-border text-muted hover:text-text hover:border-accent/40 shrink-0"
        >
          {busy ? "Undoing…" : "↺ Undo"}
        </button>
      ) : job.worktreeState === "reverted" ? (
        <span className="text-[11px] text-muted shrink-0">undone</span>
      ) : null}
      <span className="text-[11px] text-muted shrink-0 w-14 text-right">{timeAgo(job.startedAt)}</span>
    </div>
  );
}
