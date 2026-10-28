export type JobStatus =
  | "starting"
  | "running"
  | "idle"
  | "done"
  | "error"
  | "stopped"
  | "interrupted";

export type JobKind = "run" | "assess";

export type WorktreeState = "none" | "active" | "applied" | "discarded" | "reverted";

export interface TaskCounts {
  todo: number;
  doing: number;
  done: number;
}

export interface Task {
  id: string;
  title: string;
  status: "todo" | "doing" | "done";
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ProjectSummary {
  id: string;
  path: string;
  name: string;
  source: "discovered" | "registered";
  sessionCount: number;
  lastActivity: number | null;
  summary?: string;
  plainSummaryLine?: string;
  /** Counts of the project's parts by status, from .protege/assessment.json (if it exists). */
  parts?: { solid: number; partial: number; other: number };
  gitBranch?: string;
  tags: string[];
  liveAgents: number;
  tasks: TaskCounts;
  hasDesign: boolean;
  hasPlan: boolean;
  hasClaudeMd: boolean;
  exists: boolean;
}

/** Concrete, listed progress: exactly what's done and what's left. */
export interface ProjectProgress {
  done: string[];
  remaining: string[];
}

export interface SessionInfo {
  sessionId: string;
  summary: string;
  firstPrompt?: string;
  lastModified: number;
  createdAt?: number;
  gitBranch?: string;
  fileSize?: number;
}

export interface JobEvent {
  seq: number;
  ts: number;
  type: string; // status | system | text | thinking | tool | tool_result | result | error
  payload: any;
}

export interface Job {
  id: string;
  /** The agent this was a run of (see agents.ts), and which version of it. */
  agentId?: string;
  agentName?: string;
  agentVersion?: number;
  projectId: string;
  projectPath: string;
  projectName: string;
  prompt: string;
  status: JobStatus;
  kind: JobKind;
  model?: string;
  sessionId?: string;
  startedAt: number;
  endedAt?: number;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  numTurns?: number;
  error?: string;
  // git-worktree isolation
  cwd?: string; // where the agent actually ran (worktree path when isolated)
  worktreeState: WorktreeState;
  worktreePath?: string;
  branch?: string;
  baseRef?: string;
  // session resilience (auto-continue chains)
  parentJobId?: string;
  autoResumeCount?: number;
  // verification layer (set on demand, persisted)
  evalScore?: number;
  evalVerdict?: string;
  evalReason?: string;
  checksPassed?: number; // 1 pass, 0 fail, undefined not run
  checksCommand?: string;
  // live-only, best-effort
  lastText?: string;
  currentTool?: string;
  eventCount?: number;
  stuck?: boolean; // heuristic: repeating the same action / looping
  recentEvents?: { type: string; label: string; ts: number }[];
  lastEventAt?: number;
}

export interface DiffFile {
  path: string;
  status: string; // A | M | D | R ...
  additions: number;
  deletions: number;
  patch: string;
}

export interface JobDiff {
  available: boolean;
  reason?: string;
  branch?: string;
  baseRef?: string;
  files: DiffFile[];
  totalAdditions: number;
  totalDeletions: number;
}
