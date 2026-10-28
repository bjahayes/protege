// The engine that runs Claude for Protégé / Protégé.
//
// Default ("cli"): run the person's own installed Claude Code program headlessly
// (`claude -p --output-format stream-json`). Nothing is shown in a terminal; the
// JSON messages it prints have the same shape as the Agent SDK's, so the rest of
// the app does not change. Claude Code uses whatever account it is signed in to,
// normally the person's Claude plan.
//
// Fallback ("sdk"): set PROTEGE_ENGINE=sdk to use @anthropic-ai/claude-agent-sdk as before.
//
// API-key guard (both engines): ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN are removed
// from the environment, and a run stops at start-up if Claude Code reports that it is
// using an API key. Set PROTEGE_ALLOW_API_KEY=1 to allow API-key billing.
//
// Server-only. Import `query` from here, never from the SDK directly.

import { spawn, execFile, execFileSync, type ChildProcess } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import readline from "readline";
import { query as sdkQuery, type Options, type Query, type SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";

export type { Options, PermissionMode } from "@anthropic-ai/claude-agent-sdk";

export type EngineName = "cli" | "sdk";
/** A setting from the environment: PROTEGE_<name>. */
function setting(name: string): string | undefined {
  return process.env[`PROTEGE_${name}`];
}
export const ENGINE: EngineName = (setting("ENGINE") || "cli").toLowerCase() === "sdk" ? "sdk" : "cli";
export const ALLOW_API_KEY = setting("ALLOW_API_KEY") === "1";

/** apiKeySource values that mean "the person's Claude plan login", not API billing. */
const PLAN_SOURCES = new Set(["none", "oauth"]);

export function engineEnv(extra?: Record<string, string | undefined>): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...process.env };
  // When Protégé itself was started from inside a Claude Code session (e.g. the desktop app),
  // that session's variables leak in and make the child claude think a host is managing its
  // login ("OAuth session expired and could not be refreshed"). Drop them so it runs as a plain CLI.
  for (const k of Object.keys(env)) {
    if (k === "CLAUDECODE" || k === "CLAUDE_PID" || k.startsWith("CLAUDE_CODE_") || k.startsWith("CLAUDE_AGENT_SDK_")) {
      delete env[k];
    }
  }
  Object.assign(env, extra || {});
  if (!ALLOW_API_KEY) {
    delete env.ANTHROPIC_API_KEY;
    delete env.ANTHROPIC_AUTH_TOKEN;
  }
  return env;
}

export function apiKeyMessage(source: string): string {
  return (
    `Stopped before starting: Claude Code was about to use an API key (${source}) instead of your Claude plan. ` +
    `Remove the key from your Claude Code settings, or set PROTEGE_ALLOW_API_KEY=1 if you want API billing.`
  );
}

const NOT_SIGNED_IN =
  "Claude Code on this computer isn't signed in. Use “Sign in to Claude” at the top of the page, then try again.";

/** Claude Code's own wording when it has no usable login. */
export const SIGNED_OUT_RE = /not logged in|please run \/login|failed to authenticate|oauth session expired|invalid api key/i;
const NOT_INSTALLED =
  "Protégé couldn't find Claude Code on this computer. Install Claude Code from Anthropic, open it once and sign in. " +
  "If it is installed somewhere unusual, set PROTEGE_CLAUDE_PATH to the full path of the claude program.";

type QueryParams = { prompt: string; options?: Options };

/** Drop-in replacement for the SDK's `query()` (async iteration only). */
export function query(params: QueryParams): AsyncGenerator<any, void> {
  const options: any = params.options ?? {};
  const source =
    ENGINE === "sdk"
      ? (sdkQuery({ prompt: params.prompt, options: { ...options, env: engineEnv(options.env) } }) as any)
      : cliQuery(params.prompt, options);
  return guard(source);
}

async function* guard(src: AsyncGenerator<any, void>): AsyncGenerator<any, void> {
  try {
    for await (const m of src) {
      if (m?.type === "system" && m.subtype === "init" && !ALLOW_API_KEY) {
        const s = String(m.apiKeySource ?? "none");
        if (!PLAN_SOURCES.has(s)) throw new Error(apiKeyMessage(s));
      }
      if (m?.type === "result" && m.is_error && SIGNED_OUT_RE.test(String(m.result || ""))) {
        throw new Error(NOT_SIGNED_IN);
      }
      yield m;
    }
  } finally {
    try {
      await src.return?.(undefined);
    } catch {
      /* ignore */
    }
  }
}

