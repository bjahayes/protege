// Checks Keep on a safe copy, end to end on a throwaway git repository (no model calls):
//   npm run test:keep
// It runs with no git identity configured, as a new user's computer might be.
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { applyWorktree, commitWorktree, createWorktree, saveChanges, unsavedPaths, removeWorktree, worktreeDiff } from "../src/lib/git.ts";

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

// When a run ends, its change is committed while the review and the panel read it: all at once.
const wt2 = await createWorktree(repo, "racetest-0000-0000");
fs.appendFileSync(path.join(wt2.worktreePath, "notes.txt"), "the run's change\n");
const [d1, committed, d2] = await Promise.all([
  worktreeDiff({ worktreePath: wt2.worktreePath, baseRef: wt2.baseRef }),
  commitWorktree(wt2.worktreePath, "task change"),
  worktreeDiff({ worktreePath: wt2.worktreePath, baseRef: wt2.baseRef }, { context: 1 }),
]);
check(committed, "the change is committed while it's being read");
check(d1.available && d1.files.some((f) => f.path === "notes.txt") && d2.available && d2.files.some((f) => f.path === "notes.txt"), "reads at the same moment both see the change");
await removeWorktree(repo, wt2.worktreePath, wt2.branch);

// Two safe copies of one project, kept one after the other: neither undoes the other's checklist
// ticks, and a note the second didn't change isn't put back to how it was when it was made.
fs.rmSync(path.join(repo, "draft.txt"), { force: true }); // left unsaved by an earlier check
const tasksFile = path.join(repo, ".protege", "tasks.json");
const twoTasks = { tasks: [{ id: "a", title: "First", status: "todo" }, { id: "b", title: "Second", status: "todo" }] };
fs.writeFileSync(tasksFile, JSON.stringify(twoTasks));
fs.writeFileSync(path.join(repo, ".protege", "plain-summary.md"), "old summary\n");
const wtA = await createWorktree(repo, "keepaaaa-0000-0000");
const wtB = await createWorktree(repo, "keepbbbb-0000-0000");
const tick = (wt: { worktreePath: string }, id: string) => {
  const f = path.join(wt.worktreePath, ".protege", "tasks.json");
  const j = JSON.parse(fs.readFileSync(f, "utf8"));
  j.tasks.find((t: any) => t.id === id).status = "done";
  fs.writeFileSync(f, JSON.stringify(j));
};
tick(wtA, "a");
fs.appendFileSync(path.join(wtA.worktreePath, "notes.txt"), "first change\n");
fs.writeFileSync(path.join(wtA.worktreePath, ".protege", "plain-summary.md"), "new summary\n");
await commitWorktree(wtA.worktreePath, "first");
tick(wtB, "b");
fs.writeFileSync(path.join(wtB.worktreePath, "second.txt"), "second change\n");
await commitWorktree(wtB.worktreePath, "second");
const keepA = await applyWorktree(repo, wtA.branch, { worktreePath: wtA.worktreePath });
check(keepA.ok, `the first safe copy is kept (${keepA.message})`);
check((await applyWorktree(repo, wtB.branch, { worktreePath: wtB.worktreePath })).ok, "the second safe copy is kept");
const after = JSON.parse(fs.readFileSync(tasksFile, "utf8")).tasks.map((t: any) => `${t.id}:${t.status}`).join(",");
check(after === "a:done,b:done", `both checklist ticks survive (${after})`);
check(fs.readFileSync(path.join(repo, ".protege", "plain-summary.md"), "utf8") === "new summary\n", "a note the second copy didn't change isn't put back to its old version");
await removeWorktree(repo, wtA.worktreePath, wtA.branch);
await removeWorktree(repo, wtB.worktreePath, wtB.branch);

// A safe copy shares the project's node_modules (so checks can run), and removing the safe copy
// never empties the project's own.
fs.writeFileSync(path.join(repo, ".gitignore"), "node_modules/\n");
git("add", ".gitignore");
git("-c", "user.name=t", "-c", "user.email=t@example.invalid", "commit", "-q", "-m", "ignore deps");
fs.mkdirSync(path.join(repo, "node_modules", "pkg"), { recursive: true });
fs.writeFileSync(path.join(repo, "node_modules", "pkg", "index.js"), "module.exports = 1;\n");
const dep = await createWorktree(repo, "depslink-0000-0000");
check(fs.existsSync(path.join(dep.worktreePath, "node_modules", "pkg", "index.js")), "the safe copy can see the project's node_modules");
fs.appendFileSync(path.join(dep.worktreePath, "notes.txt"), "dep change\n");
await commitWorktree(dep.worktreePath, "dep change");
const files = execFileSync("git", ["show", "--name-only", "--pretty=format:", "HEAD"], { cwd: dep.worktreePath }).toString().trim();
check(files === "notes.txt", `the link to node_modules isn't committed (${files.replace(/\n/g, ", ")})`);
await removeWorktree(repo, dep.worktreePath, dep.branch);
check(fs.existsSync(path.join(repo, "node_modules", "pkg", "index.js")), "removing the safe copy leaves the project's node_modules alone");

fs.rmSync(tmp, { recursive: true, force: true });
console.log(failures ? `${failures} failed` : "all passed");
if (failures) process.exit(1);
