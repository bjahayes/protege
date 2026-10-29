"use client";

import { apiFetch } from "@/lib/api-client";
import { useEffect, useState } from "react";
import { changesText, type AgentDef } from "@/lib/agents";

interface Props {
  projectId: string;
  gitRepo?: boolean;
  resume?: { sessionId: string; label: string } | null;
  onClearResume?: () => void;
  onLaunched: (jobId: string) => void;
}

const MODELS = [
  { id: "", label: "Default" },
  { id: "claude-opus-4-8", label: "Opus 4.8" },
  { id: "claude-opus-5", label: "Opus 5" },
  { id: "claude-sonnet-5", label: "Sonnet 5" },
  { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5" },
];

const OWN = "own";

export default function RunForm({ projectId, gitRepo, resume, onClearResume, onLaunched }: Props) {
  // Which agent to run; OWN is "your own instruction", with every option.
  const [agents, setAgents] = useState<AgentDef[]>([]);
  const [groups, setGroups] = useState<{ key: string; title: string }[]>([]);
  const [agentId, setAgentId] = useState("make-change");
  const [input, setInput] = useState("");
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState("");
  const [permission, setPermission] = useState("acceptEdits");
  const [effort, setEffort] = useState("");
  const [maxTurns, setMaxTurns] = useState("");
  const [isolate, setIsolate] = useState(false);
  const [autoResume, setAutoResume] = useState(true);
  const [primeContext, setPrimeContext] = useState(true);
  const [autoFix, setAutoFix] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/api/agents", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        setAgents(j.agents || []);
        setGroups(j.groups || []);
      })
      .catch(() => {});
  }, []);

  // Continuing a session is always your own instruction.
  useEffect(() => {
    if (resume) {
      setAgentId(OWN);
      setPrompt("");
    }
  }, [resume?.sessionId]);

  const agent = agentId === OWN ? null : agents.find((a) => a.id === agentId) || null;

  const runAgent = async () => {
    if (!agent) return;
    setBusy(true);
    setErr(null);
    const r = await apiFetch(`/api/agents/${agent.id}/run`, {
      method: "POST",
      body: JSON.stringify({ projectId, input, model: model || undefined, effort: effort || undefined }),
    });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (j.job?.id) onLaunched(j.job.id);
    else setErr(j.error || "Couldn't start the agent.");
  };

  const launch = async () => {
    if (agent) return runAgent();
    if (!prompt.trim()) {
      setErr("Prompt is required");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const r = await apiFetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          prompt,
          model: model || undefined,
          permissionMode: permission,
          effort: effort || undefined,
          maxTurns: maxTurns ? Number(maxTurns) : undefined,
          isolate: isolate && gitRepo,
          resume: resume?.sessionId,
          autoResume,
          primeContext,
          autoVerify: autoFix && isolate && gitRepo,
          autoFix: autoFix && isolate && gitRepo,
        }),
      });
      const j = await r.json();
      if (!r.ok) {
        setErr(j.error || "Failed to launch");
        setBusy(false);
        return;
      }
      onLaunched(j.job.id);
    } catch (e: any) {
      setErr(e?.message || "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      {resume && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-accent/30 bg-accent/5 px-3 py-2">
          <div className="min-w-0">
            <div className="text-xs font-medium text-accent">Continuing session</div>
            <div className="text-[11px] text-muted truncate">
              {resume.label} · <span className="font-mono">{resume.sessionId.slice(0, 8)}</span>
            </div>
          </div>
          <button onClick={onClearResume} className="shrink-0 text-[11px] text-muted hover:text-text px-2 py-1">
            ✕ start fresh
          </button>
        </div>
      )}
      <Field label="Agent">
        <select value={agentId} onChange={(e) => setAgentId(e.target.value)} className="protege-select" disabled={!!resume}>
          {groups.map((g) => {
            const list = agents.filter((a) => a.group === g.key);
            return list.length ? (
              <optgroup key={g.key} label={g.title}>
                {list.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.emoji} {a.name}
                  </option>
                ))}
              </optgroup>
            ) : null;
          })}
          <option value={OWN}>💬 Your own instruction</option>
        </select>
      </Field>

      {agent ? (
        <div className="rounded-lg border border-border bg-panel px-3 py-2.5 text-[12.5px] leading-relaxed">
          <div>{agent.description || agent.summary}</div>
          <div className="text-muted mt-1">{changesText(agent)}</div>
        </div>
      ) : (
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={7}
          placeholder="Describe the job for Claude…"
          className="w-full px-3 py-2.5 rounded-lg bg-bg border border-border text-sm leading-relaxed focus:outline-none focus:border-accent/60 resize-y"
        />
      )}
      {agent?.input && (
        <Field label={agent.input.label}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={3}
            placeholder={agent.input.placeholder}
            className="w-full px-3 py-2 rounded-lg bg-bg border border-border text-sm focus:outline-none focus:border-accent/60"
          />
        </Field>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        <Field label="Model">
          <select value={model} onChange={(e) => setModel(e.target.value)} className="protege-select">
            {MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </Field>
        {!agent && <Field label="Permission">
          <select value={permission} onChange={(e) => setPermission(e.target.value)} className="protege-select">
            <option value="plan">plan (read-only)</option>
            <option value="default">default (ask)</option>
            <option value="acceptEdits">acceptEdits</option>
            <option value="bypassPermissions">bypass (danger)</option>
          </select>
        </Field>}
        <Field label="Effort">
          <select value={effort} onChange={(e) => setEffort(e.target.value)} className="protege-select">
            <option value="">default</option>
            <option value="low">low</option>
            <option value="medium">medium</option>
            <option value="high">high</option>
          </select>
        </Field>
        {!agent && <Field label="Max turns">
          <input
            value={maxTurns}
            onChange={(e) => setMaxTurns(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder="∞"
            className="protege-select"
          />
        </Field>}
      </div>

      {!agent && (
        <>
      <label
        className={`flex items-start gap-2.5 rounded-lg border p-2.5 cursor-pointer ${
          gitRepo ? "border-border hover:border-accent/40" : "border-border opacity-50 cursor-not-allowed"
        }`}
      >
        <input
          type="checkbox"
          checked={isolate && !!gitRepo}
          disabled={!gitRepo}
          onChange={(e) => setIsolate(e.target.checked)}
          className="mt-0.5"
        />
        <div>
          <div className="text-sm">
            Isolate in a git worktree{" "}
            {!gitRepo && <span className="text-[11px] text-muted">(project isn't a git repo)</span>}
          </div>
          <div className="text-[11px] text-muted">
            The agent works on a separate branch in its own checkout. Review its diff and Apply or Discard when it's
            done — nothing touches your working tree until you approve it.
          </div>
        </div>
      </label>

      <label className="flex items-start gap-2.5 rounded-lg border border-border p-2.5 cursor-pointer hover:border-accent/40">
        <input type="checkbox" checked={autoResume} onChange={(e) => setAutoResume(e.target.checked)} className="mt-0.5" />
        <div>
          <div className="text-sm">Auto-continue past the turn limit</div>
          <div className="text-[11px] text-muted">
            If the agent hits its max turns before finishing, resume the same session automatically (up to 3×).
          </div>
        </div>
      </label>

      <label className="flex items-start gap-2.5 rounded-lg border border-border p-2.5 cursor-pointer hover:border-accent/40">
        <input type="checkbox" checked={primeContext} onChange={(e) => setPrimeContext(e.target.checked)} className="mt-0.5" />
        <div>
          <div className="text-sm">Prime with project context</div>
          <div className="text-[11px] text-muted">
            Start the agent warm with a code-map + assessment orientation, so it doesn&apos;t explore from scratch.
          </div>
        </div>
      </label>

      <label
        className={`flex items-start gap-2.5 rounded-lg border p-2.5 cursor-pointer ${
          isolate && gitRepo ? "border-border hover:border-accent/40" : "border-border opacity-50 cursor-not-allowed"
        }`}
      >
        <input
          type="checkbox"
          checked={autoFix && isolate && gitRepo}
          disabled={!(isolate && gitRepo)}
          onChange={(e) => setAutoFix(e.target.checked)}
          className="mt-0.5"
        />
        <div>
          <div className="text-sm">
            Verify &amp; auto-fix{" "}
            {!(isolate && gitRepo) && <span className="text-[11px] text-muted">(needs worktree isolation)</span>}
          </div>
          <div className="text-[11px] text-muted">
            After the run, run the project&apos;s tests/build in the worktree; if they fail, spawn a fix pass (up to 2×).
          </div>
        </div>
      </label>

        </>
      )}

      {err && <div className="text-bad text-xs">{err}</div>}

      <div className="flex items-center justify-between">
        <p className="text-[11px] text-muted max-w-md">
          {agent
            ? "Runs Claude Code in this project folder with your existing login, under this agent's limits."
            : "Runs Claude Code in this project folder with your existing login. `plan` mode is read-only and safe to explore with."}
        </p>
        <button
          onClick={launch}
          disabled={busy}
          className="btn-main px-4 py-2 rounded-lg bg-accent/20 border border-accent/40 text-accent hover:bg-accent/30 text-sm font-semibold disabled:opacity-40"
        >
          {busy ? "Starting…" : resume ? "▶ Continue session" : agent ? `▶ Run ${agent.name}` : "▶ Run"}
        </button>
      </div>

      <style jsx>{`
        :global(.protege-select) {
          width: 100%;
          padding: 0.4rem 0.5rem;
          border-radius: 0.5rem;
          background: var(--bg);
          border: 1px solid var(--border);
          font-size: 0.8rem;
          color: var(--text);
        }
        :global(.protege-select:focus) {
          outline: none;
          border-color: rgba(91, 157, 255, 0.6);
        }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] text-muted mb-1">{label}</span>
      {children}
    </label>
  );
}
