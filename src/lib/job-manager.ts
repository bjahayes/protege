import { randomUUID } from "crypto";
import { query, type Options, type PermissionMode } from "@/lib/engine";
import { getDb, pruneEvents } from "./store";
import { projectIdFromPath } from "./config";
import type { Job, JobEvent, JobKind, JobDiff } from "./types";
import {
  createWorktree,
  commitWorktree,
  worktreeDiff,
  applyWorktree,
  removeWorktree,
  revertJobChange,
  isGitRepo,
  unsavedPaths,
  saveChanges,
  excludeNotes,
} from "./git";
import { buildLaunchContext } from "./ask";
import { detectVerifyCommand, runVerifyCommand, persistChecks } from "./verify";

export interface LaunchOptions {
  projectPath: string;
  projectName: string;
  prompt: string;
  kind?: JobKind;
  model?: string;
  permissionMode?: PermissionMode;
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  maxTurns?: number;
  maxBudgetUsd?: number;
  resume?: string;
  isolate?: boolean;
  // session resilience
  autoResume?: boolean;
  maxAutoResumes?: number;
  parentJobId?: string;
  autoResumeCount?: number;
  worktree?: { path: string; branch?: string; baseRef?: string }; // reuse an existing worktree (continuations)
  onDone?: (job: Job) => void; // internal completion hook (missions)
  agent?: { id: string; name: string; version: number }; // the agent this is a run of
  allowedTools?: string[]; // with permissionMode "default", the only tools the run may use
  disallowedTools?: string[]; // tools the run may never use, whatever the person's settings allow
  primeContext?: boolean; // inject a repo-map + assessment orientation as the system prompt
  autoVerify?: boolean; // run the project's checks after an isolated run completes
  autoFix?: boolean; // on check failure, spawn a bounded fix pass
  fixAttempt?: number; // internal: current fix-loop depth
}

interface LiveJob extends Job {
  abort: AbortController;
  events: JobEvent[];
  subscribers: Set<(e: JobEvent) => void>;
  seq: number;
  recentTools: string[]; // rolling signatures for loop detection
  launchOpts: LaunchOptions;
}

const MAX_EVENTS_IN_MEM = 3000;

function stripLive(j: LiveJob): Job {
  const { abort, events, subscribers, seq, recentTools, launchOpts, ...rest } = j;
  return { ...rest, eventCount: events.length };
}

function rowToJob(r: any): Job {
  return {
    id: r.id,
    projectId: projectIdFromPath(r.project_path),
    projectPath: r.project_path,
    projectName: r.project_name || r.project_path,
    prompt: r.prompt,
    agentId: r.agent_id ?? undefined,
    agentName: r.agent_name ?? undefined,
    agentVersion: r.agent_version ?? undefined,
    status: r.status,
    kind: (r.kind as JobKind) || "run",
    model: r.model ?? undefined,
    sessionId: r.session_id ?? undefined,
    startedAt: r.started_at,
    endedAt: r.ended_at ?? undefined,
    inputTokens: r.input_tokens ?? undefined,
    outputTokens: r.output_tokens ?? undefined,
    costUsd: r.cost_usd ?? undefined,
    numTurns: r.num_turns ?? undefined,
    error: r.error ?? undefined,
    cwd: r.cwd ?? undefined,
    worktreeState: r.worktree_state || "none",
    worktreePath: r.worktree_path ?? undefined,
    branch: r.branch ?? undefined,
    baseRef: r.base_ref ?? undefined,
    parentJobId: r.parent_job_id ?? undefined,
    autoResumeCount: r.auto_resume_count ?? undefined,
    evalScore: r.eval_score ?? undefined,
    evalVerdict: r.eval_verdict ?? undefined,
    evalReason: r.eval_reason ?? undefined,
    checksPassed: r.checks_passed ?? undefined,
    checksCommand: r.checks_command ?? undefined,
  };
}

