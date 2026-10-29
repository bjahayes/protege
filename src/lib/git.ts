import { execFile } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { promisify } from "util";
import { createHash } from "crypto";
import type { DiffFile, JobDiff } from "./types";
import { gitExe } from "./git-bin";

const pexec = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return pexec(gitExe(), args, { cwd, maxBuffer: 1024 * 1024 * 64, windowsHide: true });
}

export async function isGitRepo(dir: string): Promise<boolean> {
  try {
    const { stdout } = await git(dir, ["rev-parse", "--is-inside-work-tree"]);
    return stdout.trim() === "true";
  } catch {
    return false;
  }
}

export async function headRef(dir: string): Promise<string | null> {
  try {
    const { stdout } = await git(dir, ["rev-parse", "HEAD"]);
    return stdout.trim();
  } catch {
    return null;
  }
}

export async function currentBranch(dir: string): Promise<string | null> {
  try {
    const { stdout } = await git(dir, ["rev-parse", "--abbrev-ref", "HEAD"]);
    return stdout.trim();
  } catch {
    return null;
  }
}

export async function isClean(dir: string): Promise<boolean> {
  try {
    const { stdout } = await git(dir, ["status", "--porcelain"]);
    return stdout.trim().length === 0;
  } catch {
    return false;
  }
}

/** Paths with changes not saved in the project's history (from `git status`). */
export async function unsavedPaths(dir: string): Promise<string[]> {
  try {
    const { stdout } = await git(dir, ["status", "--porcelain", "-z"]);
    // Entries are "XY path", NUL-separated; a rename adds the old path as its own entry.
    const parts = stdout.split("\0").filter(Boolean);
    const out: string[] = [];
    for (let i = 0; i < parts.length; i++) {
      const code = parts[i].slice(0, 2);
      out.push(parts[i].slice(3));
      if (code[0] === "R" || code[0] === "C") i++;
    }
    return out;
  } catch {
    return [];
  }
}

/** Who a commit is from: the project's own git identity, or "Protégé" if it has none. */
async function identity(dir: string): Promise<string[]> {
  try {
    const { stdout } = await git(dir, ["config", "user.email"]);
    if (stdout.trim()) return [];
  } catch {
    /* not set */
  }
  return ["-c", "user.name=Protégé", "-c", "user.email=protege@localhost"];
}

/**
 * Save changes in the project's history. With `paths`, only those files; otherwise everything
 * unsaved. Returns false when there was nothing to save.
 */
export async function saveChanges(dir: string, message: string, paths?: string[]): Promise<boolean> {
  if (paths && !paths.length) return false;
  await git(dir, paths ? ["add", "-A", "--", ...paths] : ["add", "-A"]);
  const { stdout } = await git(dir, ["diff", "--cached", "--name-only"]);
  if (!stdout.trim()) return false;
  await git(dir, [...(await identity(dir)), "commit", "--no-verify", "-q", "-m", message.slice(0, 200) || "protege changes"]);
  return true;
}

const META_DIRS = [".protege"];

/**
 * Keep Protégé's own notes (.protege/) out of git's
 * view of the project, via the repository's local ignore list (.git/info/exclude, which is
 * never committed or shared). Then a note Protégé writes never counts as an unsaved change
 * that blocks keeping a change. Notes a project already tracks in git are left as they are.
 */
export async function excludeNotes(repo: string): Promise<void> {
  try {
    const { stdout: tracked } = await git(repo, ["ls-files", "--", ...META_DIRS]);
    if (tracked.trim()) return;
    const { stdout: common } = await git(repo, ["rev-parse", "--git-common-dir"]);
    const gitDir = path.resolve(repo, common.trim());
    const file = path.join(gitDir, "info", "exclude");
    const have = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
    const missing = META_DIRS.map((d) => `/${d}/`).filter((l) => !have.split(/\r?\n/).includes(l));
    if (!missing.length) return;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const sep = have && !have.endsWith("\n") ? "\n" : "";
    fs.appendFileSync(file, `${sep}# Protégé's notes about this project (not part of the project)\n${missing.join("\n")}\n`);
  } catch {
    /* not a git repo, or not writable: nothing to do */
  }
}

