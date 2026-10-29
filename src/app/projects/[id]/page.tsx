"use client";

import { apiFetch } from "@/lib/api-client";
import { useEffect, useState, useCallback, useRef, use } from "react";
import Link from "next/link";
import type { ProjectSummary, SessionInfo, Job, Task } from "@/lib/types";
import { timeAgo, fmtCost, fmtTokens } from "@/lib/format";
import MarkdownView from "@/components/MarkdownView";
import TaskBoard from "@/components/TaskBoard";
import MissionBar from "@/components/MissionBar";
import CheckpointsPanel from "@/components/CheckpointsPanel";
import RunForm from "@/components/RunForm";
import AgentStream from "@/components/AgentStream";
import StatusBadge from "@/components/StatusBadge";
import AssessmentView from "@/components/AssessmentView";
import PartsMap from "@/components/simple/PartsMap";
import TurnHistory from "@/components/TurnHistory";
import Mermaid from "@/components/Mermaid";
import DocVersions from "@/components/DocVersions";
import RepoMapView from "@/components/RepoMapView";
import BrainView from "@/components/BrainView";
import { useBrainAvailable } from "@/lib/use-brain";
import TranscriptText from "@/components/TranscriptText";
import type { Assessment } from "@/lib/assessment";
import { runTitle } from "@/lib/agents";

interface Docs {
  design: string | null;
  plan: string | null;
  claudeMd: string | null;
  readme: string | null;
  status: string | null;
  tasks: Task[];
}

type Tab = "overview" | "map" | "brain" | "design" | "plan" | "tasks" | "history" | "sessions" | "run";