/** Structured, size-limited facts about a tool call, for the Simple view's steps and parts map. */
function toolDetail(name: string, input: any): Record<string, any> {
  const i = input && typeof input === "object" ? input : {};
  const d: Record<string, any> = {};
  const file = i.file_path ?? i.notebook_path ?? i.path;
  if (typeof file === "string") d.file = file;
  if (typeof i.command === "string") d.command = i.command.slice(0, 200);
  if (typeof i.pattern === "string") d.pattern = i.pattern.slice(0, 120);
  if (typeof i.description === "string") d.description = i.description.slice(0, 160);
  if (typeof i.query === "string") d.query = i.query.slice(0, 160);
  if (typeof i.url === "string") d.url = i.url.slice(0, 200);
  // Claude Code's to-do list (lib/todo-list.ts), so the panel can show it live.
  if (name === "TodoWrite" && Array.isArray(i.todos))
    d.todos = i.todos.slice(0, 40).map((t: any) => ({ content: String(t?.content || "").slice(0, 200), status: t?.status }));
  if (name === "TaskCreate" && typeof i.subject === "string") d.subject = i.subject.slice(0, 200);
  if (name === "TaskUpdate") {
    if (i.taskId != null) d.taskId = String(i.taskId);
    if (typeof i.status === "string") d.status = i.status;
    if (typeof i.subject === "string") d.subject = i.subject.slice(0, 200);
  }
  const lines = (s: any) => (typeof s === "string" && s.length ? s.split("\n").length : 0);
  // The lines an edit really adds (not the unchanged ones around them), so a reader of the run (the
  // to-do list's progress) can tell what each edit did.
  const pairs: [string, string][] =
    name === "MultiEdit" && Array.isArray(i.edits)
      ? i.edits.map((e: any) => [String(e?.old_string ?? ""), String(e?.new_string ?? "")])
      : name === "Write"
        ? [["", String(i.content ?? "")]]
        : name === "Edit"
          ? [[String(i.old_string ?? ""), String(i.new_string ?? "")]]
          : [];
  if (pairs.length) {
    const fresh: string[] = [];
    for (const [o, n] of pairs) {
      const had = new Set(o.split("\n").map((l) => l.trim()));
      for (const l of n.split("\n")) if (l.trim() && !had.has(l.trim()) && fresh.length < 3) fresh.push(l.trim().slice(0, 120));
    }
    if (fresh.length) d.preview = fresh.join(" ⏎ ");
  }
  if (name === "Write") {
    d.added = lines(i.content);
    d.created = true;
  } else if (name === "Edit") {
    d.added = lines(i.new_string);
    d.removed = lines(i.old_string);
  } else if (name === "MultiEdit" && Array.isArray(i.edits)) {
    d.added = i.edits.reduce((a: number, e: any) => a + lines(e?.new_string), 0);
    d.removed = i.edits.reduce((a: number, e: any) => a + lines(e?.old_string), 0);
  }
  return d;
}

function summarize(v: any, max = 240): string {
  let s: string;
  if (typeof v === "string") s = v;
  else if (Array.isArray(v)) s = v.map((x) => (typeof x === "string" ? x : x?.text ?? "")).join(" ");
  else {
    try {
      s = JSON.stringify(v);
    } catch {
      s = String(v);
    }
  }
  s = (s || "").replace(/\s+/g, " ").trim();
  return s.length > max ? s.slice(0, max) + "…" : s;
}

const LIVE_STATUSES = ["starting", "running", "idle"];
const ACTIVITY_TYPES = new Set(["tool", "text", "thinking", "tool_result", "result", "auto_continue", "error"]);

function activityLabel(e: JobEvent): string {
  const p = e.payload || {};
  switch (e.type) {
    case "tool":
      return `${p.name}${p.input ? " " + p.input : ""}`;
    case "text":
      return (p.text || "").replace(/\s+/g, " ").trim();
    case "thinking":
      return (p.text || "").replace(/\s+/g, " ").trim();
    case "tool_result":
      return (p.text || "").replace(/\s+/g, " ").trim();
    case "auto_continue":
      return `auto-continuing (attempt ${p.attempt} of ${p.of})`;
    case "result":
      return p.subtype === "success" && !p.isError ? "completed" : `failed: ${p.isError && p.result ? p.result : p.subtype}`;
    case "error":
      return p.message || "error";
    default:
      return e.type;
  }
}