// ---------------------------------------------------------------------------
// Finding the person's installed claude program
// ---------------------------------------------------------------------------

let cachedPath: string | null = null;
let cachedAt = 0;

function isFile(p: string): boolean {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function subdirs(d: string): string[] {
  try {
    return fs.readdirSync(d, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => path.join(d, e.name));
  } catch {
    return [];
  }
}

/** Every copy of Claude Code on this computer we know how to find. */
function candidates(): string[] {
  const win = process.platform === "win32";
  const exeName = win ? "claude.exe" : "claude";
  const out: string[] = [];
  const dirs = (process.env.PATH || process.env.Path || "").split(path.delimiter).filter(Boolean);
  for (const d of dirs) {
    out.push(path.join(d, exeName));
    // npm global install on Windows puts a claude.cmd shim on PATH; Node can't spawn
    // .cmd files without a shell, so use the real program it points to.
    if (win && isFile(path.join(d, "claude.cmd"))) out.push(path.join(d, "node_modules", "@anthropic-ai", "claude-code", "bin", "claude.exe"));
  }
  out.push(path.join(os.homedir(), ".local", "bin", exeName), path.join(os.homedir(), ".claude", "local", exeName));
  if (win) out.push(path.join(process.env.APPDATA || "", "npm", "node_modules", "@anthropic-ai", "claude-code", "bin", "claude.exe"));
  else out.push("/usr/local/bin/claude", "/opt/homebrew/bin/claude");
  // Claude desktop keeps its own copy of Claude Code (claude-code/<version>/<build>/claude)
  // and updates it itself, so it is usually the newest one on the computer.
  const desktopRoots = win
    ? [path.join(process.env.APPDATA || "", "Claude", "claude-code")]
    : [path.join(os.homedir(), "Library", "Application Support", "Claude", "claude-code"), path.join(os.homedir(), ".config", "Claude", "claude-code")];
  for (const root of desktopRoots) for (const v of subdirs(root)) for (const b of [v, ...subdirs(v)]) out.push(path.join(b, exeName));
  return [...new Set(out)].filter(isFile);
}

const versionCache = new Map<string, { mtime: number; version: string | null }>();

/** "2.1.295" for a copy of Claude Code, or null if it won't say. */
export function claudeVersion(p: string): string | null {
  let mtime = 0;
  try {
    mtime = fs.statSync(p).mtimeMs;
  } catch {
    return null;
  }
  const hit = versionCache.get(p);
  if (hit && hit.mtime === mtime) return hit.version;
  let version: string | null = null;
  try {
    const out = execFileSync(p, ["--version"], { env: engineEnv() as NodeJS.ProcessEnv, timeout: 10_000, windowsHide: true }).toString();
    version = out.match(/\d+\.\d+\.\d+/)?.[0] || null;
  } catch {
    version = null;
  }
  versionCache.set(p, { mtime, version });
  return version;
}

function newer(a: string | null, b: string | null): boolean {
  if (!a) return false;
  if (!b) return true;
  const x = a.split(".").map(Number);
  const y = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  return false;
}

/**
 * The Claude Code program Protégé runs: PROTEGE_CLAUDE_PATH if set, otherwise the newest
 * copy on the computer. Re-checked every 10 minutes so updates are picked up.
 */
export function findClaude(): string | null {
  const fromEnv = setting("CLAUDE_PATH");
  if (fromEnv && isFile(fromEnv)) return fromEnv;
  if (cachedPath && isFile(cachedPath) && Date.now() - cachedAt < 10 * 60_000) return cachedPath;
  let best: string | null = null;
  let bestV: string | null = null;
  for (const c of candidates()) {
    const v = claudeVersion(c);
    if (!best || newer(v, bestV)) {
      best = c;
      bestV = v;
    }
  }
  cachedPath = best;
  cachedAt = Date.now();
  return best;
}

const isDesktopCopy = (p: string) => /[\\/]Claude[\\/]claude-code[\\/]/i.test(p);

/**
 * Update the person's own Claude Code install (`claude update`), then re-pick the newest copy.
 * Claude desktop's copy is left alone: desktop updates that one itself.
 */
export async function updateClaude(): Promise<{ ok: boolean; version: string | null; message: string }> {
  const own = candidates().filter((c) => !isDesktopCopy(c));
  let exe: string | null = null;
  for (const c of own) if (!exe || newer(claudeVersion(c), claudeVersion(exe))) exe = c;
  if (!exe) return { ok: false, version: null, message: "Claude Code here comes with Claude desktop; update Claude desktop to update it." };
  const out = await new Promise<{ code: number; text: string }>((resolve) => {
    execFile(exe, ["update"], { env: engineEnv() as NodeJS.ProcessEnv, timeout: 5 * 60_000, windowsHide: true }, (e, stdout, stderr) =>
      resolve({ code: e ? Number((e as any).code) || 1 : 0, text: `${stdout || ""}\n${stderr || ""}` })
    );
  });
  cachedPath = null;
  const now = findClaude();
  const version = now ? claudeVersion(now) : null;
  const last = out.text.split("\n").map((l) => l.trim()).filter(Boolean).pop() || "";
  return { ok: out.code === 0, version, message: last };
}

// ---------------------------------------------------------------------------
// Headless Claude Code
// ---------------------------------------------------------------------------

const TMP_DIR = path.join(process.cwd(), "data", "tmp");

function writeTemp(text: string): string {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const p = path.join(TMP_DIR, `prompt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.txt`);
  fs.writeFileSync(p, text, "utf8");
  return p;
}

function buildArgs(o: any, tempFiles: string[]): string[] {
  const args = ["-p", "--output-format", "stream-json", "--verbose"];
  if (o.model) args.push("--model", String(o.model));
  if (o.permissionMode && o.permissionMode !== "default") args.push("--permission-mode", String(o.permissionMode));
  if (o.effort) args.push("--effort", String(o.effort));
  if (o.maxTurns != null) args.push("--max-turns", String(o.maxTurns));
  if (o.maxBudgetUsd != null) args.push("--max-budget-usd", String(o.maxBudgetUsd));
  if (o.resume) args.push("--resume", String(o.resume));
  if (o.includePartialMessages) args.push("--include-partial-messages");
  if (o.persistSession === false) args.push("--no-session-persistence");
  if (Array.isArray(o.settingSources)) args.push("--setting-sources", o.settingSources.join(","));
  if (Array.isArray(o.tools)) args.push("--tools", o.tools.join(","));
  if (Array.isArray(o.allowedTools) && o.allowedTools.length) args.push("--allowedTools", o.allowedTools.join(","));
  if (Array.isArray(o.disallowedTools) && o.disallowedTools.length) args.push("--disallowedTools", o.disallowedTools.join(","));
  // Same meaning as the SDK: a string replaces the default system prompt; a preset object appends.
  // Passed through files so long prompts don't hit Windows' command-line limit.
  const sp = o.systemPrompt;
  if (typeof sp === "string" && sp) {
    const f = writeTemp(sp);
    tempFiles.push(f);
    args.push("--system-prompt-file", f);
  } else if (sp && typeof sp === "object" && sp.append) {
    const f = writeTemp(String(sp.append));
    tempFiles.push(f);
    args.push("--append-system-prompt-file", f);
  }
  return args;
}

function killTree(child: ChildProcess) {
  if (child.exitCode != null || child.killed) return;
  if (process.platform === "win32" && child.pid) {
    execFile("taskkill", ["/pid", String(child.pid), "/T", "/F"], () => {});
  } else {
    try {
      child.kill("SIGTERM");
    } catch {
      /* ignore */
    }
  }
}

async function* cliQuery(prompt: string, o: any): AsyncGenerator<any, void> {
  const exe = findClaude();
  if (!exe) throw new Error(NOT_INSTALLED);

  const tempFiles: string[] = [];
  const args = buildArgs(o, tempFiles);
  const child = spawn(exe, args, {
    cwd: o.cwd || process.cwd(),
    env: engineEnv({ ...(o.env || {}), CLAUDE_AGENT_SDK_CLIENT_APP: "protege" }) as NodeJS.ProcessEnv,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });

  let spawnError: Error | null = null;
  child.on("error", (e: any) => {
    spawnError = e?.code === "ENOENT" ? new Error(NOT_INSTALLED) : e;
  });
  let stderrTail = "";
  child.stderr?.on("data", (b: Buffer) => {
    stderrTail = (stderrTail + b.toString("utf8")).slice(-2000);
  });

  const abort: AbortController | undefined = o.abortController;
  const onAbort = () => killTree(child);
  abort?.signal.addEventListener("abort", onAbort);

  // The prompt goes in on stdin (no quoting or length problems).
  child.stdin?.on("error", () => {});
  child.stdin?.end(prompt, "utf8");

  const exited = new Promise<number | null>((resolve) => child.on("close", (code) => resolve(code)));
  let sawResult = false;
  try {
    const rl = readline.createInterface({ input: child.stdout!, crlfDelay: Infinity });
    for await (const line of rl) {
      const s = line.trim();
      if (!s || s[0] !== "{") continue;
      let msg: any;
      try {
        msg = JSON.parse(s);
      } catch {
        continue;
      }
      if (msg.type === "result") sawResult = true;
      yield msg;
    }
    const code = await exited;
    if (spawnError) throw spawnError;
    if (!sawResult && !abort?.signal.aborted) {
      if (SIGNED_OUT_RE.test(stderrTail) || /\/login/.test(stderrTail)) throw new Error(NOT_SIGNED_IN);
      throw new Error(`Claude Code stopped unexpectedly (exit ${code}). ${stderrTail.trim().split("\n").slice(-3).join(" ")}`.trim());
    }
  } finally {
    abort?.signal.removeEventListener("abort", onAbort);
    killTree(child);
    for (const f of tempFiles) fs.promises.unlink(f).catch(() => {});
  }
}

/** For a status line in the UI: which engine runs tasks, and whether Claude Code was found. */
export function engineInfo() {
  const p = findClaude();
  return { engine: ENGINE, claudePath: p, claudeVersion: p ? claudeVersion(p) : null, allowApiKey: ALLOW_API_KEY };
}

// ---------------------------------------------------------------------------
// Sign-in check: asks the installed claude program whether it has a login.
// ---------------------------------------------------------------------------

export interface AuthStatus {
  engine: EngineName;
  installed: boolean;
  claudePath: string | null;
  claudeVersion?: string | null;
  loggedIn: boolean;
  authMethod?: string;
  email?: string;
  subscriptionType?: string;
  /** Set when the check itself could not run; the UI then says nothing rather than guessing. */
  checkError?: string;
  checkedAt: number;
}

let authCache: AuthStatus | null = null;
const AUTH_TTL_MS = 30_000;

export async function authStatus(refresh = false): Promise<AuthStatus> {
  if (!refresh && authCache && Date.now() - authCache.checkedAt < AUTH_TTL_MS) return authCache;
  const exe = findClaude();
  const base = { engine: ENGINE, claudePath: exe, claudeVersion: exe ? claudeVersion(exe) : null, checkedAt: Date.now() };
  if (!exe) return (authCache = { ...base, installed: false, loggedIn: false });
  const out = await new Promise<{ stdout: string; err?: string }>((resolve) => {
    execFile(
      exe,
      ["auth", "status"],
      { env: engineEnv() as NodeJS.ProcessEnv, timeout: 15_000, windowsHide: true },
      // `auth status` exits 1 when signed out but still prints its JSON.
      (e, stdout) => resolve({ stdout: String(stdout || ""), err: e && !stdout ? String(e.message || e) : undefined })
    );
  });
  try {
    const j = JSON.parse(out.stdout.slice(out.stdout.indexOf("{")));
    authCache = {
      ...base,
      installed: true,
      loggedIn: !!j.loggedIn,
      authMethod: j.authMethod,
      email: j.email,
      subscriptionType: j.subscriptionType,
    };
  } catch {
    authCache = { ...base, installed: true, loggedIn: true, checkError: out.err || "could not read `claude auth status`" };
  }
  return authCache;
}

// ---------------------------------------------------------------------------
// Live conversations (the Chat page)
// ---------------------------------------------------------------------------

/**
 * Start a long-lived Claude Code process for one conversation, the way Claude desktop runs one.
 * Messages are fed in as they are typed, tool calls can be approved one by one (canUseTool),
 * and the run can be interrupted, re-moded or re-modelled while it is open.
 *
 * Uses the Agent SDK's control protocol, but points it at the person's installed claude
 * program (when there is one) so the chat uses their own sign-in, like tasks do.
 */
export function liveQuery(prompt: AsyncIterable<SDKUserMessage>, options: Options): Query {
  const exe = findClaude();
  return sdkQuery({
    prompt,
    options: {
      ...options,
      env: engineEnv(options.env as any),
      ...(exe ? { pathToClaudeCodeExecutable: exe } : {}),
    },
  });
}

/** For a live conversation's first message: null if it may go ahead, else why it was stopped. */
export function initProblem(m: any): string | null {
  if (m?.type !== "system" || m.subtype !== "init" || ALLOW_API_KEY) return null;
  const s = String(m.apiKeySource ?? "none");
  return PLAN_SOURCES.has(s) ? null : apiKeyMessage(s);
}

export { NOT_SIGNED_IN };

// ---------------------------------------------------------------------------
// Signing in: Claude Code's own sign-in, in a window of its own.
// Protégé opens `claude auth login` in a separate terminal window. Claude Code opens the Claude
// sign-in page in the browser; the person signs in there and, if the page shows a code, pastes
// it into that window. The code goes straight to Claude Code: Protégé never sees or handles
// it. Protégé only watches `claude auth status` to see when the sign-in has finished.
// ---------------------------------------------------------------------------

export interface LoginState {
  status: "idle" | "waiting" | "done" | "failed";
  message?: string;
  startedAt?: number;
}

const gl = globalThis as unknown as { __protegeLoginState?: LoginState };

/** Open a command in a new terminal window the person can see and type into. */
function openInWindow(exe: string, args: string[], title: string): void {
  if (process.platform === "win32") {
    // `start` opens a new console window; the cmd.exe that runs it closes straight away.
    const line = `start "${title}" "${exe}" ${args.join(" ")}`;
    spawn("cmd.exe", ["/d", "/c", line], {
      env: engineEnv() as NodeJS.ProcessEnv,
      detached: true,
      stdio: "ignore",
      windowsHide: true,
      windowsVerbatimArguments: true,
    }).unref();
    return;
  }
  const q = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;
  const cmd = [exe, ...args].map(q).join(" ");
  if (process.platform === "darwin") {
    spawn("osascript", ["-e", `tell application "Terminal" to do script ${JSON.stringify(cmd)}`, "-e", 'tell application "Terminal" to activate'], {
      detached: true,
      stdio: "ignore",
    }).unref();
    return;
  }
  // Linux and others: the first terminal program found.
  const dirs = (process.env.PATH || "").split(path.delimiter).filter(Boolean);
  const has = (b: string) => dirs.some((d) => isFile(path.join(d, b)));
  const term = [
    ["x-terminal-emulator", "-e"],
    ["gnome-terminal", "--"],
    ["konsole", "-e"],
    ["xfce4-terminal", "-x"],
    ["xterm", "-e"],
  ].find(([b]) => has(b));
  if (!term) throw new Error("Couldn't find a terminal program to open the sign-in in.");
  spawn(term[0], [term[1], exe, ...args], { env: engineEnv() as NodeJS.ProcessEnv, detached: true, stdio: "ignore" }).unref();
}

export async function loginState(): Promise<LoginState> {
  const cur = gl.__protegeLoginState || { status: "idle" };
  if (cur.status !== "waiting") return cur;
  // Give up waiting after 15 minutes; the window can simply be opened again.
  if (Date.now() - (cur.startedAt || 0) > 15 * 60_000) return (gl.__protegeLoginState = { status: "idle" });
  const s = await authStatus(true);
  if (s.loggedIn) return (gl.__protegeLoginState = { status: "done" });
  return cur;
}

export function startLogin(): LoginState {
  const exe = findClaude();
  if (!exe) return (gl.__protegeLoginState = { status: "failed", message: NOT_INSTALLED });
  try {
    openInWindow(exe, ["auth", "login", "--claudeai"], "Sign in to Claude");
  } catch (e: any) {
    return (gl.__protegeLoginState = { status: "failed", message: String(e?.message || e) });
  }
  return (gl.__protegeLoginState = { status: "waiting", startedAt: Date.now() });
}