export default function ProjectDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [project, setProject] = useState<ProjectSummary | null>(null);
  const [docs, setDocs] = useState<Docs | null>(null);
  // Where the plan and design actually are (PLAN.md, docs/PLAN.md…), and every document's versions.
  const [docPaths, setDocPaths] = useState<{ design: string | null; plan: string | null }>({ design: null, plan: null });
  const [documents, setDocuments] = useState<DocSummary[]>([]);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [gitRepo, setGitRepo] = useState(false);
  const [tab, setTab] = useState<Tab>("overview");
  // A link can open a tab directly (?tab=history).
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab") as Tab | null;
    if (t) setTab(t);
  }, []);
  const brain = useBrainAvailable();
  const [activeJob, setActiveJob] = useState<string | null>(null);
  const [resumeInfo, setResumeInfo] = useState<{ sessionId: string; label: string } | null>(null);
  const [notFound, setNotFound] = useState(false);

  const startResume = useCallback((sessionId: string, label: string) => {
    setResumeInfo({ sessionId, label });
    setActiveJob(null);
    setTab("run");
  }, []);

  const load = useCallback(async () => {
    const r = await apiFetch(`/api/projects/${id}`, { cache: "no-store" });
    if (r.status === 404) {
      setNotFound(true);
      return;
    }
    const j = await r.json();
    setProject(j.project);
    setDocs(j.docs);
    setDocPaths(j.docPaths || { design: null, plan: null });
    setDocuments(j.documents || []);
    setSessions(j.sessions || []);
    setJobs(j.jobs || []);
    setAssessment(j.assessment || null);
    setGitRepo(!!j.gitRepo);
  }, [id]);

  useEffect(() => {
    load();
    const t = setInterval(load, 6000);
    return () => clearInterval(t);
  }, [load]);

  if (notFound) {
    return (
      <div className="p-8">
        <Link href="/" className="text-accent text-sm">← Dashboard</Link>
        <p className="text-muted mt-4">Project not found.</p>
      </div>
    );
  }
  if (!project || !docs) {
    return <div className="p-8 text-muted text-sm">Loading…</div>;
  }

  const liveJobs = jobs.filter((j) => ["starting", "running", "idle"].includes(j.status));
  const tabs: { key: Tab; label: string; badge?: number | string }[] = [
    { key: "overview", label: "Overview" },
    { key: "map", label: "Map", badge: assessment ? "✦" : undefined },
    ...(brain ? [{ key: "brain" as Tab, label: "Brain" }] : []),
    { key: "design", label: "Design", badge: docs.design ? undefined : "—" },
    { key: "plan", label: "Plan", badge: docs.plan ? undefined : "—" },
    { key: "tasks", label: "Tasks", badge: project.tasks.todo + project.tasks.doing + project.tasks.done || undefined },
    { key: "history", label: "History" },
    { key: "sessions", label: "Sessions", badge: sessions.length || undefined },
    { key: "run", label: "Run", badge: liveJobs.length || undefined },
  ];

  return (
    <div className="flex flex-col h-full">
      <header className="px-6 pt-5 pb-0 border-b border-border">
        <Link href="/" className="text-accent text-xs hover:underline">← Dashboard</Link>
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 mt-2">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold truncate">{project.name}</h1>
              {liveJobs.length > 0 && (
                <span className="live-dot inline-flex items-center gap-1.5 text-xs text-running font-medium">
                  <span className="w-2 h-2 rounded-full bg-running" />
                  {liveJobs.length} agent{liveJobs.length > 1 ? "s" : ""} live
                </span>
              )}
              {!project.exists && (
                <span className="text-[11px] text-bad border border-bad/30 rounded px-1.5 py-0.5">folder missing</span>
              )}
            </div>
            <div className="text-[11px] text-muted font-mono truncate mt-0.5">{project.path}</div>
          </div>
          {/* What you can do here: at the top, on every tab */}
          <div className="flex flex-wrap items-center gap-2 ml-auto">
            <Link
              href={`/assistant?project=${id}`}
              className="btn-alt px-3 py-1.5 rounded-lg border border-border text-muted text-sm hover:text-text hover:border-accent/40"
            >
              ✧ Ask a question
            </Link>
            <button
              onClick={() => setTab("run")}
              className="btn-main px-3 py-1.5 rounded-lg bg-accent/15 border border-accent/30 text-accent text-sm hover:bg-accent/25"
            >
              ▶ Run an agent
            </button>
          </div>
          <div className="text-right text-[11px] text-muted shrink-0">
            <div>{project.sessionCount} sessions</div>
            <div>last active {timeAgo(project.lastActivity)}</div>
            {project.gitBranch && <div className="font-mono">⎇ {project.gitBranch}</div>}
          </div>
        </div>

        <nav className="flex gap-1 mt-3 -mb-px overflow-x-auto [scrollbar-width:none]">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3.5 py-2 text-sm border-b-2 transition-colors ${
                tab === t.key
                  ? "border-accent text-text"
                  : "border-transparent text-muted hover:text-text"
              }`}
            >
              {t.label}
              {t.badge !== undefined && (
                <span className="ml-1.5 text-[11px] text-muted">{t.badge}</span>
              )}
            </button>
          ))}
        </nav>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto p-6">
        {tab === "overview" && (
          <Overview
            project={project}
            docs={docs}
            documents={documents}
            jobs={jobs}
            assessment={assessment}
            projectId={id}
            onReload={load}
            onGoRun={() => setTab("run")}
            onGoMap={() => setTab("map")}
            onOpenRun={(jid) => {
              setActiveJob(jid);
              setTab("run");
            }}
          />
        )}
        {tab === "map" && (
          <MapTab
            projectId={id}
            projectName={project.name}
            assessment={assessment}
            hasPlan={project.hasPlan}
            projectExists={project.exists}
            assessAttempted={jobs.some((j) => j.kind === "assess")}
            onChanged={load}
          />
        )}
        {tab === "brain" && <BrainView projectId={id} />}
        {tab === "design" && (
          <DocPane content={docs.design} kind={docPaths.design || "DESIGN.md"} projectId={id} onScaffold={load} agent={{ id: "update-design", name: "Update the design" }} />
        )}
        {tab === "plan" && (
          <DocPane content={docs.plan} kind={docPaths.plan || "PLAN.md"} projectId={id} onScaffold={load} agent={{ id: "update-plan", name: "Update the plan" }} />
        )}
        {tab === "tasks" && (
          <div className="max-w-4xl">
            <MissionBar projectId={id} gitRepo={gitRepo} todoCount={project.tasks.todo} onChange={load} />
            <TaskBoard key={project.tasks.todo + "-" + project.tasks.doing + "-" + project.tasks.done} projectId={id} initial={docs.tasks} />
          </div>
        )}
        {tab === "history" && <TurnHistory projectId={id} assessment={assessment} />}
        {tab === "sessions" && <Sessions sessions={sessions} cwd={project.path} onContinue={startResume} />}
        {tab === "run" && (
          <div className="max-w-3xl">
            {activeJob ? (
              <div className="flex flex-col h-[calc(100vh-220px)]">
                <button onClick={() => setActiveJob(null)} className="text-accent text-xs mb-3 self-start">
                  ← New job
                </button>
                <div className="flex-1 min-h-0 rounded-xl border border-border bg-panel p-4">
                  <AgentStream jobId={activeJob} />
                </div>
              </div>
            ) : (
              <>
                <RunForm
                  projectId={id}
                  gitRepo={gitRepo}
                  resume={resumeInfo}
                  onClearResume={() => setResumeInfo(null)}
                  onLaunched={(jid) => {
                    setActiveJob(jid);
                    setResumeInfo(null);
                    load();
                  }}
                />
                {jobs.length > 0 && (
                  <div className="mt-8">
                    <h3 className="text-sm font-semibold text-muted mb-2">Recent jobs</h3>
                    <div className="space-y-1.5">
                      {jobs.slice(0, 12).map((j) => (
                        <div
                          key={j.id}
                          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg border border-border bg-panel hover:border-accent/40"
                        >
                          <button onClick={() => setActiveJob(j.id)} className="flex items-center gap-3 min-w-0 flex-1 text-left">
                            <StatusBadge status={j.status} />
                            <span className="text-sm truncate">{runTitle(j)}</span>
                          </button>
                          <span className="text-[11px] text-muted shrink-0">{timeAgo(j.startedAt)}</span>
                          {j.sessionId && (
                            <button
                              onClick={() => startResume(j.sessionId!, j.prompt)}
                              className="shrink-0 text-[11px] px-2 py-1 rounded border border-accent/30 text-accent hover:bg-accent/15"
                              title="Resume this run with a new instruction"
                            >
                              Resume →
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

type OverviewTab = "documents" | "architecture" | "flowchart" | "runs";
const OVERVIEW_TAB = "protege.overview.tab";

/**
 * The Overview: a strip of where the project is up to, then four sub-tabs: its documents (the
 * status and every document with its versions), its architecture (what it is, how finished, its
 * risks, and the parts map), its flowchart (how the pieces call each other), and its agent runs (with
 * the checkpoints to go back to). The sub-tab chosen is remembered.
 */
function Overview({
  project,
  docs,
  documents,
  jobs,
  assessment,
  projectId,
  onReload,
  onGoRun,
  onGoMap,
  onOpenRun,
}: {
  project: ProjectSummary;
  docs: Docs;
  documents: DocSummary[];
  jobs: Job[];
  assessment: Assessment | null;
  projectId: string;
  onReload: () => void;
  onGoRun: () => void;
  onGoMap: () => void;
  onOpenRun: (jobId: string) => void;
}) {
  const [sub, setSub] = useState<OverviewTab>("documents");
  useEffect(() => {
    try {
      const v = localStorage.getItem(OVERVIEW_TAB) as OverviewTab | null;
      if (v && ["documents", "architecture", "flowchart", "runs"].includes(v)) setSub(v);
    } catch {}
  }, []);
  const pick = (v: OverviewTab) => {
    setSub(v);
    try {
      localStorage.setItem(OVERVIEW_TAB, v);
    } catch {}
  };
  const hasFlow = !!assessment?.architecture?.mermaid;
  const SUBS: { key: OverviewTab; label: string; badge?: number }[] = [
    { key: "documents", label: "Documents", badge: documents.length || undefined },
    { key: "architecture", label: "Architecture", badge: assessment?.components?.length || undefined },
    { key: "flowchart", label: "Flowchart" },
    { key: "runs", label: "Agent runs", badge: jobs.length || undefined },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="To do" value={project.tasks.todo} color="text-text" />
        <Stat label="In progress" value={project.tasks.doing} color="text-running" />
        <Stat label="Done" value={project.tasks.done} color="text-good" />
        <Stat label="Sessions" value={project.sessionCount} color="text-text" />
      </div>

      <div className="inline-flex flex-wrap rounded-lg border border-border p-0.5 text-[13px]" role="tablist" aria-label="Parts of the overview">
        {SUBS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={sub === t.key}
            onClick={() => pick(t.key)}
            className={`px-3 py-1.5 rounded-md inline-flex items-center gap-1.5 ${sub === t.key ? "bg-panel-2 text-text font-medium" : "text-muted hover:text-text"}`}
          >
            {t.label}
            {t.badge != null && <span className="text-[11px] text-muted tabular-nums">{t.badge}</span>}
          </button>
        ))}
      </div>

      {sub === "documents" && (
        <div className="max-w-4xl space-y-5">
          <section>
            <h2 className="text-sm font-semibold text-muted mb-2">Status</h2>
            <div className="rounded-xl border border-border bg-panel p-4">
              {docs.status ? (
                <MarkdownView content={docs.status} />
              ) : project.summary ? (
                <p className="text-sm text-muted">
                  Latest session: “{project.summary}”. No generated <code className="text-xs">status.md</code> yet — run the{" "}
                  <button onClick={onGoRun} className="text-accent underline">Summarize status</button> job to create one.
                </p>
              ) : (
                <p className="text-sm text-muted">No status yet.</p>
              )}
            </div>
          </section>
          <DocumentsList projectId={projectId} documents={documents} onChanged={onReload} />
        </div>
      )}

      {sub === "architecture" &&
        (assessment ? (
          <div className="space-y-5">
            <div className="max-w-4xl">
              <AssessmentSummary a={assessment} onGoMap={onGoMap} />
            </div>
            {assessment.components?.length ? (
              <section>
                <h2 className="text-sm font-semibold text-muted mb-2">How the parts fit together</h2>
                <div className="rounded-xl border border-border bg-panel p-5">
                  <PartsMap assessment={assessment} />
                </div>
              </section>
            ) : null}
          </div>
        ) : (
          <NoMapYet onGoMap={onGoMap} />
        ))}

      {sub === "flowchart" &&
        (hasFlow ? (
          <section>
            {assessment!.architecture.description && (
              <p className="text-[12.5px] text-muted mb-3 leading-relaxed max-w-prose">{assessment!.architecture.description}</p>
            )}
            <Mermaid chart={assessment!.architecture.mermaid} />
          </section>
        ) : (
          <NoMapYet onGoMap={onGoMap} />
        ))}

      {sub === "runs" && (
        <div className="max-w-4xl space-y-5">
          {jobs.length ? (
            <section>
              <h2 className="text-sm font-semibold text-muted mb-2">Agent runs in this project</h2>
              <div className="rounded-xl border border-border bg-panel divide-y divide-border">
                {jobs.slice(0, 40).map((j) => (
                  <button
                    key={j.id}
                    onClick={() => onOpenRun(j.id)}
                    className="w-full text-left flex items-center gap-3 px-4 py-2.5 hover:bg-panel-2/60"
                    title="Open this run"
                  >
                    <StatusBadge status={j.status} />
                    <span className="text-sm truncate flex-1">{runTitle(j)}</span>
                    <span className="text-[11px] text-muted shrink-0">
                      {fmtTokens((j.inputTokens || 0) + (j.outputTokens || 0))} tok · {fmtCost(j.costUsd)}
                    </span>
                    <span className="text-[11px] text-muted shrink-0 w-16 text-right">{timeAgo(j.startedAt)}</span>
                  </button>
                ))}
              </div>
            </section>
          ) : (
            <p className="text-sm text-muted">
              No agent has run in this project yet.{" "}
              <button onClick={onGoRun} className="text-accent underline">
                Run an agent
              </button>
            </p>
          )}
          {project.exists && <CheckpointsPanel projectId={projectId} onRestore={onReload} />}
        </div>
      )}
    </div>
  );
}

/** Architecture and Flowchart before the project has been mapped. */
function NoMapYet({ onGoMap }: { onGoMap: () => void }) {
  return (
    <div className="rounded-xl border border-border bg-panel p-5 text-sm text-muted max-w-2xl">
      Protégé hasn&apos;t mapped this project yet, so there&apos;s no architecture or flowchart to show.{" "}
      <button onClick={onGoMap} className="text-accent underline">
        Map it on the Map tab
      </button>
      .
    </div>
  );
}

function MapTab({
  projectId,
  projectName,
  assessment,
  hasPlan,
  projectExists,
  assessAttempted,
  onChanged,
}: {
  projectId: string;
  projectName: string;
  assessment: Assessment | null;
  hasPlan: boolean;
  projectExists: boolean;
  assessAttempted: boolean;
  onChanged: () => void;
}) {
  const [runningJob, setRunningJob] = useState<string | null>(null);

  const assess = useCallback(async () => {
    const r = await apiFetch(`/api/projects/${projectId}/assess`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const j = await r.json();
    if (j.job?.id) setRunningJob(j.job.id);
  }, [projectId]);

  if (runningJob) {
    return (
      <div className="max-w-3xl flex flex-col h-[calc(100vh-220px)]">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm text-muted">Assessing the codebase — reading files and mapping components…</div>
          <button
            onClick={() => {
              setRunningJob(null);
              onChanged();
            }}
            className="text-accent text-xs"
          >
            Done / view result →
          </button>
        </div>
        <div className="flex-1 min-h-0 rounded-xl border border-border bg-panel p-4">
          <AgentStream jobId={runningJob} />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl space-y-6">
      <RepoMapView projectId={projectId} />

      <div className="border-t border-border pt-5">
        {assessment ? (
          <AssessmentView
            assessment={assessment}
            projectId={projectId}
            projectName={projectName}
            hasPlan={hasPlan}
            onReassess={assess}
            onPlanSaved={onChanged}
          />
        ) : (
          <div className="rounded-xl border border-accent/25 bg-accent/5 p-6 text-center">
            <div className="text-2xl mb-2">✦</div>
            <h3 className="text-base font-semibold mb-1">Deep assessment</h3>
            <p className="text-muted text-sm mb-4 leading-relaxed max-w-xl mx-auto">
              Go beyond the code map: have an agent read the codebase and produce an architecture diagram, a summary of
              every component (what it is, what it does, its issues), a completeness estimate, and{" "}
              {hasPlan ? "a check of whether PLAN.md still matches the code" : "an inferred plan you can adopt"}.
            </p>
            <button
              onClick={assess}
              className="px-4 py-2 rounded-lg bg-accent/20 border border-accent/40 text-accent hover:bg-accent/30 text-sm font-semibold"
            >
              ✦ Assess this project
            </button>
            <p className="text-[11px] text-muted mt-3">Runs a read-mostly agent; writes only .protege/assessment.json.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl border border-border bg-panel p-3.5">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-[11px] text-muted mt-0.5">{label}</div>
    </div>
  );
}

const COMP_STATUS: { key: string; label: string; color: string }[] = [
  { key: "solid", label: "working", color: "var(--good)" },
  { key: "partial", label: "partly built", color: "var(--warn)" },
  { key: "stub", label: "only started", color: "var(--muted)" },
  { key: "broken", label: "not working", color: "var(--bad)" },
  { key: "unknown", label: "not sure yet", color: "var(--muted)" },
];

function AssessmentSummary({ a, onGoMap }: { a: Assessment; onGoMap: () => void }) {
  const completeness = Math.max(0, Math.min(100, a.completeness ?? 0));
  const counts = (a.components || []).reduce((m, c) => {
    m[c.status] = (m[c.status] || 0) + 1;
    return m;
  }, {} as Record<string, number>);

  return (
    <div className="rounded-xl border border-accent/25 bg-accent/5 p-4">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[11px] uppercase tracking-wide px-1.5 py-0.5 rounded-full border border-accent/30 bg-accent/10 text-accent font-semibold">
              ✦ {a.phase}
            </span>
            {a.stack?.slice(0, 4).map((s, i) => (
              <span key={i} className="text-[11px] text-muted">
                {s}
                {i < Math.min(3, a.stack.length - 1) ? " ·" : ""}
              </span>
            ))}
          </div>
          <div className="text-sm font-medium">{a.oneLiner}</div>
        </div>
        <button onClick={onGoMap} className="text-xs text-accent hover:underline shrink-0 mt-0.5">
          Full map →
        </button>
      </div>

      {a.status && <p className="text-xs text-muted leading-relaxed mb-3">{a.status}</p>}

      <div className="mb-3">
        <div className="flex items-center justify-between text-[11px] text-muted mb-1">
          <span>Completeness</span>
          <span>{completeness}%</span>
        </div>
        <div className="h-2 rounded-full bg-panel-2 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-accent to-good"
            style={{ width: `${completeness}%` }}
          />
        </div>
      </div>

      {(a.components?.length ?? 0) > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className="text-[11px] text-muted">{a.components.length} parts:</span>
          {COMP_STATUS.filter((s) => counts[s.key]).map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1 text-[11px]" style={{ color: s.color }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.color }} />
              {counts[s.key]} {s.label}
            </span>
          ))}
        </div>
      )}

      <div>
        {a.risks?.length > 0 && (
          <div className="rounded-lg border border-bad/20 bg-bad/5 p-3">
            <div className="text-[11px] uppercase tracking-wide text-bad/80 font-semibold mb-1.5">Top risks</div>
            <ul className="space-y-1">
              {a.risks.slice(0, 4).map((r, i) => (
                <li key={i} className="text-xs text-text flex gap-1.5">
                  <span className="text-bad shrink-0">▲</span>
                  <span className="leading-snug">{r}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

interface DocSummary {
  file: string;
  title: string;
  agentId?: string;
  agentName?: string;
  versions: number;
  lastBy?: string;
  lastAt?: number;
}

/** Every document Protégé keeps for this project, with its versions; each opens in place. */
function DocumentsList({ projectId, documents, onChanged }: { projectId: string; documents: DocSummary[]; onChanged: () => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    setText(null);
    // The current text is the newest version, which the list has just saved.
    const d = documents.find((x) => x.file === open);
    if (!d) return;
    apiFetch(`/api/projects/${projectId}/versions?file=${encodeURIComponent(open)}&n=${d.versions}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setText(j.text ?? ""))
      .catch(() => {});
  }, [open, projectId, documents]);
  return (
    <section>
      <h2 className="text-sm font-semibold text-muted mb-2">Documents</h2>
      {documents.length === 0 ? (
        <p className="text-[12.5px] text-muted">
          None yet. The agents on the Agents page write the plan, design, user guide and reports, and every version is kept.
        </p>
      ) : (
        <div className="rounded-xl border border-border bg-panel divide-y divide-border">
          {documents.map((d) => (
            <div key={d.file}>
              <button onClick={() => setOpen(open === d.file ? null : d.file)} className="w-full text-left flex items-center gap-3 px-4 py-2.5 hover:bg-panel-2">
                <span className="text-[11px] text-muted w-3">{open === d.file ? "▾" : "▸"}</span>
                <span className="min-w-0 flex-1">
                  <span className="text-sm">{d.title}</span> <span className="text-[11px] text-muted font-mono">{d.file}</span>
                  {d.lastBy && <span className="block text-[11.5px] text-muted truncate">Latest: {d.lastBy}</span>}
                </span>
                <span className="text-[11.5px] text-muted shrink-0">
                  <span className="text-accent">{d.versions} {d.versions === 1 ? "version" : "versions"}</span>
                  {d.lastAt ? ` · ${timeAgo(d.lastAt)}` : ""}
                </span>
              </button>
              {open === d.file && (
                <div className="px-4 pb-4 pt-1 bg-bg/40">
                  <DocVersions
                    projectId={projectId}
                    file={d.file}
                    content={text}
                    agent={d.agentId && d.agentName ? { id: d.agentId, name: d.agentName } : undefined}
                    onChanged={onChanged}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function DocPane({
  content,
  kind,
  projectId,
  onScaffold,
  agent,
}: {
  content: string | null;
  kind: string;
  projectId: string;
  onScaffold: () => void;
  /** The agent that keeps this document up to date. */
  agent: { id: string; name: string };
}) {
  const [busy, setBusy] = useState(false);
  const scaffold = async () => {
    setBusy(true);
    await apiFetch(`/api/projects/${projectId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "scaffold" }),
    });
    onScaffold();
    setBusy(false);
  };
  return (
    <DocVersions
      projectId={projectId}
      file={kind}
      content={content}
      agent={agent}
      onChanged={onScaffold}
      empty={
    <div className="max-w-xl text-center py-16">
      <p className="text-muted text-sm mb-4">
        No <code className="text-xs">{kind}</code> in this project yet. <b>{agent.name}</b> (the button above) writes one from the code,
        or start from templates:
      </p>
      <button
        onClick={scaffold}
        disabled={busy}
        className="px-4 py-2 rounded-lg bg-accent/15 border border-accent/30 text-accent text-sm hover:bg-accent/25 disabled:opacity-40"
      >
        {busy ? "Creating…" : "Start from templates"}
      </button>
      <p className="text-[11px] text-muted mt-3">
        Creates DESIGN.md, PLAN.md, CLAUDE.md and .protege/tasks.json templates.
      </p>
    </div>
      }
    />
  );
}

function Sessions({
  sessions,
  cwd,
  onContinue,
}: {
  sessions: SessionInfo[];
  cwd: string;
  onContinue: (sessionId: string, label: string) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="max-w-4xl">
      {sessions.length === 0 && <p className="text-muted text-sm">No Claude Code sessions recorded for this folder.</p>}
      <div className="space-y-1.5">
        {sessions.map((s) => {
          const active = Date.now() - s.lastModified < 10 * 60 * 1000;
          return (
            <div key={s.sessionId} className="rounded-lg border border-border bg-panel">
              <div className="flex items-center gap-2 px-4 py-2.5">
                <button
                  onClick={() => setOpen(open === s.sessionId ? null : s.sessionId)}
                  className="flex items-center gap-3 min-w-0 flex-1 text-left"
                >
                  <span className="text-muted text-xs shrink-0">{open === s.sessionId ? "▾" : "▸"}</span>
                  <span className="text-sm truncate">{s.summary}</span>
                  {active && (
                    <span className="live-dot inline-flex items-center gap-1 text-[11px] text-good shrink-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-good" /> active
                    </span>
                  )}
                </button>
                {s.gitBranch && <span className="text-[11px] text-muted font-mono shrink-0">⎇ {s.gitBranch}</span>}
                <span className="text-[11px] text-muted shrink-0 w-20 text-right">{timeAgo(s.lastModified)}</span>
                <button
                  onClick={() => onContinue(s.sessionId, s.summary)}
                  className="shrink-0 text-[11px] px-2 py-1 rounded border border-accent/30 text-accent hover:bg-accent/15"
                  title="Continue this session with a new instruction"
                >
                  Continue →
                </button>
              </div>
              {open === s.sessionId && (
                <SessionTranscript sessionId={s.sessionId} cwd={cwd} active={active} sessionIdShort={s.sessionId.slice(0, 8)} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface TxBlock {
  kind: "text" | "thinking" | "tool_use" | "tool_result" | "image";
  text: string;
  name?: string;
  truncated?: boolean;
  src?: string;
}
type TxCategory =
  | "instruction"
  | "decision"
  | "error"
  | "result"
  | "action"
  | "analysis"
  | "thinking";
interface TxMsg {
  idx: number;
  role: string;
  ts?: number;
  blocks: TxBlock[];
  category: TxCategory;
}

const CATEGORY_META: Record<TxCategory, { label: string; color: string }> = {
  decision: { label: "Needs you", color: "#f5c542" },
  instruction: { label: "Your input", color: "#e6934a" },
  analysis: { label: "AI analysis", color: "var(--running)" },
  thinking: { label: "Thinking", color: "#6b7280" },
  action: { label: "Action", color: "var(--accent)" },
  result: { label: "Result", color: "var(--good)" },
  error: { label: "Error", color: "var(--bad)" },
};
const CATEGORY_ORDER: TxCategory[] = [
  "decision",
  "instruction",
  "analysis",
  "action",
  "result",
  "error",
  "thinking",
];

function SessionTranscript({
  sessionId,
  cwd,
  active,
}: {
  sessionId: string;
  cwd: string;
  active: boolean;
  sessionIdShort: string;
}) {
  const [msgs, setMsgs] = useState<TxMsg[] | null>(null);
  const [meta, setMeta] = useState<{ total: number; start: number; hasOlder: boolean } | null>(null);
  const [loading, setLoading] = useState(false);
  const [live, setLive] = useState(active);
  // Thinking is silent-to-the-user by default; show it via the legend when wanted.
  const [hidden, setHidden] = useState<Set<TxCategory>>(new Set<TxCategory>(["thinking"]));

  const scrollRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  const toggleCat = (c: TxCategory) =>
    setHidden((prev) => {
      const next = new Set(prev);
      next.has(c) ? next.delete(c) : next.add(c);
      return next;
    });

  const fetchPage = (before?: number) => {
    setLoading(true);
    const url = `/api/sessions/${sessionId}?cwd=${encodeURIComponent(cwd)}&limit=80${
      before !== undefined ? `&before=${before}` : ""
    }`;
    fetch(url, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        setMeta({ total: j.total, start: j.start, hasOlder: j.hasOlder });
        setMsgs((prev) => (before !== undefined && prev ? [...j.messages, ...prev] : j.messages));
      })
      .catch(() => setMsgs([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, cwd]);

  // Live auto-update: while the session is live, poll and append new messages.
  useEffect(() => {
    if (!live) return;
    const tick = () => {
      apiFetch(`/api/sessions/${sessionId}?cwd=${encodeURIComponent(cwd)}&limit=80`, { cache: "no-store" })
        .then((r) => r.json())
        .then((j) => {
          setMeta({ total: j.total, start: j.start, hasOlder: j.hasOlder });
          setMsgs((prev) => {
            if (!prev) return j.messages;
            const maxIdx = prev.length ? prev[prev.length - 1].idx : -1;
            const fresh = (j.messages as TxMsg[]).filter((m) => m.idx > maxIdx);
            return fresh.length ? [...prev, ...fresh] : prev;
          });
        })
        .catch(() => {});
    };
    const t = setInterval(tick, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, sessionId, cwd]);

  // Keep pinned to the bottom while new messages stream in, unless the user scrolled up.
  useEffect(() => {
    if (stick.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [msgs]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  if (!msgs) return <div className="px-4 py-3 text-xs text-muted">Loading transcript…</div>;
  if (msgs.length === 0) return <div className="px-4 py-3 text-xs text-muted">Empty transcript.</div>;

  const counts = msgs.reduce((acc, m) => {
    acc[m.category] = (acc[m.category] || 0) + 1;
    return acc;
  }, {} as Record<TxCategory, number>);
  const visible = msgs.filter((m) => !hidden.has(m.category));

  return (
    <div className="border-t border-border">
      {/* Legend / filter key */}
      <div className="px-4 pt-2.5 pb-2 flex flex-wrap items-center gap-1.5 border-b border-border/60">
        {CATEGORY_ORDER.filter((c) => counts[c]).map((c) => {
          const meta = CATEGORY_META[c];
          const off = hidden.has(c);
          return (
            <button
              key={c}
              onClick={() => toggleCat(c)}
              className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] transition-opacity ${
                off ? "opacity-35" : ""
              }`}
              style={{ borderColor: `color-mix(in srgb, ${meta.color} 33%, transparent)`, color: meta.color }}
              title={off ? "Show" : "Hide"}
            >
              <span className="w-2 h-2 rounded-full" style={{ background: meta.color }} />
              {meta.label}
              <span className="text-muted/70">{counts[c]}</span>
            </button>
          );
        })}
      </div>
      <div className="px-4 py-1.5 text-[11px] text-muted flex items-center justify-between">
        <span className="flex items-center gap-2">
          {meta?.total} messages{meta && meta.total > msgs.length ? ` · showing latest ${msgs.length}` : ""}
          {active && (
            <button
              onClick={() => setLive((v) => !v)}
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[11px] ${
                live ? "border-good/40 text-good" : "border-border text-muted"
              }`}
              title={live ? "Live updating — click to pause" : "Paused — click to resume live updates"}
            >
              <span className={`w-1.5 h-1.5 rounded-full bg-current ${live ? "live-dot" : ""}`} />
              {live ? "Live" : "Paused"}
            </button>
          )}
        </span>
        <span className="flex items-center gap-3">
          {meta?.hasOlder && (
            <button onClick={() => fetchPage(meta.start)} disabled={loading} className="text-accent hover:underline">
              {loading ? "Loading…" : "↑ Load older"}
            </button>
          )}
          <button onClick={() => fetchPage()} disabled={loading} className="text-accent hover:underline" title="Reload the newest messages">
            ↻ Refresh
          </button>
        </span>
      </div>
      <div ref={scrollRef} onScroll={onScroll} className="px-4 pb-3 max-h-[520px] overflow-y-auto space-y-2.5">
        {visible.map((m, i) => (
          <TranscriptMessage key={m.idx ?? i} m={m} />
        ))}
      </div>
    </div>
  );
}

function TranscriptMessage({ m }: { m: TxMsg }) {
  if (m.blocks.length === 0) return null;
  const cat = CATEGORY_META[m.category];
  return (
    <div
      className="rounded-lg border border-border bg-panel-2/30 p-2.5"
      style={{ borderLeft: `3px solid ${cat.color}` }}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span
          className="text-[11px] font-medium px-1.5 py-0.5 rounded"
          style={{ background: `color-mix(in srgb, ${cat.color} 13%, transparent)`, color: cat.color }}
        >
          {cat.label}
        </span>
        <span className="text-[11px] uppercase tracking-wide text-muted/60">{m.role}</span>
      </div>
      <div className="space-y-1.5">
        {m.blocks.map((b, i) => (
          <TranscriptBlock key={i} b={b} />
        ))}
      </div>
    </div>
  );
}

function TranscriptBlock({ b }: { b: TxBlock }) {
  if (b.kind === "image") {
    return (
      <a href={b.src} target="_blank" rel="noopener noreferrer" className="inline-block">
        <img
          src={b.src}
          alt="screenshot"
          className="max-h-40 rounded-lg border border-border my-0.5 hover:border-accent/50"
        />
      </a>
    );
  }
  if (b.kind === "text") {
    return (
      <div className="text-sm text-text">
        <TranscriptText>{b.text}</TranscriptText>
        {b.truncated && <span className="text-muted/60"> …</span>}
      </div>
    );
  }
  if (b.kind === "thinking") {
    return (
      <div className="text-xs text-muted/70 italic whitespace-pre-wrap leading-relaxed break-words">
        💭 {b.text}
        {b.truncated && <span className="text-muted/60"> …</span>}
      </div>
    );
  }
  if (b.kind === "tool_use") {
    const { preview, pretty } = toolInput(b.text);
    return (
      <details className="group">
        <summary className="cursor-pointer text-xs font-mono">
          <span className="text-warn">🔧 {b.name}</span>
          {preview && <span className="text-muted">{"  "}{preview}</span>}
        </summary>
        <pre className="mt-1 text-[11px] font-mono text-muted whitespace-pre-wrap break-words bg-bg rounded p-2 overflow-x-auto">
          {pretty}
          {b.truncated ? "\n… (truncated)" : ""}
        </pre>
      </details>
    );
  }
  // tool_result
  const resultPreview = b.text.replace(/\s+/g, " ").trim().slice(0, 80);
  return (
    <details className="group">
      <summary className="cursor-pointer text-xs font-mono">
        <span className="text-muted">↳ result</span>
        {resultPreview && <span className="text-muted/60">{"  "}{resultPreview}</span>}
      </summary>
      <pre className="mt-1 text-[11px] font-mono text-muted/80 whitespace-pre-wrap break-words bg-bg rounded p-2 overflow-x-auto">
        {b.text}
        {b.truncated ? "\n… (truncated)" : ""}
      </pre>
    </details>
  );
}

// Parse a tool_use input (stored as JSON) into a one-line preview + a readable
// expanded form (the command / file / query rather than raw JSON where possible).
function toolInput(text: string): { preview: string; pretty: string } {
  let obj: any;
  try {
    obj = JSON.parse(text);
  } catch {
    return { preview: text.replace(/\s+/g, " ").trim().slice(0, 80), pretty: text };
  }
  if (obj == null || typeof obj !== "object") {
    return { preview: String(obj).slice(0, 80), pretty: text };
  }
  const first =
    obj.command ??
    obj.file_path ??
    obj.path ??
    obj.pattern ??
    obj.url ??
    obj.query ??
    obj.prompt ??
    obj.description ??
    "";
  const preview = String(first).replace(/\s+/g, " ").trim().slice(0, 90);
  // Prefer showing the command verbatim; else pretty-print the whole input.
  const pretty =
    typeof obj.command === "string"
      ? obj.command + (obj.description ? `\n# ${obj.description}` : "")
      : JSON.stringify(obj, null, 2);
  return { preview, pretty };
}
