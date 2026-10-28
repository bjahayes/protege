// Checks Keep on a safe copy, end to end on a throwaway git repository (no model calls):
//   npm run test:keep
// It runs with no git identity configured, as a new user's computer might be.
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { applyWorktree, commitWorktree, createWorktree, saveChanges, unsavedPaths, removeWorktree } from "../src/lib/git.ts";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "protege-keep-test-"));
const emptyConfig = path.join(tmp, "empty.gitconfig");
fs.writeFileSync(emptyConfig, "");
process.env.GIT_CONFIG_GLOBAL = emptyConfig;
process.env.GIT_CONFIG_NOSYSTEM = "1";

const repo = path.join(tmp, "project");
fs.mkdirSync(repo);
const git = (...a: string[]) => execFileSync("git", a, { cwd: repo }).toString();
git("init", "-q");
fs.writeFileSync(path.join(repo, "notes.txt"), "first line\n");
git("add", ".");
git("-c", "user.name=t", "-c", "user.email=t@example.invalid", "commit", "-q", "-m", "init");
// Protégé's notes exist in the project but aren't part of it.
fs.mkdirSync(path.join(repo, ".protege"));
fs.writeFileSync(path.join(repo, ".protege", "tasks.json"), JSON.stringify({ tasks: [{ id: "1", title: "Add a line", status: "todo" }] }));

let failures = 0;
const check = (ok: boolean, what: string) => {
  console.log(`${ok ? "pass" : "FAIL"}  ${what}`);
  if (!ok) failures++;
};

const wt = await createWorktree(repo, "keeptest-0000-0000");
check(fs.existsSync(path.join(wt.worktreePath, ".protege", "tasks.json")), "the safe copy starts with the project's notes");
// The "agent" changes a file and ticks the task off, in the safe copy.
fs.appendFileSync(path.join(wt.worktreePath, "notes.txt"), "added by the task\n");
fs.writeFileSync(path.join(wt.worktreePath, ".protege", "tasks.json"), JSON.stringify({ tasks: [{ id: "1", title: "Add a line", status: "done" }] }));
check(await commitWorktree(wt.worktreePath, "task change"), "the change is committed in the safe copy, with no git identity set");
check((await unsavedPaths(repo)).length === 0, "Protégé's notes don't count as unsaved changes in the project");

// Meanwhile the person edits a file in the project and doesn't save it to history.
fs.writeFileSync(path.join(repo, "mine.txt"), "my own edit\n");
const first = await applyWorktree(repo, wt.branch, { worktreePath: wt.worktreePath });
check(!first.ok && first.code === "unsaved" && !!first.files?.includes("mine.txt"), "Keep stops with a plain message naming the unsaved file");
check(!/stash|commit/i.test(first.message), "the message doesn't tell the person to commit or stash");

const second = await applyWorktree(repo, wt.branch, { worktreePath: wt.worktreePath, saveFirst: true });
check(second.ok, "Save them and keep: the change is kept");
check(fs.readFileSync(path.join(repo, "notes.txt"), "utf8").includes("added by the task"), "the task's change is in the project");
check(fs.readFileSync(path.join(repo, "mine.txt"), "utf8") === "my own edit\n", "the person's own edit is kept exactly as it was");
check(/"done"/.test(fs.readFileSync(path.join(repo, ".protege", "tasks.json"), "utf8")), "the checklist update came back from the safe copy");
check((await unsavedPaths(repo)).length === 0, "nothing is left unsaved afterwards");
await removeWorktree(repo, wt.worktreePath, undefined);

// A direct run saves only what it changed.
fs.writeFileSync(path.join(repo, "draft.txt"), "an unsaved draft\n");
const before = new Set(await unsavedPaths(repo));
fs.appendFileSync(path.join(repo, "notes.txt"), "a direct run's edit\n");
const changed = (await unsavedPaths(repo)).filter((p) => !before.has(p));
check(await saveChanges(repo, "protege: direct run", changed), "a direct run's change is saved to history");
const left = await unsavedPaths(repo);
check(left.length === 1 && left[0] === "draft.txt", "a file that was already unsaved before the run is left alone");

fs.rmSync(tmp, { recursive: true, force: true });
console.log(failures ? `${failures} failed` : "all passed");
if (failures) process.exit(1);