/** Copy Protégé's notes from one checkout to another, whole (used for checkpoints and tests). */
export function copyNotes(from: string, to: string): void {
  for (const d of META_DIRS) {
    const src = path.join(from, d);
    if (!fs.existsSync(src)) continue;
    fs.cpSync(src, path.join(to, d), {
      recursive: true,
      force: true,
      filter: (f) => !f.replace(/\\/g, "/").includes(`/${d}/checkpoints`),
    });
  }
}

// What a safe copy's notes looked like when it was made: each file's fingerprint, and the checklist
// itself. Keep copies back only the notes the task changed, and merges the checklist, so two safe
// copies of one project kept one after the other don't undo each other's ticks (or any other note
// changed in the project meanwhile).
const NOTES_MANIFEST = ".from-project.json";
const TASKS = "tasks.json";
const fingerprint = (buf: Buffer) => createHash("sha1").update(buf).digest("hex");

function noteFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string, rel: string) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (r === "checkpoints" || r === NOTES_MANIFEST) continue;
      if (e.isDirectory()) walk(path.join(dir, e.name), r);
      else if (e.isFile()) out.push(r);
    }
  };
  for (const d of META_DIRS) walk(path.join(root, d), "");
  return out;
}

/** Copy the project's notes into a new safe copy, recording what each looked like. */
export function copyNotesIn(repo: string, worktreePath: string): void {
  copyNotes(repo, worktreePath);
  const dir = path.join(worktreePath, META_DIRS[0]);
  if (!fs.existsSync(dir)) return;
  const hashes: Record<string, string> = {};
  for (const r of noteFiles(worktreePath)) hashes[r] = fingerprint(fs.readFileSync(path.join(dir, r)));
  let tasks: unknown = null;
  try {
    tasks = JSON.parse(fs.readFileSync(path.join(dir, TASKS), "utf8"));
  } catch {
    /* no checklist */
  }
  fs.writeFileSync(path.join(dir, NOTES_MANIFEST), JSON.stringify({ hashes, tasks }));
}

type TaskItem = { id: string; [k: string]: unknown };
const taskList = (j: any): TaskItem[] => (Array.isArray(j?.tasks) ? j.tasks.filter((t: any) => t && t.id != null) : []);

/**
 * The checklist after Keep: the project's current list, with what the task changed applied on top
 * (items it added, changed or removed since its safe copy was made). Items the task didn't touch
 * keep the project's version, ticks made meanwhile included.
 */
export function mergeTasks(base: any, ours: any, theirs: any): any {
  const b = new Map(taskList(base).map((t) => [String(t.id), t]));
  const o = taskList(ours); // the project now
  const t = new Map(taskList(theirs).map((x) => [String(x.id), x])); // the safe copy
  const same = (x: unknown, y: unknown) => JSON.stringify(x) === JSON.stringify(y);
  const out: TaskItem[] = [];
  for (const item of o) {
    const id = String(item.id);
    const was = b.get(id);
    const now = t.get(id);
    if (!now) {
      if (was) continue; // the task removed it
      out.push(item); // added in the project meanwhile
    } else out.push(was && same(was, now) ? item : now); // the task's version only where it changed it
  }
  const have = new Set(out.map((x) => String(x.id)));
  for (const [id, item] of t) if (!have.has(id) && !b.has(id)) out.push(item); // the task added it
  return { ...(theirs && typeof theirs === "object" ? theirs : {}), ...(ours && typeof ours === "object" ? ours : {}), tasks: out };
}

/** Copy back, on Keep, only the notes the task changed; merge the checklist. */
export function copyNotesBack(worktreePath: string, repo: string): void {
  const src = path.join(worktreePath, META_DIRS[0]);
  const dst = path.join(repo, META_DIRS[0]);
  let manifest: { hashes: Record<string, string>; tasks: unknown } | null = null;
  try {
    manifest = JSON.parse(fs.readFileSync(path.join(src, NOTES_MANIFEST), "utf8"));
  } catch {
    /* a safe copy from before manifests: copy everything back, as before */
  }
  if (!manifest) return copyNotes(worktreePath, repo);
  for (const r of noteFiles(worktreePath)) {
    const from = path.join(src, r);
    const buf = fs.readFileSync(from);
    if (manifest.hashes[r] === fingerprint(buf)) continue; // the task didn't change it
    const to = path.join(dst, r);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    if (r === TASKS && fs.existsSync(to)) {
      try {
        const merged = mergeTasks(manifest.tasks, JSON.parse(fs.readFileSync(to, "utf8")), JSON.parse(buf.toString("utf8")));
        fs.writeFileSync(to, JSON.stringify(merged, null, 2));
        continue;
      } catch {
        /* unreadable: fall through and take the task's */
      }
    }
    fs.writeFileSync(to, buf);
  }
}

