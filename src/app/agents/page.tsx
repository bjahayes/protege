"use client";

// Agents: the library of agents (built-in ones and your own) and every run of them. Pick an
// agent to see what it does and run it on a project, or make a new one. Pick a run to see which
// agent it was, what it was asked, and its live output.

import { apiFetch } from "@/lib/api-client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import type { Job, ProjectSummary } from "@/lib/types";
import { changesText, runAgentLabel, taskOnly, type AgentDef, type AgentKind } from "@/lib/agents";
import { timeAgo, fmtCost, fmtTokens, fmtDuration } from "@/lib/format";
import StatusBadge from "@/components/StatusBadge";
import AgentStream from "@/components/AgentStream";

const LIVE_STATUSES = ["starting", "running", "idle"];

type Sel = { type: "agent"; id: string } | { type: "run"; id: string } | { type: "new"; from?: AgentDef } | { type: "edit"; id: string } | null;

interface Group {
  key: string;
  title: string;
  blurb: string;
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<AgentDef[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [live, setLive] = useState<Job[]>([]);
  const [recent, setRecent] = useState<Job[]>([]);
  const [view, setView] = useState<"agents" | "runs">("agents");
  const [sel, setSel] = useState<Sel>(null);
  const [, setTick] = useState(0);
  const [fProject, setFProject] = useState("all");
  const [fAgent, setFAgent] = useState("all");

  const loadAgents = useCallback(async () => {
    const r = await apiFetch("/api/agents", { cache: "no-store" });
    const j = await r.json();
    setAgents(j.agents || []);
    setGroups(j.groups || []);
  }, []);
  const loadRuns = useCallback(async () => {
    const r = await apiFetch("/api/jobs", { cache: "no-store" });
    const j = await r.json();
    setLive(j.live || []);
    setRecent(j.jobs || []);
  }, []);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const job = q.get("job");
    const agent = q.get("agent");
    if (job) {
      setView("runs");
      setSel({ type: "run", id: job });
    } else if (agent) setSel({ type: "agent", id: agent });
    loadAgents();
    loadRuns();
    const poll = setInterval(loadRuns, 3000);
    const tick = setInterval(() => setTick((n) => n + 1), 1000);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [loadAgents, loadRuns]);

  // Open on the first agent, so the right-hand side is never empty.
  useEffect(() => {
    if (!sel && agents.length) setSel({ type: "agent", id: agents[0].id });
  }, [sel, agents]);

  const label = (j: Job) => runAgentLabel(j, agents);
  const liveIds = new Set(live.map((j) => j.id));
  const allRuns = [...live, ...recent.filter((j) => !liveIds.has(j.id))];
  const projects = Array.from(new Map(allRuns.map((j) => [j.projectId, j.projectName])).entries()).sort((a, b) => a[1].localeCompare(b[1]));
  const agentNames = Array.from(new Set(allRuns.map((j) => label(j).name))).sort();
  const runs = allRuns.filter((j) => (fProject === "all" || j.projectId === fProject) && (fAgent === "all" || label(j).name === fAgent));
  const liveRuns = runs.filter((j) => LIVE_STATUSES.includes(j.status));
  const pastRuns = runs.filter((j) => !LIVE_STATUSES.includes(j.status));

  const openRun = (id: string) => {
    setView("runs");
    setSel({ type: "run", id });
    loadRuns();
  };