class JobManager {
  private live = new Map<string, LiveJob>();
  private doneFired = new Set<string>();
  /** Follow-up runs (auto-continue, auto-fix) waiting to start, by the job that scheduled them. */
  private pendingFollowUps = new Map<string, ReturnType<typeof setTimeout>>();

  /** Runs that have ended but are still being wrapped up (the safe copy's commit, saving, checks). */
  private finishingJobs?: Set<string>;
  private get finishing() {
    return (this.finishingJobs ||= new Set());
  }

  /**
   * What a restart must wait for besides live runs: runs still being wrapped up after Claude
   * finished, and follow-up runs (auto-continue, auto-fix) waiting to start. A run is marked done
   * before its commit and checks, so its status alone would let a restart cut them off.
   */
  wrappingUp(): Job[] {
    const ids = new Set([...this.finishing, ...this.followUps.keys()]);
    return [...ids].map((id) => this.get(id)).filter(Boolean) as Job[];
  }

  private get followUps() {
    // An instance kept across a hot reload may predate this field.
    if (!this.pendingFollowUps) this.pendingFollowUps = new Map();
    return this.pendingFollowUps;
  }

  /** Start a follow-up run shortly, unless the job that asked for it is stopped first. */
  private scheduleFollowUp(parent: LiveJob, opts: LaunchOptions) {
    if (parent.status === "stopped" || parent.abort.signal.aborted) return;
    const t = setTimeout(() => {
      this.followUps.delete(parent.id);
      if (parent.status === "stopped" || parent.abort.signal.aborted) return;
      try {
        this.launch(opts);
      } catch {
        /* ignore */
      }
    }, 600);
    this.followUps.set(parent.id, t);
  }

  constructor() {
    this.reconcile();
    // Old runs shed their bulky events now and once a day (store.ts pruneEvents).
    const prune = () => {
      try {
        pruneEvents();
      } catch {
        /* try again tomorrow */
      }
    };
    prune();
    setInterval(prune, 24 * 60 * 60 * 1000).unref?.();
  }

  // Invoke a job's completion hook exactly once (used by missions).
  private fireDone(job: LiveJob) {
    if (this.doneFired.has(job.id)) return;
    this.doneFired.add(job.id);
    const cb = job.launchOpts.onDone;
    if (cb) {
      try {
        cb(stripLive(job));
      } catch {
        /* ignore */
      }
    }
  }

  /** On process start, no in-memory job can be truly live — mark orphaned DB rows interrupted. */
  private reconcile() {
    try {
      const db = getDb();
      const now = Date.now();
      db.prepare(
        `UPDATE jobs SET status = 'interrupted', ended_at = COALESCE(ended_at, ?),
           error = COALESCE(error, 'Interrupted by server restart')
         WHERE status IN ('starting','running','idle')`
      ).run(now);
    } catch {
      /* ignore */
    }
  }