/**
 * Where safe copies live: in your own folder, not the system's temp folder (which Windows' Storage
 * Sense and macOS clear out, taking a change still waiting for Keep with them).
 * PROTEGE_SAFE_COPIES overrides it. config.ts's noise filter keeps these folders out of the projects.
 */
export const WT_ROOT = process.env.PROTEGE_SAFE_COPIES || path.join(os.homedir(), ".protege", "safe-copies");

/** Dependency folders a safe copy shares with its project (linked, not copied: they're large). */
const SHARED_DEPS = ["node_modules"];

/**
 * Link the project's dependency folders into a fresh safe copy, so its checks can run (without them
 * every check fails and auto-fix tries to "fix" the change). Only a folder git ignores is linked,
 * and the link itself is kept out of git, so it's never committed.
 */
async function linkDependencies(repo: string, worktreePath: string): Promise<void> {
  for (const name of SHARED_DEPS) {
    const src = path.join(repo, name);
    const dst = path.join(worktreePath, name);
    try {
      if (!fs.existsSync(src) || fs.lstatSync(src).isSymbolicLink() || !fs.statSync(src).isDirectory() || fs.existsSync(dst)) continue;
      await git(repo, ["check-ignore", "-q", name]); // throws unless git ignores it
      await excludeFromGit(repo, `/${name}`);
      fs.symlinkSync(src, dst, process.platform === "win32" ? "junction" : "dir");
    } catch {
      /* not ignored, or can't link: the safe copy goes without */
    }
  }
}

/** Remove a safe copy's links to its project's dependency folders (only links, never real folders). */
export function unlinkDependencies(worktreePath: string): void {
  for (const name of SHARED_DEPS) {
    const p = path.join(worktreePath, name);
    try {
      if (fs.lstatSync(p).isSymbolicLink()) fs.unlinkSync(p);
    } catch {
      /* not there */
    }
  }
}

