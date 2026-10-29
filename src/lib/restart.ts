// Server-only. Restarting Protégé to load a new version without cutting anything off: build into
// the build folder not in use while this one keeps serving, wait until no session or task is
// mid-turn (a session that asked for the restart finishes its reply first), then ask the
// launcher (scripts/serve.mjs) to swap to the new build. Sessions carry on from their saved
// history afterwards. Works when Protégé was started with `npm start`.

import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { getChatManager } from "./chat-manager";
import { getJobManager } from "./job-manager";

export type RestartPhase = "idle" | "building" | "waiting" | "restarting" | "failed";

export interface RestartState {
  phase: RestartPhase;
  /** Whether this Protégé can restart itself (started with `npm start`). */
  supported: boolean;
  startedAt?: number;
  /** What is still mid-turn, while waiting. */
  waitingFor?: string[];
  error?: string;
}

interface Internal {
  phase: RestartPhase;
  /** Restart as soon as the new version is built, without waiting for anything mid-turn. */
  force?: boolean;
  startedAt?: number;
  waitingFor?: string[];
  error?: string;
  timer?: ReturnType<typeof setInterval>;
}

const g = globalThis as any;
const st = (): Internal => (g.__protegeRestart ||= { phase: "idle" });

const builds = () => (process.env.PROTEGE_BUILDS || "").split(",").filter(Boolean);
const supported = () => typeof process.send === "function" && builds().length > 1;
const current = () => process.env.PROTEGE_DIST_DIR || ".next";
const nextFolder = () => builds().find((b) => b !== current()) || "";
const logFile = () => path.join(process.cwd(), "data", "restart-build.log");

export function restartState(): RestartState {
  const s = st();
  return { phase: s.phase, supported: supported(), startedAt: s.startedAt, waitingFor: s.waitingFor, error: s.error };
}

/** What is mid-turn right now, in words. A restart waits for all of it. */
function busy(): string[] {
  const out: string[] = [];
  for (const c of getChatManager().list())
    if (c.status === "working" || c.status === "starting" || c.status === "waiting")
      out.push(`a session in ${c.projectName}${c.status === "waiting" ? " (waiting for your approval)" : ""}`);
  for (const j of getJobManager().listLive()) out.push(`a task in ${j.projectName}`);
  return out;
}

export function requestRestart(opts: { force?: boolean } = {}): RestartState {
  const s = st();
  // Already built and waiting: restart now.
  if (opts.force && s.phase === "waiting") {
    clearInterval(s.timer);
    s.phase = "restarting";
    process.send!({ type: "swap", dist: nextFolder() });
    return restartState();
  }
  if (opts.force && s.phase === "building") {
    s.force = true;
    return restartState();
  }
  if (!supported()) {
    s.phase = "failed";
    s.error = "Protégé can only restart itself when it was started with npm start.";
    return restartState();
  }
  if (s.phase === "building" || s.phase === "waiting" || s.phase === "restarting") return restartState();
  s.phase = "building";
  s.startedAt = Date.now();
  s.error = undefined;
  s.waitingFor = undefined;
  s.force = !!opts.force;

  const dist = nextFolder();
  const nextBin = path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next");
  const env = { ...process.env, PROTEGE_DIST_DIR: dist, NODE_ENV: "production" } as NodeJS.ProcessEnv;
  delete env.__NEXT_PRIVATE_ORIGIN;
  const log = fs.createWriteStream(logFile());
  const tsconfig = path.join(process.cwd(), "tsconfig.json");
  const tsBefore = fs.readFileSync(tsconfig, "utf8");
  const b = spawn(process.execPath, [nextBin, "build"], { cwd: process.cwd(), env, windowsHide: true });
  b.stdout.pipe(log);
  b.stderr.pipe(log);
  b.on("exit", (code: number | null) => {
    // A build may rewrite tsconfig.json; it's not Protégé's to change.
    try {
      if (fs.readFileSync(tsconfig, "utf8") !== tsBefore) fs.writeFileSync(tsconfig, tsBefore);
    } catch {
      /* ignore */
    }
    if (code !== 0) {
      s.phase = "failed";
      s.error = `The new version didn't build (see data/restart-build.log). Protégé is still running the old one.`;
      return;
    }
    s.phase = "waiting";
    const check = () => {
      const left = busy();
      s.waitingFor = left;
      // Forced, it doesn't wait: what is mid-turn stops, and carries on from its saved history.
      if (left.length && !s.force) return;
      clearInterval(s.timer);
      s.phase = "restarting";
      process.send!({ type: "swap", dist });
    };
    s.timer = setInterval(check, 1000);
    check();
  });
  return restartState();
}

/** Stop waiting for a restart that hasn't happened yet. The new build is kept for next time. */
export function cancelRestart(): RestartState {
  const s = st();
  if (s.phase === "waiting") {
    clearInterval(s.timer);
    s.phase = "idle";
    s.waitingFor = undefined;
  } else if (s.phase === "failed") s.phase = "idle";
  return restartState();
}