  liveCountByPath(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const j of this.live.values()) {
      if (!LIVE_STATUSES.includes(j.status)) continue;
      out[j.projectPath] = (out[j.projectPath] || 0) + 1;
    }
    return out;
  }

  listLive(): Job[] {
    return [...this.live.values()]
      .filter((j) => LIVE_STATUSES.includes(j.status))
      .sort((a, b) => b.startedAt - a.startedAt)
      .map((j) => this.withActivity(j));
  }

  private withActivity(j: LiveJob): Job {
    const base = stripLive(j);
    const events = j.events.filter((e) => ACTIVITY_TYPES.has(e.type));
    base.recentEvents = events.slice(-10).map((e) => ({
      type: e.type,
      ts: e.ts,
      label: activityLabel(e),
    }));
    base.lastEventAt = j.events.length ? j.events[j.events.length - 1].ts : j.startedAt;
    return base;
  }

  isLiveStatus(j: Job): boolean {
    return LIVE_STATUSES.includes(j.status);
  }

  recentJobs(limit = 60): Job[] {
    const rows = getDb().prepare(`SELECT * FROM jobs ORDER BY started_at DESC LIMIT ?`).all(limit) as any[];
    return rows.map((r) => {
      const l = this.live.get(r.id);
      return l ? stripLive(l) : rowToJob(r);
    });
  }

  jobsForProject(projectPath: string): Job[] {
    const rows = getDb()
      .prepare(`SELECT * FROM jobs WHERE project_path = ? ORDER BY started_at DESC`)
      .all(projectPath) as any[];
    return rows.map((r) => {
      const l = this.live.get(r.id);
      return l ? stripLive(l) : rowToJob(r);
    });
  }

  get(id: string): Job | null {
    const l = this.live.get(id);
    if (l) return stripLive(l);
    const row = getDb().prepare(`SELECT * FROM jobs WHERE id = ?`).get(id) as any;
    return row ? rowToJob(row) : null;
  }

  getEvents(id: string): JobEvent[] {
    const l = this.live.get(id);
    // A long live run keeps only its latest events in memory; the earlier ones come from the database,
    // where every event is saved as it happens, so a replay always starts from the beginning.
    if (l && (!l.events.length || l.events[0].seq === 0)) return l.events;
    if (l) {
      const first = l.events[0].seq;
      const earlier = getDb().prepare(`SELECT * FROM job_events WHERE job_id = ? AND seq < ? ORDER BY seq`).all(id, first) as any[];
      return [...earlier.map((r) => ({ seq: r.seq, ts: r.ts, type: r.type, payload: safeParse(r.payload) })), ...l.events];
    }
    const rows = getDb().prepare(`SELECT * FROM job_events WHERE job_id = ? ORDER BY seq`).all(id) as any[];
    return rows.map((r) => ({ seq: r.seq, ts: r.ts, type: r.type, payload: safeParse(r.payload) }));
  }

  subscribe(id: string, cb: (e: JobEvent) => void): () => void {
    const l = this.live.get(id);
    if (!l) return () => {};
    l.subscribers.add(cb);
    return () => {
      l.subscribers.delete(cb);
    };
  }

  // If the same action signature dominates the recent window, the agent is
  // likely stuck in a loop. Flag it once (feeds the UI + notifications).
  private detectLoop(job: LiveJob, sig: string) {
    job.recentTools.push(sig);
    if (job.recentTools.length > 8) job.recentTools.shift();
    if (job.recentTools.length >= 6 && !job.stuck) {
      const counts = new Map<string, number>();
      for (const s of job.recentTools) counts.set(s, (counts.get(s) || 0) + 1);
      const max = Math.max(...counts.values());
      if (max >= 4) {
        job.stuck = true;
        this.emit(job, "stuck", { signature: sig, repeats: max });
        this.persist(job);
      }
    }
  }

  async stopAll(): Promise<number> {
    // Nothing scheduled may start after Stop all.
    for (const t of this.followUps.values()) clearTimeout(t);
    this.followUps.clear();
    const ids = [...this.live.values()].filter((j) => LIVE_STATUSES.includes(j.status)).map((j) => j.id);
    for (const id of ids) await this.stop(id);
    return ids.length;
  }

  async stop(id: string): Promise<boolean> {
    // A follow-up this job scheduled must not start, and any it already started stop too.
    const t = this.followUps.get(id);
    if (t) {
      clearTimeout(t);
      this.followUps.delete(id);
    }
    for (const child of [...this.live.values()]) {
      if (child.parentJobId === id && LIVE_STATUSES.includes(child.status)) await this.stop(child.id);
    }
    const l = this.live.get(id);
    if (!l) return false;
    try {
      l.abort.abort();
    } catch {
      /* ignore */
    }
    l.status = "stopped";
    l.endedAt = Date.now();
    this.emit(l, "status", { status: "stopped" });
    await this.finalizeWorktree(l);
    this.persist(l);
    this.fireDone(l);
    return true;
  }

  launch(opts: LaunchOptions): Job {
    const id = randomUUID();
    const job: LiveJob = {
      id,
      projectId: projectIdFromPath(opts.projectPath),
      projectPath: opts.projectPath,
      projectName: opts.projectName,
      prompt: opts.prompt,
      agentId: opts.agent?.id,
      agentName: opts.agent?.name,
      agentVersion: opts.agent?.version,
      status: "starting",
      kind: opts.kind || "run",
      model: opts.model,
      startedAt: Date.now(),
      cwd: opts.projectPath,
      worktreeState: "none",
      parentJobId: opts.parentJobId,
      autoResumeCount: opts.autoResumeCount,
      abort: new AbortController(),
      events: [],
      subscribers: new Set(),
      seq: 0,
      recentTools: [],
      launchOpts: opts,
    };
    this.live.set(id, job);
    this.persist(job);
    this.run(job, opts).catch((err) => {
      if (job.status !== "stopped") {
        job.status = "error";
        job.error = String(err?.message ?? err);
        job.endedAt = Date.now();
        this.emit(job, "error", { message: job.error });
        this.persist(job);
      }
      this.fireDone(job);
    });
    return stripLive(job);
  }

  private async run(job: LiveJob, opts: LaunchOptions) {
    this.emit(job, "status", { status: "starting" });

    let cwd = opts.projectPath;
    // A run straight in the project (no safe copy) saves what it changed to the project's
    // history afterwards, so a later Keep isn't blocked by its edits.
    let direct: { before: Set<string> } | null = null;
    if (!opts.worktree && !opts.isolate && opts.kind !== "assess" && (await isGitRepo(opts.projectPath))) {
      await excludeNotes(opts.projectPath);
      direct = { before: new Set(await unsavedPaths(opts.projectPath)) };
    }
    if (opts.worktree) {
      // Continuation reusing an existing worktree — don't create a new one.
      job.worktreePath = opts.worktree.path;
      job.branch = opts.worktree.branch;
      job.baseRef = opts.worktree.baseRef;
      job.worktreeState = "active";
      cwd = opts.worktree.path;
      job.cwd = cwd;
      this.persist(job);
    } else if (opts.isolate) {
      try {
        const wt = await createWorktree(opts.projectPath, job.id);
        job.worktreePath = wt.worktreePath;
        job.branch = wt.branch;
        job.baseRef = wt.baseRef;
        job.worktreeState = "active";
        cwd = wt.worktreePath;
        job.cwd = cwd;
        this.emit(job, "system", { worktree: wt.worktreePath, branch: wt.branch });
        this.persist(job);
      } catch (e: any) {
        job.status = "error";
        job.error = `Could not create git worktree: ${e?.message || e}`;
        job.endedAt = Date.now();
        this.emit(job, "error", { message: job.error });
        this.persist(job);
        return;
      }
    }

    // Prime with an orientation so the agent starts warm (only for fresh, non-assessment runs). It is
    // added to Claude Code's own system prompt, not put in its place: a plain string would replace
    // Claude Code's instructions (how to work, when to keep a to-do list) with the orientation alone.
    let systemPrompt: string | { type: "preset"; preset: "claude_code"; append: string } | undefined;
    if (opts.primeContext && opts.kind !== "assess" && !opts.resume) {
      try {
        const ctx = buildLaunchContext(opts.projectPath);
        if (ctx) systemPrompt = { type: "preset", preset: "claude_code", append: ctx };
      } catch {
        /* ignore */
      }
    }

    const options: Options = {
      cwd,
      model: opts.model,
      permissionMode: opts.permissionMode ?? "acceptEdits",
      effort: opts.effort,
      maxTurns: opts.maxTurns,
      maxBudgetUsd: opts.maxBudgetUsd,
      resume: opts.resume,
      systemPrompt,
      ...(opts.allowedTools ? { allowedTools: opts.allowedTools } : {}),
      ...(opts.disallowedTools ? { disallowedTools: opts.disallowedTools } : {}),
      includePartialMessages: false,
      settingSources: ["user", "project", "local"],
      abortController: job.abort,
    };

    const q = query({ prompt: opts.prompt, options });
    job.status = "running";
    this.emit(job, "status", { status: "running" });

    for await (const msg of q) {
      if (job.abort.signal.aborted) break;
      this.handle(job, msg as any);
    }

    // From here until it is wrapped up, a restart waits for it (wrappingUp()).
    this.finishing.add(job.id);
    try {
      if (this.isLiveStatus(stripLive(job))) {
        job.status = job.abort.signal.aborted ? "stopped" : "done";
        job.endedAt = job.endedAt ?? Date.now();
        this.emit(job, "status", { status: job.status });
      }
      await this.finalizeWorktree(job);
      if (direct) await this.saveDirectRun(job, direct.before);
      this.persist(job);
      await this.maybeAutoVerify(job);
      this.fireDone(job);
    } finally {
      this.finishing.delete(job.id);
    }
  }

  // After an isolated run, optionally run the project's checks; on failure and if
  // auto-fix is on and under the cap, spawn a continuation to fix them (a loop).
  /** Save the files a direct run changed (only those: anything already unsaved is left alone). */
  private async saveDirectRun(job: LiveJob, before: Set<string>) {
    try {
      const changed = (await unsavedPaths(job.projectPath)).filter((p) => !before.has(p));
      if (!changed.length) return;
      const saved = await saveChanges(job.projectPath, commitMessage(job), changed);
      if (saved) this.emit(job, "system", { savedToHistory: changed.length });
    } catch (e: any) {
      this.emit(job, "system", { saveFailed: String(e?.message || e).slice(0, 300) });
    }
  }

  private async maybeAutoVerify(job: LiveJob) {
    // A stopped job's work is unfinished; don't check it or start fixing it.
    if (job.status === "stopped" || job.abort.signal.aborted) return;
    const o = job.launchOpts;
    if (!o.autoVerify || job.worktreeState !== "active" || !job.worktreePath) return;
    const cmd = detectVerifyCommand(job.worktreePath);
    if (!cmd) return;
    this.emit(job, "checks", { running: true, command: cmd.label });
    const res = await runVerifyCommand(cmd.command, job.worktreePath);
    const passed = res.exitCode === 0;
    persistChecks(job.id, passed, cmd.label);
    this.emit(job, "checks", { passed, command: cmd.label, exitCode: res.exitCode });

    if (!passed && o.autoFix && (o.fixAttempt ?? 0) < 2 && job.sessionId) {
      const attempt = (o.fixAttempt ?? 0) + 1;
      this.emit(job, "auto_fix", { attempt, of: 2 });
      const contOpts: LaunchOptions = {
        ...o,
        prompt:
          `The project's checks failed after your change. Command: ${cmd.label}\n\nOutput:\n${res.output.slice(-4000)}\n\n` +
          `Fix the code so these checks pass. Make the smallest change that fixes them, then stop.`,
        resume: job.sessionId,
        isolate: false,
        worktree: { path: job.worktreePath, branch: job.branch, baseRef: job.baseRef },
        fixAttempt: attempt,
        parentJobId: job.id,
        onDone: undefined, // fix passes are their own jobs; don't double-fire mission hooks
      };
      this.scheduleFollowUp(job, contOpts);
    }
  }

  /** Commit whatever the agent changed in the worktree so it can be reviewed/applied later. */
  private async finalizeWorktree(job: LiveJob) {
    if (job.worktreeState !== "active" || !job.worktreePath) return;
    try {
      const committed = await commitWorktree(job.worktreePath, commitMessage(job));
      this.emit(job, "system", { worktreeCommitted: committed });
    } catch {
      /* ignore */
    }
  }

  async getDiff(id: string, opts: { context?: number } = {}): Promise<JobDiff> {
    const job = this.get(id);
    if (!job || !job.worktreePath) {
      return { available: false, reason: "No worktree for this job", files: [], totalAdditions: 0, totalDeletions: 0 };
    }
    if (job.worktreeState === "discarded") {
      return { available: false, reason: "Worktree was discarded", files: [], totalAdditions: 0, totalDeletions: 0 };
    }
    return worktreeDiff({ worktreePath: job.worktreePath, branch: job.branch, baseRef: job.baseRef }, opts);
  }

  async applyJob(id: string, opts: { saveFirst?: boolean } = {}) {
    const job = this.get(id);
    if (!job || !job.branch) return { ok: false, message: "No worktree branch to apply." };
    if (job.worktreeState === "applied") return { ok: true, message: "Already applied." };
    const res = await applyWorktree(job.projectPath, job.branch, { worktreePath: job.worktreePath, saveFirst: opts.saveFirst });
    if (res.ok) {
      this.updateWorktreeState(id, "applied");
      // Clean up the worktree checkout but keep the (now-merged) branch.
      await removeWorktree(job.projectPath, job.worktreePath, undefined);
    }
    return res;
  }

  async undoJob(id: string): Promise<{ ok: boolean; message: string }> {
    const job = this.get(id);
    if (!job || job.worktreeState !== "applied") {
      return { ok: false, message: "This change isn't something that can be undone." };
    }
    const res = await revertJobChange(job.projectPath, job.baseRef, job.branch);
    if (res.ok) this.updateWorktreeState(id, "reverted");
    return res;
  }

  async discardJob(id: string): Promise<{ ok: boolean; message: string }> {
    const job = this.get(id);
    if (!job) return { ok: false, message: "Job not found." };
    if (job.worktreePath || job.branch) {
      await removeWorktree(job.projectPath, job.worktreePath, job.branch);
    }
    this.updateWorktreeState(id, "discarded");
    return { ok: true, message: "Discarded worktree and branch." };
  }

  private updateWorktreeState(id: string, state: string) {
    const l = this.live.get(id);
    if (l) l.worktreeState = state as any;
    try {
      getDb().prepare(`UPDATE jobs SET worktree_state = ? WHERE id = ?`).run(state, id);
    } catch {
      /* ignore */
    }
  }

  private handle(job: LiveJob, msg: any) {
    switch (msg.type) {
      case "system":
        if (msg.subtype === "init") {
          job.sessionId = msg.session_id;
          job.model = msg.model || job.model;
          this.emit(job, "system", {
            session_id: msg.session_id,
            model: msg.model,
            cwd: msg.cwd,
            tools: msg.tools,
            permissionMode: msg.permissionMode,
            apiKeySource: msg.apiKeySource,
          });
          this.persist(job);
        } else if (msg.subtype === "session_state_changed") {
          if (msg.state === "idle") job.status = "idle";
          else if (msg.state === "running") job.status = "running";
          this.emit(job, "status", { status: job.status });
        } else if (msg.subtype === "status") {
          this.emit(job, "status", { status: msg.status ?? "running", raw: true });
        }
        break;

      case "assistant": {
        const sub = msg.subagent_type ? `${msg.subagent_type}` : undefined;
        for (const block of msg.message?.content ?? []) {
          if (block.type === "text" && block.text) {
            job.lastText = block.text;
            this.emit(job, "text", { text: block.text, subagent: sub });
          } else if (block.type === "tool_use") {
            job.currentTool = block.name;
            const inputSig = summarize(block.input, 120);
            this.emit(job, "tool", { name: block.name, input: summarize(block.input), detail: toolDetail(block.name, block.input), subagent: sub });
            this.detectLoop(job, `${block.name}:${inputSig}`);
          } else if (block.type === "thinking" && block.thinking) {
            this.emit(job, "thinking", { text: summarize(block.thinking, 600), subagent: sub });
          }
        }
        break;
      }

      case "user": {
        for (const block of msg.message?.content ?? []) {
          if (block.type === "tool_result") {
            this.emit(job, "tool_result", { text: summarize(block.content), ...(block.is_error === true ? { isError: true } : {}) });
          }
        }
        break;
      }

      case "result": {
        const failed = msg.subtype !== "success" || msg.is_error === true;
        job.status = failed ? "error" : "done";
        job.endedAt = Date.now();
        job.numTurns = msg.num_turns;
        job.costUsd = msg.total_cost_usd;
        let inTok = 0;
        let outTok = 0;
        const mu = msg.modelUsage ?? {};
        for (const k of Object.keys(mu)) {
          // All the input Claude read, cached or not; uncached input alone is a tiny share of a run.
          inTok += (mu[k]?.inputTokens ?? 0) + (mu[k]?.cacheReadInputTokens ?? 0) + (mu[k]?.cacheCreationInputTokens ?? 0);
          outTok += mu[k]?.outputTokens ?? 0;
        }
        job.inputTokens = inTok || msg.usage?.input_tokens;
        job.outputTokens = outTok || msg.usage?.output_tokens;
        if (failed) job.error = msg.is_error && msg.result ? String(msg.result).slice(0, 500) : msg.subtype;
        this.emit(job, "result", {
          subtype: msg.subtype,
          isError: failed,
          result: summarize(msg.result, 4000),
          cost: msg.total_cost_usd,
          numTurns: msg.num_turns,
          inputTokens: job.inputTokens,
          outputTokens: job.outputTokens,
          durationMs: msg.duration_ms,
        });
        this.persist(job);
        this.maybeAutoResume(job, msg.subtype);
        break;
      }
    }
  }

  // Session resilience: if a run hit the turn limit and auto-resume is on and
  // under the cap, spawn a continuation that resumes the same session.
  private maybeAutoResume(job: LiveJob, subtype: string) {
    const o = job.launchOpts;
    const count = job.autoResumeCount ?? 0;
    const max = o.maxAutoResumes ?? 3;
    const resumable = subtype === "error_max_turns" || subtype === "error_max_budget_usd";
    if (!o.autoResume || !resumable || !job.sessionId || count >= max) return;
    if (job.status === "stopped" || job.abort.signal.aborted) return;

    this.emit(job, "auto_continue", { attempt: count + 1, of: max });
    const contOpts: LaunchOptions = {
      ...o,
      prompt:
        "Continue from where you left off and keep working until the task is fully complete. If it is already complete, briefly confirm and stop.",
      resume: job.sessionId,
      autoResumeCount: count + 1,
      parentJobId: job.id,
      isolate: false,
      worktree: job.worktreePath
        ? { path: job.worktreePath, branch: job.branch, baseRef: job.baseRef }
        : undefined,
    };
    this.scheduleFollowUp(job, contOpts);
  }

  private emit(job: LiveJob, type: string, payload: any) {
    const e: JobEvent = { seq: job.seq++, ts: Date.now(), type, payload };
    job.events.push(e);
    if (job.events.length > MAX_EVENTS_IN_MEM) {
      job.events.splice(0, job.events.length - MAX_EVENTS_IN_MEM);
    }
    for (const cb of job.subscribers) {
      try {
        cb(e);
      } catch {
        /* ignore */
      }
    }
    try {
      getDb()
        .prepare(`INSERT OR REPLACE INTO job_events (job_id, seq, ts, type, payload) VALUES (?,?,?,?,?)`)
        .run(job.id, e.seq, e.ts, type, JSON.stringify(payload));
    } catch {
      /* ignore */
    }
  }

  private persist(j: LiveJob) {
    try {
      getDb()
        .prepare(
          `INSERT OR REPLACE INTO jobs
            (id, project_path, project_name, prompt, status, kind, session_id, model,
             started_at, ended_at, input_tokens, output_tokens, cost_usd, num_turns, error,
             cwd, worktree_state, worktree_path, branch, base_ref, parent_job_id, auto_resume_count,
             agent_id, agent_name, agent_version)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
        )
        .run(
          j.id,
          j.projectPath,
          j.projectName,
          j.prompt,
          j.status,
          j.kind,
          j.sessionId ?? null,
          j.model ?? null,
          j.startedAt,
          j.endedAt ?? null,
          j.inputTokens ?? null,
          j.outputTokens ?? null,
          j.costUsd ?? null,
          j.numTurns ?? null,
          j.error ?? null,
          j.cwd ?? null,
          j.worktreeState ?? "none",
          j.worktreePath ?? null,
          j.branch ?? null,
          j.baseRef ?? null,
          j.parentJobId ?? null,
          j.autoResumeCount ?? null,
          j.agentId ?? null,
          j.agentName ?? null,
          j.agentVersion ?? null
        );
    } catch {
      /* ignore */
    }
  }
}

/** A run's entry in the project's git history: the agent's name, then what it was asked. */
function commitMessage(j: Job): string {
  const first = j.prompt.split("\n")[0].slice(0, 200);
  return j.agentName ? `protege: ${j.agentName} (agent version ${j.agentVersion ?? 1})\n\n${first}` : `protege: ${first}`;
}

function safeParse(s: string) {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

const g = globalThis as unknown as { __protegeJobManager?: JobManager };
export function getJobManager(): JobManager {
  if (!g.__protegeJobManager) g.__protegeJobManager = new JobManager();
  // After a hot reload in development the kept instance belongs to the old class; give it the
  // new methods without dropping the jobs it is running.
  else if (!(g.__protegeJobManager instanceof JobManager)) Object.setPrototypeOf(g.__protegeJobManager, JobManager.prototype);
  return g.__protegeJobManager;
}