/** Add a line to the repository's own ignore list (.git/info/exclude), once. */
async function excludeFromGit(repo: string, line: string): Promise<void> {
  const { stdout: common } = await git(repo, ["rev-parse", "--git-common-dir"]);
  const file = path.join(path.resolve(repo, common.trim()), "info", "exclude");
  const have = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  if (have.split(/\r?\n/).includes(line)) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${have && !have.endsWith("\n") ? "\n" : ""}${line}\n`);
}

export interface WorktreeHandle {
  worktreePath: string;
  branch: string;
  baseRef: string;
}

/** Create an isolated git worktree branched from the repo's current HEAD. */
export async function createWorktree(repo: string, jobId: string): Promise<WorktreeHandle> {
  const base = await headRef(repo);
  if (!base) throw new Error("Repository has no commits to branch from.");
  const branch = `protege/${jobId.slice(0, 8)}`;
  const worktreePath = path.join(WT_ROOT, jobId);
  fs.mkdirSync(WT_ROOT, { recursive: true });
  await excludeNotes(repo);
  await git(repo, ["worktree", "add", "-b", branch, worktreePath, base]);
  // The notes aren't in git, so the new checkout doesn't have them; give it the project's.
  copyNotesIn(repo, worktreePath);
  await linkDependencies(repo, worktreePath);
  return { worktreePath, branch, baseRef: base };
}

/**
 * Stage and commit everything the agent changed in the worktree so the work is
 * captured on the branch. Returns true if a commit was made.
 */
/**
 * Git work on one safe copy runs one thing at a time. When a run ends, its changes are committed
 * while the review, and the panel's story of what changed, read them. Run together, git's index
 * lock makes one of them fail, so a commit could be missed (and Keep would lose the change) or a
 * read could come back empty ("it didn't change anything").
 */
const gq = globalThis as unknown as { __protegeGitQueues?: Map<string, Promise<unknown>> };
const gitQueues = (gq.__protegeGitQueues ||= new Map());
function onePerCopy<T>(dir: string, fn: () => Promise<T>): Promise<T> {
  const key = path.resolve(dir).toLowerCase();
  const run = (gitQueues.get(key) || Promise.resolve()).catch(() => {}).then(fn);
  const tail = run.catch(() => {});
  gitQueues.set(key, tail);
  tail.then(() => {
    if (gitQueues.get(key) === tail) gitQueues.delete(key);
  });
  return run;
}

export function commitWorktree(worktreePath: string, message: string): Promise<boolean> {
  return onePerCopy(worktreePath, () => commitNow(worktreePath, message));
}

async function commitNow(worktreePath: string, message: string): Promise<boolean> {
  try {
    await git(worktreePath, ["add", "-A"]);
    const { stdout } = await git(worktreePath, ["status", "--porcelain"]);
    if (stdout.trim().length === 0) return false;
    await git(worktreePath, [
      ...(await identity(worktreePath)),
      "commit",
      "--no-verify",
      "-m",
      message.slice(0, 200) || "protege agent changes",
    ]);
    return true;
  } catch {
    return false;
  }
}

function parseNumstat(numstat: string, nameStatus: string): DiffFile[] {
  const statusByPath = new Map<string, string>();
  for (const line of nameStatus.split("\n")) {
    const parts = line.split("\t");
    if (parts.length >= 2) {
      const code = parts[0].charAt(0);
      const p = parts[parts.length - 1];
      statusByPath.set(p, code);
    }
  }
  const files: DiffFile[] = [];
  for (const line of numstat.split("\n")) {
    if (!line.trim()) continue;
    const parts = line.split("\t");
    if (parts.length < 3) continue;
    const add = parts[0] === "-" ? 0 : parseInt(parts[0], 10) || 0;
    const del = parts[1] === "-" ? 0 : parseInt(parts[1], 10) || 0;
    const p = parts[2];
    files.push({ path: p, status: statusByPath.get(p) || "M", additions: add, deletions: del, patch: "" });
  }
  return files;
}

/**
 * Diff between the worktree branch tip and the base it was created from. `context` is the lines
 * of unchanged code around each edit (git's default is 3; fewer keeps nearby edits apart).
 */
export async function worktreeDiff(
  handle: {
    worktreePath: string;
    branch?: string;
    baseRef?: string;
  },
  opts: { context?: number } = {}
): Promise<JobDiff> {
  const { worktreePath, branch, baseRef } = handle;
  if (!worktreePath || !fs.existsSync(worktreePath)) {
    return { available: false, reason: "Worktree no longer exists", files: [], totalAdditions: 0, totalDeletions: 0 };
  }
  return onePerCopy(worktreePath, () => diffNow(worktreePath, branch, baseRef, opts));
}

async function diffNow(
  worktreePath: string,
  branch: string | undefined,
  baseRef: string | undefined,
  opts: { context?: number }
): Promise<JobDiff> {
  const base = baseRef || (await headRef(worktreePath));
  if (!base) {
    return { available: false, reason: "No base ref", files: [], totalAdditions: 0, totalDeletions: 0 };
  }
  try {
    // Include committed changes (base..HEAD) plus any still-uncommitted edits.
    await git(worktreePath, ["add", "-A", "-N"]);
    const range = `${base}`;
    const { stdout: numstat } = await git(worktreePath, ["diff", "--numstat", range]);
    const { stdout: nameStatus } = await git(worktreePath, ["diff", "--name-status", range]);
    const files = parseNumstat(numstat, nameStatus);
    // Fetch per-file patches (bounded).
    for (const f of files.slice(0, 60)) {
      try {
        const ctx = opts.context != null ? [`--unified=${opts.context}`] : [];
        const { stdout } = await git(worktreePath, ["diff", ...ctx, range, "--", f.path]);
        f.patch = stdout.length > 40000 ? stdout.slice(0, 40000) + "\n… (truncated)" : stdout;
      } catch {
        f.patch = "";
      }
    }
    const totalAdditions = files.reduce((s, f) => s + f.additions, 0);
    const totalDeletions = files.reduce((s, f) => s + f.deletions, 0);
    return { available: true, branch, baseRef: base, files, totalAdditions, totalDeletions };
  } catch (e: any) {
    return { available: false, reason: e?.message || "diff failed", files: [], totalAdditions: 0, totalDeletions: 0 };
  }
}

export interface ApplyResult {
  ok: boolean;
  message: string;
  /** "unsaved": the project has unsaved changes; `files` lists them. */
  code?: "unsaved";
  files?: string[];
}

/** Merge the worktree branch into the repo's current branch. Requires a clean main tree. */
/**
 * Keep a change made on a safe copy: merge it into the project. If the project has changes not
 * yet saved in its history, nothing happens unless `saveFirst`, which saves them (exactly as
 * they are) before keeping the change. `worktreePath` brings the safe copy's notes back too.
 */
export async function applyWorktree(
  repo: string,
  branch: string,
  opts: { worktreePath?: string; saveFirst?: boolean } = {}
): Promise<ApplyResult> {
  if (!(await isGitRepo(repo))) return { ok: false, message: "This project isn't set up for safe copies." };
  await excludeNotes(repo);
  const unsaved = await unsavedPaths(repo);
  if (unsaved.length) {
    if (!opts.saveFirst) {
      return {
        ok: false,
        code: "unsaved",
        files: unsaved,
        message:
          "This project has changes that aren't saved in its history yet, so this change can't be added on top safely. " +
          "Protégé can save them first, exactly as they are, and then keep this change.",
      };
    }
    try {
      await saveChanges(repo, "Saved by Protégé before keeping a change");
    } catch (e: any) {
      return { ok: false, message: `Couldn't save the project's changes first: ${String(e?.stderr || e?.message || e).split("\n")[0]}` };
    }
  }
  try {
    const { stdout } = await git(repo, [...(await identity(repo)), "merge", "--no-edit", branch]);
    // The change is in now. Copying the notes back can hit a file Windows briefly holds open;
    // try again, and never report a merge that happened as one that failed (or abort it).
    if (opts.worktreePath && fs.existsSync(opts.worktreePath)) {
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          copyNotesBack(opts.worktreePath, repo);
          break;
        } catch {
          if (attempt < 3) await new Promise((r) => setTimeout(r, 300 * attempt));
        }
      }
    }
    return { ok: true, message: stdout.trim() || `Merged ${branch}.` };
  } catch (e: any) {
    const msg = String(e?.stderr || e?.stdout || e?.message || "merge failed");
    // Abort a conflicted merge so the repo is left clean.
    try {
      await git(repo, ["merge", "--abort"]);
    } catch {
      /* ignore */
    }
    return { ok: false, message: `Merge failed (aborted): ${msg.split("\n")[0]}` };
  }
}

/** Undo a change that was already applied (merged) by reverting the commits its branch introduced. */
export async function revertJobChange(repo: string, baseRef?: string, branch?: string): Promise<ApplyResult> {
  if (!branch || !baseRef) return { ok: false, message: "This change can't be undone automatically." };
  if (!(await isGitRepo(repo))) return { ok: false, message: "Not set up for automatic undo." };
  if (!(await isClean(repo))) {
    return { ok: false, message: "There are unsaved changes in the project — deal with those first." };
  }
  try {
    await git(repo, [...(await identity(repo)), "revert", "--no-edit", `${baseRef}..${branch}`]);
    return { ok: true, message: "Change undone." };
  } catch (e: any) {
    try {
      await git(repo, ["revert", "--abort"]);
    } catch {
      /* ignore */
    }
    const msg = String(e?.stderr || e?.message || "revert failed").split("\n")[0];
    return { ok: false, message: `Couldn't undo automatically: ${msg}` };
  }
}

/** Remove the worktree and delete its branch. */
export async function removeWorktree(repo: string, worktreePath?: string, branch?: string): Promise<void> {
  if (worktreePath) {
    // First the links to the project's dependency folders: `git worktree remove --force` deletes
    // through a link, which would empty the project's own node_modules.
    unlinkDependencies(worktreePath);
    try {
      await git(repo, ["worktree", "remove", "--force", worktreePath]);
    } catch {
      try {
        fs.rmSync(worktreePath, { recursive: true, force: true });
        await git(repo, ["worktree", "prune"]);
      } catch {
        /* ignore */
      }
    }
  }
  if (branch) {
    try {
      await git(repo, ["branch", "-D", branch]);
    } catch {
      /* ignore */
    }
  }
}