  return (
    <div className="flex h-full">
      <div className="w-[380px] shrink-0 border-r border-border overflow-y-auto">
        <header className="px-5 py-4 border-b border-border sticky top-0 bg-bg z-10">
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-lg font-bold">Agents</h1>
            <button
              onClick={() => {
                setView("agents");
                setSel({ type: "new" });
              }}
              className="text-xs px-2.5 py-1.5 rounded-lg bg-accent/15 border border-accent/40 text-accent hover:bg-accent/25 font-medium"
            >
              ＋ New agent
            </button>
          </div>
          <p className="text-xs text-muted mt-1 leading-relaxed">
            An agent is a job Claude does for you, with its own instructions and limits on what it may change.
          </p>
          <div className="flex rounded-lg border border-border overflow-hidden text-[12.5px] mt-3">
            {(
              [
                ["agents", `Agents (${agents.length})`],
                ["runs", liveRuns.length ? `Runs · ${liveRuns.length} running` : "Runs"],
              ] as ["agents" | "runs", string][]
            ).map(([k, t]) => (
              <button
                key={k}
                onClick={() => setView(k)}
                className={`flex-1 px-3 py-1.5 ${view === k ? "bg-panel-2 text-text" : "text-muted hover:text-text"}`}
              >
                {t}
              </button>
            ))}
          </div>
          {view === "runs" && (
            <div className="flex gap-2 mt-2.5">
              <select
                value={fAgent}
                onChange={(e) => setFAgent(e.target.value)}
                className="flex-1 min-w-0 px-2 py-1.5 rounded-lg bg-panel border border-border text-xs focus:outline-none focus:border-accent/60"
              >
                <option value="all">Every agent</option>
                {agentNames.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <select
                value={fProject}
                onChange={(e) => setFProject(e.target.value)}
                className="flex-1 min-w-0 px-2 py-1.5 rounded-lg bg-panel border border-border text-xs focus:outline-none focus:border-accent/60"
              >
                <option value="all">Every project</option>
                {projects.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </header>

        {view === "agents" ? (
          groups.map((g) => {
            const list = agents.filter((a) => a.group === g.key);
            if (g.key === "mine" && !list.length)
              return (
                <Section key={g.key} title={g.title}>
                  <p className="px-5 pb-2 text-[12px] text-muted leading-relaxed">
                    Make your own for a job you do often, such as checking a contract template against your firm&apos;s style
                    guide.{" "}
                    <button onClick={() => setSel({ type: "new" })} className="text-accent hover:underline">
                      Make one
                    </button>
                  </p>
                </Section>
              );
            return (
              <Section key={g.key} title={g.title} blurb={g.blurb}>
                {list.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => setSel({ type: "agent", id: a.id })}
                    className={`w-full text-left px-5 py-2.5 border-l-2 flex gap-3 ${
                      sel?.type === "agent" && sel.id === a.id ? "border-accent bg-panel-2" : "border-transparent hover:bg-panel/60"
                    }`}
                  >
                    <span className="text-lg leading-none mt-0.5">{a.emoji}</span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{a.name}</span>
                      <span className="block text-[12px] text-muted leading-snug mt-0.5">{a.summary}</span>
                    </span>
                  </button>
                ))}
              </Section>
            );
          })
        ) : (
          <>
            {liveRuns.length > 0 && (
              <Section title="Running now">
                {liveRuns.map((j) => (
                  <RunRow key={j.id} j={j} label={label(j)} selected={sel?.type === "run" && sel.id === j.id} onClick={() => setSel({ type: "run", id: j.id })} />
                ))}
              </Section>
            )}
            <Section title="Earlier">
              {pastRuns.length === 0 && <div className="px-5 py-3 text-xs text-muted">No runs{fProject !== "all" || fAgent !== "all" ? " match" : " yet"}.</div>}
              {pastRuns.map((j) => (
                <RunRow key={j.id} j={j} label={label(j)} selected={sel?.type === "run" && sel.id === j.id} onClick={() => setSel({ type: "run", id: j.id })} />
              ))}
            </Section>
          </>
        )}
      </div>

      <div className="flex-1 min-w-0 overflow-y-auto">
        {sel?.type === "agent" && (
          <AgentPanel
            key={sel.id}
            id={sel.id}
            onRan={openRun}
            onEdit={() => setSel({ type: "edit", id: sel.id })}
            onCopy={(a) => setSel({ type: "new", from: a })}
            onDeleted={() => {
              loadAgents();
              setSel(null);
            }}
          />
        )}
        {(sel?.type === "new" || sel?.type === "edit") && (
          <AgentEditor
            key={sel.type === "edit" ? sel.id : `new-${sel.from?.id || ""}`}
            existing={sel.type === "edit" ? agents.find((a) => a.id === sel.id) : undefined}
            from={sel.type === "new" ? sel.from : undefined}
            onSaved={(a) => {
              loadAgents();
              setSel({ type: "agent", id: a.id });
            }}
            onCancel={() => setSel(null)}
          />
        )}
        {sel?.type === "run" && <RunPanel job={allRuns.find((j) => j.id === sel.id)} jobId={sel.id} agents={agents} />}
      </div>
    </div>
  );
}

function Section({ title, blurb, children }: { title: string; blurb?: string; children: React.ReactNode }) {
  return (
    <div className="py-2">
      <div className="px-5 pt-1.5 text-[11px] uppercase tracking-wide text-muted/70 font-semibold">{title}</div>
      {blurb && <div className="px-5 pb-1.5 pt-0.5 text-[11.5px] text-muted/80 leading-snug">{blurb}</div>}
      {children}
    </div>
  );
}

function RunRow({ j, label, selected, onClick }: { j: Job; label: { name: string; emoji: string }; selected: boolean; onClick: () => void }) {
  const e = j.recentEvents?.[j.recentEvents.length - 1];
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-5 py-3 border-l-2 transition-colors ${selected ? "border-accent bg-panel-2" : "border-transparent hover:bg-panel/60"}`}
    >
      <div className="flex items-center gap-2">
        <span>{label.emoji}</span>
        <span className="text-sm font-medium truncate">{label.name}</span>
        <span className="ml-auto shrink-0">
          <StatusBadge status={j.status} />
        </span>
      </div>
      <div className="flex items-center gap-3 text-[11px] text-muted mt-1">
        <span className="truncate">{j.projectName}</span>
        <span className="ml-auto shrink-0">{timeAgo(j.startedAt)}</span>
      </div>
      {LIVE_STATUSES.includes(j.status) && e && (
        <div className="text-[11px] text-muted font-mono truncate mt-1 live-dot">
          {e.type === "tool" ? "🔧" : "▪"} {e.label}
        </div>
      )}
    </button>
  );
}

const KIND_TEXT: Record<AgentKind, { title: string; text: string }> = {
  document: { title: "Keeps one document", text: "May edit only the document you name. Every run saves a new version of it." },
  report: { title: "Writes a report", text: "Reads the project and writes a report. Changes nothing else. Every run saves a new version." },
  plan: { title: "Only reads", text: "Reads the project and answers. Changes nothing." },
  change: { title: "Makes changes", text: "Edits the project's files, on a safe copy when the project uses git." },
};

function AgentPanel({
  id,
  onRan,
  onEdit,
  onCopy,
  onDeleted,
}: {
  id: string;
  onRan: (jobId: string) => void;
  onEdit: () => void;
  onCopy: (a: AgentDef) => void;
  onDeleted: () => void;
}) {
  const [d, setD] = useState<{ agent: AgentDef; changes: string; history: { version: number; savedAt: number }[]; runs: Job[] } | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [projectId, setProjectId] = useState("");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch(`/api/agents/${id}`, { cache: "no-store" })
      .then((r) => r.json())
      .then(setD)
      .catch(() => {});
    apiFetch("/api/projects", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        const list = (j.projects || []).filter((p: ProjectSummary) => p.exists);
        setProjects(list);
        setProjectId((cur) => cur || list[0]?.id || "");
      })
      .catch(() => {});
  }, [id]);

  if (!d?.agent) return <div className="p-6 text-sm text-muted">Loading…</div>;
  const a = d.agent;

  const run = async () => {
    setBusy(true);
    setError(null);
    const r = await apiFetch(`/api/agents/${a.id}/run`, { method: "POST", body: JSON.stringify({ projectId, input }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (j.job?.id) onRan(j.job.id);
    else setError(j.error || "Couldn't start the agent.");
  };

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-start gap-3">
        <div className="text-3xl leading-none">{a.emoji}</div>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-bold">{a.name}</h2>
          <div className="text-[12px] text-muted mt-0.5">
            {a.builtIn ? "Built into Protégé" : "Your agent"} · version {a.version}
            {a.updatedAt ? `, saved ${timeAgo(a.updatedAt)}` : ""}
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          {!a.builtIn && (
            <button onClick={onEdit} className="text-xs px-2.5 py-1.5 rounded-lg border border-border text-muted hover:text-text">
              Edit
            </button>
          )}
          {!a.special && (
            <button onClick={() => onCopy(a)} className="text-xs px-2.5 py-1.5 rounded-lg border border-border text-muted hover:text-text">
              Make a copy
            </button>
          )}
        </div>
      </div>

      <p className="text-sm leading-relaxed mt-4">{a.description || a.summary}</p>
      <div className="mt-3 text-[12.5px] rounded-lg border border-border bg-panel px-3 py-2">
        <span className="font-medium">What it may change: </span>
        <span className="text-muted">{d.changes}</span>
      </div>

      <section className="mt-6 rounded-xl border border-accent/30 bg-accent/5 p-4">
        <h3 className="text-sm font-semibold mb-3">Run it</h3>
        <label className="block text-[12.5px] text-muted mb-1">On which project?</label>
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="w-full px-3 py-2 rounded-lg bg-bg border border-border text-sm focus:outline-none focus:border-accent/60"
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        {a.input && (
          <>
            <label className="block text-[12.5px] text-muted mt-3 mb-1">{a.input.label}</label>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={a.input.placeholder}
              rows={3}
              className="w-full px-3 py-2 rounded-lg bg-bg border border-border text-sm focus:outline-none focus:border-accent/60"
            />
          </>
        )}
        {error && <div className="text-[12.5px] text-bad mt-2">{error}</div>}
        <button
          onClick={run}
          disabled={busy || !projectId || (!!a.input?.required && !input.trim())}
          className="mt-3 px-4 py-2 rounded-lg bg-accent/20 border border-accent/40 text-accent hover:bg-accent/30 text-sm font-semibold disabled:opacity-50"
        >
          {busy ? "Starting…" : `▶ Run ${a.name}`}
        </button>
      </section>

      {d.runs.length > 0 && (
        <section className="mt-6">
          <h3 className="text-sm font-semibold text-muted mb-2">Its recent runs</h3>
          <div className="rounded-xl border border-border bg-panel divide-y divide-border">
            {d.runs.slice(0, 8).map((j) => (
              <button key={j.id} onClick={() => onRan(j.id)} className="w-full text-left flex items-center gap-3 px-4 py-2.5 hover:bg-panel-2">
                <StatusBadge status={j.status} />
                <span className="text-sm truncate flex-1">{j.projectName}</span>
                <span className="text-[11px] text-muted shrink-0">version {j.agentVersion ?? 1} of the agent</span>
                <span className="text-[11px] text-muted shrink-0 w-16 text-right">{timeAgo(j.startedAt)}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {a.instructions && (
        <details className="mt-6">
          <summary className="text-sm font-semibold text-muted cursor-pointer select-none">Its instructions</summary>
          <pre className="mt-2 whitespace-pre-wrap text-[12.5px] leading-relaxed rounded-lg border border-border bg-panel p-3 font-sans">{a.instructions}</pre>
        </details>
      )}

      {d.history.length > 1 && (
        <section className="mt-6">
          <h3 className="text-sm font-semibold text-muted mb-2">Its versions</h3>
          <ul className="text-[12.5px] text-muted space-y-1">
            {d.history.map((h) => (
              <li key={h.version}>
                Version {h.version}, saved {new Date(h.savedAt).toLocaleString()}
              </li>
            ))}
          </ul>
        </section>
      )}

      {!a.builtIn && (
        <button
          onClick={async () => {
            if (!confirm(`Delete ${a.name}? Its past runs stay in the history.`)) return;
            await apiFetch(`/api/agents/${a.id}`, { method: "DELETE" }).catch(() => {});
            onDeleted();
          }}
          className="mt-8 text-xs text-bad hover:underline"
        >
          Delete this agent
        </button>
      )}
    </div>
  );
}

function AgentEditor({
  existing,
  from,
  onSaved,
  onCancel,
}: {
  existing?: AgentDef;
  from?: AgentDef;
  onSaved: (a: AgentDef) => void;
  onCancel: () => void;
}) {
  const base = existing || from;
  const [name, setName] = useState(existing ? existing.name : from ? `${from.name} (my copy)` : "");
  const [emoji, setEmoji] = useState(base?.emoji || "🤖");
  const [summary, setSummary] = useState(base?.summary || "");
  const [kind, setKind] = useState<AgentKind>(base?.kind || "report");
  const [document, setDocument] = useState(base?.kind === "document" ? base.document || "" : "");
  const [instructions, setInstructions] = useState(base ? taskOnly(base) : "");
  const [inputLabel, setInputLabel] = useState(base?.input?.label || "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    setError(null);
    const r = await apiFetch("/api/agents", {
      method: "POST",
      body: JSON.stringify({ id: existing?.id, name, emoji, summary, kind, document, instructions, inputLabel }),
    });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (j.agent) onSaved(j.agent);
    else setError(j.error || "Couldn't save the agent.");
  };

  const field = "w-full px-3 py-2 rounded-lg bg-bg border border-border text-sm focus:outline-none focus:border-accent/60";
  return (
    <div className="p-6 max-w-3xl">
      <h2 className="text-xl font-bold">{existing ? `Edit ${existing.name}` : "New agent"}</h2>
      <p className="text-sm text-muted mt-1">
        {existing
          ? `Saving makes version ${existing.version + 1}. Earlier versions are kept, so past runs still show what they were asked.`
          : "Describe a job you want Claude to do on your projects. You can run it on any project afterwards."}
      </p>

      <div className="mt-5 grid grid-cols-[64px_minmax(0,1fr)] gap-3">
        <div>
          <label className="block text-[12.5px] text-muted mb-1">Icon</label>
          <input value={emoji} onChange={(e) => setEmoji(e.target.value)} className={`${field} text-center`} maxLength={4} />
        </div>
        <div>
          <label className="block text-[12.5px] text-muted mb-1">Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Check against our style guide" className={field} />
        </div>
      </div>

      <label className="block text-[12.5px] text-muted mt-4 mb-1">What may it change?</label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {(Object.keys(KIND_TEXT) as AgentKind[]).map((k) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            className={`text-left rounded-lg border px-3 py-2 ${kind === k ? "border-accent bg-accent/10" : "border-border hover:border-accent/40"}`}
          >
            <div className="text-sm font-medium">{KIND_TEXT[k].title}</div>
            <div className="text-[12px] text-muted leading-snug mt-0.5">{KIND_TEXT[k].text}</div>
          </button>
        ))}
      </div>
      {kind === "document" && (
        <>
          <label className="block text-[12.5px] text-muted mt-3 mb-1">Which document, inside the project?</label>
          <input value={document} onChange={(e) => setDocument(e.target.value)} placeholder="e.g. docs/STYLE.md" className={field} />
        </>
      )}

      <label className="block text-[12.5px] text-muted mt-4 mb-1">What should it do?</label>
      <textarea
        value={instructions}
        onChange={(e) => setInstructions(e.target.value)}
        rows={8}
        placeholder="In plain words, as you'd brief a colleague: what to look at, what to produce, and what good looks like."
        className={field}
      />

      <label className="block text-[12.5px] text-muted mt-4 mb-1">
        A question to ask before each run <span className="text-muted/70">(optional; the answer replaces {"{input}"} in the instructions)</span>
      </label>
      <input value={inputLabel} onChange={(e) => setInputLabel(e.target.value)} placeholder="e.g. Which clause should it check?" className={field} />

      <label className="block text-[12.5px] text-muted mt-4 mb-1">One-line summary <span className="text-muted/70">(optional)</span></label>
      <input value={summary} onChange={(e) => setSummary(e.target.value)} className={field} />

      {error && <div className="text-[12.5px] text-bad mt-3">{error}</div>}
      <div className="flex gap-2 mt-5">
        <button
          onClick={save}
          disabled={busy}
          className="px-4 py-2 rounded-lg bg-accent/20 border border-accent/40 text-accent hover:bg-accent/30 text-sm font-semibold disabled:opacity-50"
        >
          {busy ? "Saving…" : existing ? `Save version ${existing.version + 1}` : "Save agent"}
        </button>
        <button onClick={onCancel} className="px-4 py-2 rounded-lg border border-border text-sm text-muted hover:text-text">
          Cancel
        </button>
      </div>
      <p className="text-[12px] text-muted mt-3">{changesText({ kind, document: kind === "report" ? ".protege/reports/<this agent>.md" : document || "the document" } as AgentDef)}</p>
    </div>
  );
}

function RunPanel({ job, jobId, agents }: { job?: Job; jobId: string; agents: AgentDef[] }) {
  if (!job) return <div className="p-6 text-sm text-muted">Loading…</div>;
  const l = runAgentLabel(job, agents);
  return (
    <div className="flex flex-col h-full p-6">
      <div className="flex items-start gap-3">
        <div className="text-2xl leading-none">{l.emoji}</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-lg font-bold">{l.name}</h2>
            <StatusBadge status={job.status} />
          </div>
          <div className="text-[12px] text-muted mt-0.5 flex flex-wrap gap-x-3">
            <span>
              on{" "}
              <Link href={`/projects/${job.projectId}`} className="text-accent hover:underline">
                {job.projectName}
              </Link>
            </span>
            {job.agentId && <span>agent version {job.agentVersion ?? 1}</span>}
            <span>started {timeAgo(job.startedAt)}</span>
            <span>{fmtDuration(job.startedAt, job.endedAt)}</span>
            <span>{fmtTokens((job.inputTokens || 0) + (job.outputTokens || 0))} tokens</span>
            <span className="text-good">{fmtCost(job.costUsd)} at API prices</span>
          </div>
        </div>
        {job.agentId && (
          <Link href={`/agents?agent=${job.agentId}`} className="text-xs text-accent hover:underline shrink-0">
            About this agent →
          </Link>
        )}
      </div>
      {(() => {
        const a = agents.find((x) => x.id === job.agentId);
        return a?.document ? (
          <div className="mt-3 text-[12.5px] rounded-lg border border-border bg-panel px-3 py-2">
            It keeps <span className="font-mono">{a.document}</span>. Read it, and every version of it, under <b>Documents</b> on{" "}
            <Link href={`/projects/${job.projectId}`} className="text-accent hover:underline">
              {job.projectName}&apos;s Overview
            </Link>
            .
          </div>
        ) : null;
      })()}
      <details className="mt-3 shrink-0">
        <summary className="text-[12.5px] font-medium text-muted cursor-pointer select-none">What it was asked</summary>
        <pre className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap text-[12.5px] leading-relaxed rounded-lg border border-border bg-panel p-3 font-sans">{job.prompt}</pre>
      </details>
      <div className="flex-1 min-h-[300px] rounded-xl border border-border bg-panel p-4 mt-3">
        <AgentStream jobId={jobId} />
      </div>
    </div>
  );
}
