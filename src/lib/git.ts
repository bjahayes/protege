import { execFile } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { promisify } from "util";
import type { DiffFile, JobDiff } from "./types";

const pexec = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return pexec("git", args, { cwd, maxBuffer: 1024 * 1024 * 64, windowsHide: true });
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

const META_DIRS = [".protege", ".buildwork"];

/**
 * Keep Protégé's own notes (.protege/, and .buildwork/ from before the rename) out of git's
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

/** Copy Protégé's notes from one checkout to another (into a safe copy, or back on Keep). */
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

const WT_ROOT = path.join(os.tmpdir(), "protege-worktrees");

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
  copyNotes(repo, worktreePath);
  return { worktreePath, branch, baseRef: base };
}

/**
 * Stage and commit everything the agent changed in the worktree so the work is
 * captured on the branch. Returns true if a commit was made.
 */
export async function commitWorktree(worktreePath: string, message: string): Promise<boolean> {
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

/** Diff between the worktree branch tip and the base it was created from. */
export async function worktreeDiff(handle: {
  worktreePath: string;
  branch?: string;
  baseRef?: string;
}): Promise<JobDiff> {
  const { worktreePath, branch, baseRef } = handle;
  if (!worktreePath || !fs.existsSync(worktreePath)) {
    return { available: false, reason: "Worktree no longer exists", files: [], totalAdditions: 0, totalDeletions: 0 };
  }
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
        const { stdout } = await git(worktreePath, ["diff", range, "--", f.path]);
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
    if (opts.worktreePath && fs.existsSync(opts.worktreePath)) copyNotes(opts.worktreePath, repo);
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
